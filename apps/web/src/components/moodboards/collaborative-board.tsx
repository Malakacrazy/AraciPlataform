"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, getSnapshot, loadSnapshot, type TLStoreSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { createBoardChannel } from "@/lib/supabaseRealtime";
import type { MoodboardComment } from "@/lib/types";

const SNAPSHOT_SAVE_DEBOUNCE_MS = 2000;

interface Props {
  boardId: string;
  initialSnapshot: unknown;
  initialComments: MoodboardComment[];
  // Server action já parcialmente aplicada (bind) pelo chamador -- cada
  // um dos três surfaces (tela do projeto, link de apresentação, portal
  // do convidado) resolve sua própria identidade/escopo antes de passar
  // a função aqui; este componente não sabe nem precisa saber qual é.
  onSaveSnapshot: (snapshot: TLStoreSnapshot) => Promise<void>;
  onAddComment: (body: string) => Promise<MoodboardComment>;
  // Recarrega os comentários da fonte de verdade (apps/api). Chamado
  // quando o canal avisa que ALGUÉM comentou -- ver o porquê de não
  // confiar no conteúdo do aviso em BroadcastPayload abaixo.
  onRefreshComments: () => Promise<MoodboardComment[]>;
  // JWT curto, escopado a este quadro, emitido pelo servidor só depois de
  // autorizar a pessoa (ver lib/supabaseBoardToken.ts). null = Supabase
  // não configurado -> quadro funciona sem sincronização ao vivo.
  realtimeToken: string | null;
}

// O canal é um relay entre navegadores: mesmo com canal privado (só quem
// foi autorizado naquele quadro entra), qualquer participante legítimo
// ainda pode montar a mensagem que quiser. Por isso "comment" carrega só
// um AVISO de que houve comentário novo, nunca o comentário em si -- se
// carregasse, um participante conseguiria exibir um comentário com o nome
// de outra pessoa pra todo mundo, sem nunca tocar no banco (achado de
// revisão de segurança). O conteúdo sempre vem do apps/api.
// "patch" continua carregando o dado porque é o traço em andamento, que
// por definição ainda não existe no banco -- e ali o estrago possível é
// desenhar coisa errada num quadro que a pessoa já podia editar mesmo.
type BroadcastPayload =
  | { kind: "patch"; put: unknown[]; remove: string[] }
  | { kind: "comment" };

// Correção "moodboard vira quadro tldraw", colaboração ao vivo pedida
// junto: canvas livre de verdade (tldraw) + chat, sincronizados entre
// quem está olhando ao mesmo tempo via um canal Realtime do Supabase
// (broadcast puro, sem tabela do Supabase envolvida -- ver
// lib/supabaseRealtime.ts). Postgres continua sendo o sistema de
// registro: o canvas é salvo com debounce (não a cada traço) e os
// comentários são persistidos a cada envio; o canal só acelera a entrega
// pra quem já está com a página aberta, nunca é a única cópia do dado.
export function CollaborativeBoard({
  boardId,
  initialSnapshot,
  initialComments,
  onSaveSnapshot,
  onAddComment,
  onRefreshComments,
  realtimeToken,
}: Props) {
  const store = useMemo(() => createTLStore({ shapeUtils: defaultShapeUtils }), []);
  const [comments, setComments] = useState(initialComments);
  const [commentBody, setCommentBody] = useState("");
  const [sending, setSending] = useState(false);
  // Achado A58/A59 da auditoria de 30 ago 2026: nem carregar nem salvar o
  // snapshot tinham tratamento de erro -- uma rejeição (snapshot
  // corrompido/de versão incompatível do tldraw, ou um save que falhou)
  // virava exceção não tratada, sem nenhum sinal na tela.
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialSnapshot) return;
    try {
      loadSnapshot(store, initialSnapshot as TLStoreSnapshot);
    } catch (err) {
      // Achado A59: loadSnapshot lançando dentro de um useEffect sobe até
      // o error boundary e derruba a página inteira (FF&E do estúdio ou
      // /present do cliente) de forma persistente -- degrada pra store
      // vazio em vez disso; o conteúdo original continua no banco
      // (só não é exibido), então nada é perdido além da exibição.
      console.error(`[quadro] snapshot inválido, abrindo com o quadro vazio: ${(err as Error).message}`);
      setSaveError("Não foi possível abrir o conteúdo salvo desta prancha — ela foi aberta em branco.");
    }
  }, [store, initialSnapshot]);

  const channelRef = useRef<ReturnType<typeof createBoardChannel>["channel"] | null>(null);

  useEffect(() => {
    // Sem token não há canal privado -- degrada pra "sem sincronização ao
    // vivo", não quebra o canvas/chat em si (salvar/enviar continuam
    // funcionando, só sem retransmissão instantânea pra outra aba).
    if (!realtimeToken) {
      return;
    }
    let board: ReturnType<typeof createBoardChannel>;
    try {
      board = createBoardChannel(boardId, realtimeToken);
    } catch (err) {
      console.warn((err as Error).message);
      return;
    }
    const { channel } = board;
    channelRef.current = channel;

    channel.on("broadcast", { event: "board" }, ({ payload }: { payload: BroadcastPayload }) => {
      if (payload.kind === "patch") {
        store.mergeRemoteChanges(() => {
          if (payload.put.length > 0) store.put(payload.put as Parameters<typeof store.put>[0]);
          if (payload.remove.length > 0) store.remove(payload.remove as Parameters<typeof store.remove>[0]);
        });
      } else if (payload.kind === "comment") {
        // Só o aviso chega pelo canal -- o conteúdo vem do apps/api, que
        // é quem sabe quem de fato escreveu (ver BroadcastPayload).
        onRefreshComments()
          .then(setComments)
          .catch((err) => console.warn((err as Error).message));
      }
    });
    // Sem este callback, falhar em entrar no canal era 100% silencioso --
    // o quadro seguia funcionando (salvar/comentar vão pelo apps/api,
    // não pelo canal), mas "não atualiza pro outro em tempo real" não
    // deixava nenhuma pista de por quê. O motivo mais provável em
    // produção é a policy de realtime.messages não estar aplicada no
    // projeto Supabase (ver docs/fase-0/supabase-realtime-policy.sql):
    // sem ela o canal privado recusa todo mundo, que é o padrão seguro,
    // mas precisa ser diagnosticável.
    channel.subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(
          `[quadro] sincronização ao vivo indisponível (${status}): ${err?.message ?? "sem detalhe"} -- o quadro continua salvando normalmente.`,
        );
      }
    });

    return () => {
      channel.unsubscribe();
      // Achado A61: desliga o CLIENT desta prancha (não um singleton
      // compartilhado) -- cada CollaborativeBoard tem o seu próprio desde
      // a correção, então isto nunca afeta a conexão de outra prancha
      // montada na mesma página.
      board.disconnect();
      channelRef.current = null;
    };
  }, [store, boardId, realtimeToken, onRefreshComments]);

  useEffect(() => {
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    // .document, não o TLEditorSnapshot inteiro -- session (câmera,
    // ferramenta selecionada) é por pessoa, salvar isso serviria só pra
    // empurrar a câmera de quem salvou por último em cima de todo mundo
    // que reabrir a prancha depois.
    // Achado A58: onSaveSnapshot é uma promise (server action) chamada
    // sem .catch() -- um 413 (corpo grande demais, ver SNAPSHOT_BODY_LIMIT
    // em main.ts) ou qualquer outra falha de rede virava unhandled
    // rejection no console, sem NENHUM sinal na tela: a pessoa desenhava
    // achando que estava salvo, fechava a aba, e o trabalho sumia.
    const flush = () =>
      onSaveSnapshot(getSnapshot(store).document)
        .then(() => setSaveError(null))
        .catch((err) => {
          console.error(`[quadro] falha ao salvar o snapshot: ${(err as Error).message}`);
          setSaveError("Não foi possível salvar as últimas alterações desta prancha.");
        });

    const unlisten = store.listen(
      (entry) => {
        const put = [
          ...Object.values(entry.changes.added),
          ...Object.values(entry.changes.updated).map(([, to]) => to),
        ];
        const remove = Object.keys(entry.changes.removed);

        if (put.length > 0 || remove.length > 0) {
          channelRef.current?.send({ type: "broadcast", event: "board", payload: { kind: "patch", put, remove } });
        }

        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveTimeout = null;
          flush();
        }, SNAPSHOT_SAVE_DEBOUNCE_MS);
      },
      { source: "user", scope: "document" },
    );

    return () => {
      unlisten();
      // Achado real de revisão: cancelar o timeout sem descarregar
      // perdia silenciosamente o último traço se a pessoa navegasse pra
      // outra rota (troca de projeto, etc.) dentro da janela de debounce.
      // Fecho de aba/refresh continua fora do alcance disto -- exigiria
      // beforeunload + sendBeacon, e onSaveSnapshot é uma server action
      // (fetch), não compatível com beacon sem reescrevê-la.
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        flush();
      }
    };
  }, [store, onSaveSnapshot]);

  async function handleSendComment() {
    const body = commentBody.trim();
    if (!body) return;
    setSending(true);
    try {
      const comment = await onAddComment(body);
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
      // Só avisa que houve comentário -- quem recebe busca o conteúdo no
      // apps/api (ver BroadcastPayload).
      channelRef.current?.send({ type: "broadcast", event: "board", payload: { kind: "comment" } });
    } catch (err) {
      console.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {saveError && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {saveError}
        </p>
      )}
      <div style={{ position: "relative", height: 560 }} className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        <Tldraw store={store} />
      </div>

      <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Chat</h3>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum comentário ainda.</p>
        ) : (
          <ul className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto">
            {comments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{c.authorName}</span>{" "}
                <span className="text-zinc-700 dark:text-zinc-300">{c.body}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-center gap-2">
          <input
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sending) handleSendComment();
            }}
            placeholder="Comentar…"
            className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={handleSendComment}
            disabled={sending}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
