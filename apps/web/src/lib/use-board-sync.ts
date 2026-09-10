"use client";

import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  applyRemoteDelta,
  applyWatermarkUpdates,
  computeDirtyElements,
  contentFingerprint,
  pickPersistedAppState,
  seedWatermark,
  CaptureUpdateAction,
  SYNC_FULL_SCENE_INTERVAL_MS,
} from "@/lib/board-scene";
import { createBoardChannel } from "@/lib/supabaseRealtime";

// Renomeado de "board" -- um cliente tldraw antigo que ainda recebesse
// esta mensagem passaria os elementos do Excalidraw pro store.put do
// tldraw, que LANÇA dentro do callback do canal do Supabase. Um campo de
// versão dentro do payload não bastaria (o cliente antigo já tentaria
// interpretar antes de checar), o nome do evento em si precisa mudar
// (ver plano de migração tldraw->Excalidraw §5.1).
const BOARD_EVENT = "board.v2";

// Trailing-edge -- sempre manda o delta acumulado desde o último flush,
// nunca por onChange individual (~60/s durante um traço).
const BROADCAST_THROTTLE_MS = 100;
const SAVE_DEBOUNCE_MS = 2000;

// ~200KB -- teto informal do payload de UMA mensagem broadcast (ver
// plano §5.1, limite de payload do Supabase Free é 256KB por mensagem).
const MAX_BROADCAST_BYTES = 200_000;

type ElementsPayload = { kind: "elements"; elements: unknown[] };
type CommentPayload = { kind: "comment" };
type BoardPayload = ElementsPayload | CommentPayload;

interface UseBoardSyncOptions {
  boardId: string;
  // "staff" | "client" | "guest" -- tag de todo evento reportado ao
  // Sentry por este hook (ver §6.1 do plano de migração).
  surface: "staff" | "client" | "guest";
  realtimeToken: string | null;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  onSaveSnapshot: (scene: {
    schemaVersion: number;
    elements: readonly OrderedExcalidrawElement[];
    appState: { viewBackgroundColor: string };
  }) => Promise<void>;
  onRemoteComment: () => void;
  // Setado pelo chamador quando o snapshot inicial não validou (achado
  // A59) -- bloqueia TODO save pelo resto do mount; broadcasting
  // continua liberado (ver §5.1.2 do plano: "Broadcasting may continue;
  // persistence must not").
  loadFailed: boolean;
}

// Hook de sincronização do quadro -- ver plano de migração tldraw->
// Excalidraw §5.1/§5.1.1. Os cinco blockers (B1-B5) que a revisão do
// plano encontrou no desenho original estão todos aqui:
//
// B1 (todo mount rebroadcast a cena inteira e todo viewer grava sem
//     pedir): watermark (sentRef) semeado a partir da cena ATUAL antes
//     de qualquer inscrição; hasInteractedRef (via api.onPointerDown)
//     trava broadcast/save até uma interação de verdade acontecer.
// B2 (colisão texto-vs-estilo diverge permanente, depois um save
//     destrói o outro lado): em processIncoming, quando o LOCAL vence
//     um elemento que também veio no payload remoto, força reenvio
//     apagando a entrada do watermark -- mais a resync de cena inteira
//     a cada SYNC_FULL_SCENE_INTERVAL_MS como rede de segurança.
// B3 (syncInvalidIndices infla version só de reordenar índice,
//     "roubando" o watermark do remetente): dirty-check por
//     fingerprint de CONTEÚDO (contentFingerprint em board-scene.ts),
//     não por version -- um bump de version com fingerprint idêntico
//     nunca é tratado como mudança de verdade.
// B4 (o ledger de retry nunca existiu -- send() resolve 'ok' sem
//     round-trip): createBoardChannel usa broadcast:{ack:true} (ver
//     supabaseRealtime.ts), então o status devolvido por channel.send()
//     é real; qualquer coisa != 'ok' vai pro Sentry.
// B5 (dois desenhos aceitos contradiziam sobre `files` no snapshot):
//     resolvido inteiro na Fase 2 (moodboardSnapshotInputSchema rejeita
//     `files`) -- este hook nunca manda/recebe bytes de imagem, só
//     `fileId` como um campo comum do elemento.
export function useBoardSync({
  boardId,
  surface,
  realtimeToken,
  excalidrawAPI,
  onSaveSnapshot,
  onRemoteComment,
  loadFailed,
}: UseBoardSyncOptions) {
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs pra "última versão" de callbacks/flags que mudam de identidade
  // entre renders sem deverem reiniciar o efeito principal -- lidos só
  // dentro dos callbacks assíncronos abaixo (onChange do Excalidraw,
  // callback do canal, timers), nunca durante o render.
  //
  // O token é re-assinado a cada render do servidor (setIssuedAt em
  // mintBoardRealtimeToken), então a STRING muda o tempo todo sem que
  // nada de relevante tenha mudado -- fica na ref também, e o efeito
  // principal depende só de "existe sincronização ao vivo ou não"
  // (hasRealtime, ver deps no fim dele).
  const onSaveSnapshotRef = useRef(onSaveSnapshot);
  const onRemoteCommentRef = useRef(onRemoteComment);
  const loadFailedRef = useRef(loadFailed);
  const realtimeTokenRef = useRef(realtimeToken);
  const hasRealtime = realtimeToken !== null;

  // A atualização vai num efeito, não no corpo do render: escrever em
  // ref.current durante o render é o que a regra react-hooks/refs
  // (eslint-plugin-react-hooks 6) recusa, e com razão -- o render pode
  // ser descartado ou reexecutado. Aqui é seguro porque nenhum leitor
  // roda antes do commit: no mount a ref já nasce com o valor certo
  // (useRef(valor)), e nos renders seguintes este efeito comita antes
  // do próximo traço/timer poder ler.
  useEffect(() => {
    onSaveSnapshotRef.current = onSaveSnapshot;
    onRemoteCommentRef.current = onRemoteComment;
    loadFailedRef.current = loadFailed;
    realtimeTokenRef.current = realtimeToken;
  }, [onSaveSnapshot, onRemoteComment, loadFailed, realtimeToken]);

  const channelRef = useRef<ReturnType<typeof createBoardChannel>["channel"] | null>(null);

  useEffect(() => {
    if (!excalidrawAPI) return;
    const api = excalidrawAPI;

    // B1: semeia o watermark a partir da cena JÁ montada, ANTES de
    // qualquer inscrição -- o próprio init do Excalidraw commita a cena
    // inteira e dispara onChange com tudo "novo" se o mapa começar
    // vazio (App.tsx: syncActionResult junta scene+isLoading:false no
    // mesmo commit). Ver board-scene.ts pro porquê de computeDirtyElements
    // devolver [] pra a MESMA cena logo em seguida.
    const sent = seedWatermark(api.getSceneElementsIncludingDeleted());
    const hasInteracted = { current: false };
    const subscribed = { current: false };
    let inbox: unknown[][] = [];

    const unsubPointerDown = api.onPointerDown(() => {
      hasInteracted.current = true;
    });

    function isMidInteraction(): boolean {
      const s = api.getAppState();
      return Boolean(s.selectedElementsAreBeingDragged || s.editingTextElement || s.resizingElement || s.newElement);
    }

    // Aplica um delta remoto cru (sanitização acontece dentro de
    // applyRemoteDelta) -- passos 2-6 do plano §5.1, núcleo testado
    // isoladamente em board-scene.ts.
    function processIncoming(raw: unknown[]) {
      const local = api.getSceneElementsIncludingDeleted();
      const result = applyRemoteDelta(local, raw, sent, api.getAppState());
      if (!result) return;
      api.updateScene({ elements: result.reconciled, captureUpdate: CaptureUpdateAction.NEVER });
      applyWatermarkUpdates(sent, result.watermarkUpdates);
    }

    function drainInbox() {
      if (inbox.length === 0 || isMidInteraction()) return;
      const batches = inbox;
      inbox = [];
      processIncoming(batches.flat());
    }

    const unsubPointerUp = api.onPointerUp(() => drainInbox());
    const drainRetryTimer = setInterval(drainInbox, 500);

    let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    function flushSave() {
      saveTimer = null;
      // Achado A59: um snapshot inválido no load nunca deve ser
      // sobrescrito por um save automático -- ver CollaborativeBoard.
      // Broadcasting continua liberado (checagem só aqui, não no
      // flushBroadcast abaixo).
      if (loadFailedRef.current) return;
      const elements = api.getSceneElementsIncludingDeleted();
      const appState = api.getAppState();
      onSaveSnapshotRef
        .current({ schemaVersion: 1, elements, appState: pickPersistedAppState(appState) })
        .then(() => setSaveError(null))
        .catch((err) => {
          console.error(`[quadro] falha ao salvar o snapshot: ${(err as Error).message}`);
          Sentry.captureException(err, { tags: { surface, boardId } });
          setSaveError("Não foi possível salvar as últimas alterações desta prancha.");
        });
    }

    // Canal É opcional; salvar NÃO é. Um único caminho pros três casos
    // (sem token, canal falhou ao construir, canal ok) de propósito: a
    // versão anterior tinha três `return` separados, cada um precisando
    // lembrar de registrar tudo -- e o ramo do catch esquecia justamente
    // o api.onChange, então quando createBoardChannel lançava (o caso
    // real: NEXT_PUBLIC_SUPABASE_* ausente ou filtrada no build, que é
    // o que check-deploy-config.mjs existe pra pegar) o quadro nunca
    // mais salvava NADA, sem nenhum sinal na tela. Agora existe uma
    // inscrição de onChange e um cleanup só, e o canal é só um `null`
    // a mais a checar.
    let board: ReturnType<typeof createBoardChannel> | null = null;
    let channel: ReturnType<typeof createBoardChannel>["channel"] | null = null;
    if (realtimeTokenRef.current) {
      try {
        board = createBoardChannel(boardId, realtimeTokenRef.current);
        channel = board.channel;
        channelRef.current = channel;
      } catch (err) {
        console.warn((err as Error).message);
        Sentry.captureException(err, { tags: { surface, boardId } });
        board = null;
        channel = null;
      }
    }

    channel?.on("broadcast", { event: BOARD_EVENT }, ({ payload }: { payload: BoardPayload }) => {
      // Passo 1 do plano §5.1: um throw aqui roda dentro de um callback
      // do Supabase e não alcança nenhum boundary -- mataria a
      // sincronização ao vivo silenciosamente.
      try {
        if (payload.kind === "elements") {
          // isSaneRemoteElement roda dentro de applyRemoteDelta (chamado
          // por processIncoming) -- filtra aqui só decidiria "vale a
          // pena" mais cedo, sem mudar o resultado; mais simples deixar
          // num lugar só.
          if (isMidInteraction()) {
            inbox.push(payload.elements);
            return;
          }
          processIncoming(payload.elements);
        } else if (payload.kind === "comment") {
          onRemoteCommentRef.current();
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { surface, boardId } });
      }
    });

    channel?.subscribe((status, err) => {
      subscribed.current = status === "SUBSCRIBED";
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(
          `[quadro] sincronização ao vivo indisponível (${status}): ${err?.message ?? "sem detalhe"} -- o quadro continua salvando normalmente.`,
        );
        Sentry.captureException(err ?? new Error(`Supabase channel ${status}`), { tags: { surface, boardId } });
      }
    });

    // Fatiar por tamanho em vez de desistir: o receive path é um merge de
    // DELTA (reconcileElements trata payload parcial normalmente), então
    // N mensagens menores convergem igual a uma grande. A versão anterior
    // só pulava a rodada inteira acima do teto -- o que, num quadro
    // grande, significava que o delta nunca era enviado (o watermark não
    // avançava, então na rodada seguinte ele continuava grande demais) e
    // que a resync de 20s, o backstop do B2, nunca funcionava justamente
    // nos quadros que mais precisam dela.
    function chunkBySize(elements: readonly OrderedExcalidrawElement[]): OrderedExcalidrawElement[][] {
      const chunks: OrderedExcalidrawElement[][] = [];
      let current: OrderedExcalidrawElement[] = [];
      let currentSize = 2; // "[]"
      for (const el of elements) {
        const size = new TextEncoder().encode(JSON.stringify(el)).length + 1; // +1 pela vírgula
        if (size > MAX_BROADCAST_BYTES) {
          // Um elemento que sozinho passa do teto não tem como ser
          // fatiado (um freedraw gigante, por exemplo). O save no
          // Postgres continua cobrindo ele; os peers pegam no reload.
          Sentry.captureMessage(`board.v2: elemento ${el.id} sozinho tem ${size} bytes, acima do teto`, {
            tags: { surface, boardId },
          });
          continue;
        }
        if (currentSize + size > MAX_BROADCAST_BYTES && current.length > 0) {
          chunks.push(current);
          current = [];
          currentSize = 2;
        }
        current.push(el);
        currentSize += size;
      }
      if (current.length > 0) chunks.push(current);
      return chunks;
    }

    // Caminho único de envio pros dois casos (delta do throttle e resync
    // de 20s) -- a checagem de tamanho existir só num dos dois foi
    // exatamente o bug acima.
    function sendElements(elements: readonly OrderedExcalidrawElement[], label: string) {
      if (!channel || !subscribed.current) return; // B4/gate: nunca antes de SUBSCRIBED
      for (const chunk of chunkBySize(elements)) {
        channel
          .send({ type: "broadcast", event: BOARD_EVENT, payload: { kind: "elements", elements: chunk } })
          .then((status) => {
            if (status !== "ok") {
              // B4: com broadcast:{ack:true} este status é um round-trip
              // de verdade -- != 'ok' significa que o peer NÃO recebeu.
              Sentry.captureException(new Error(`board.v2 ${label} devolveu "${status}"`), {
                tags: { surface, boardId },
              });
              return;
            }
            for (const el of chunk) sent.set(el.id, { version: el.version, fingerprint: contentFingerprint(el) });
          });
      }
    }

    function flushBroadcast() {
      broadcastTimer = null;
      sendElements(computeDirtyElements(api.getSceneElementsIncludingDeleted(), sent), "delta");
    }

    const unsubOnChange = api.onChange(() => {
      if (!hasInteracted.current) return; // B1
      if (channel && !broadcastTimer) {
        broadcastTimer = setTimeout(flushBroadcast, BROADCAST_THROTTLE_MS);
      }
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    });

    // B2: backstop de convergência -- bypassa o watermark por elemento
    // inteiramente a cada ~20s, resincronizando a cena inteira. O
    // reparo por silêncio de canal (se algum dia existir) não é
    // substituto: só dispararia depois de 60s SEM NADA no canal, ou
    // seja, nunca enquanto alguém ainda está desenhando -- exatamente a
    // janela onde a colisão do B2 acontece.
    const fullResyncTimer = setInterval(() => {
      if (!hasInteracted.current) return;
      sendElements(api.getSceneElementsIncludingDeleted(), "resync de 20s");
    }, SYNC_FULL_SCENE_INTERVAL_MS);

    return () => {
      unsubPointerDown();
      unsubPointerUp();
      unsubOnChange();
      clearInterval(drainRetryTimer);
      clearInterval(fullResyncTimer);
      if (broadcastTimer) clearTimeout(broadcastTimer);
      if (saveTimer) {
        // Achado real de revisão (preservado da versão tldraw): cancelar
        // o timeout sem descarregar perdia silenciosamente o último
        // traço se a pessoa navegasse pra outra rota dentro da janela
        // de debounce.
        clearTimeout(saveTimer);
        flushSave();
      }
      channel?.unsubscribe();
      board?.disconnect();
      channelRef.current = null;
    };
    // onSaveSnapshot/onRemoteComment/loadFailed/realtimeToken são lidos via ref (ver acima)
    // de propósito. Os callbacks são recriados a cada render do Server
    // Component pai (bind()), e o token é RE-ASSINADO a cada render
    // (mintBoardRealtimeToken faz setIssuedAt) -- tê-lo no array de deps
    // fazia um revalidatePath não relacionado (criar um ambiente, convidar
    // alguém, regerar o link) derrubar o canal, re-semear o watermark
    // (marcando como "já enviado" o que ainda não foi) e zerar
    // hasInteracted. O efeito só reinicia quando a sincronização ao vivo
    // aparece/some de verdade, não quando o token roda.
  }, [excalidrawAPI, boardId, surface, hasRealtime]);

  function notifyComment() {
    channelRef.current?.send({ type: "broadcast", event: BOARD_EVENT, payload: { kind: "comment" } });
  }

  return { saveError, notifyComment };
}
