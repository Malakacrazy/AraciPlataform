"use client";

// NENHUM import estático de "@excalidraw/excalidraw" (nem de board-scene.ts/
// use-board-sync.ts, que importam a lib de verdade) pode entrar neste
// arquivo -- "use client" continua sendo server-rendered pro HTML
// inicial, e o pacote toca `window` já na avaliação do módulo (achado
// real rodando isto contra um build de produção Turbopack num navegador
// de verdade: "ReferenceError: window is not defined" no servidor). O
// <Excalidraw> em si e todo o hook de sync moram em excalidraw-canvas.tsx,
// alcançado só através do next/dynamic ssr:false abaixo.
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
// import type -- erased em tempo de compilação, nunca entra no bundle de
// runtime do servidor (diferente de um import de VALOR da mesma lib, ver
// comentário no topo do arquivo).
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { parseInitialScene } from "@/lib/initial-scene";
import type { MoodboardComment } from "@/lib/types";

const ExcalidrawCanvas = dynamic(
  () => import("./excalidraw-canvas").then((mod) => mod.ExcalidrawCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Carregando quadro…
      </div>
    ),
  },
);

interface Props {
  boardId: string;
  // Tag de todo evento reportado ao Sentry por este componente (ver §6.1
  // do plano de migração tldraw->Excalidraw) -- "staff" | "client" |
  // "guest", os três surfaces que o embutem (mesmo vocabulário de
  // MoodboardCommentAuthorType em moodboards.service.ts).
  surface: "staff" | "client" | "guest";
  // Moodboard.scene (formato Excalidraw) -- NUNCA Moodboard.snapshot (o
  // tldraw antigo, ver D1/D3 do plano: nenhum conversor, boards antigos
  // abrem em branco, o snapshot original fica intacto no banco).
  initialScene: unknown;
  initialComments: MoodboardComment[];
  // Server action já parcialmente aplicada (bind) pelo chamador -- cada
  // um dos três surfaces (tela do projeto, link de apresentação, portal
  // do convidado) resolve sua própria identidade/escopo antes de passar
  // a função aqui; este componente não sabe nem precisa saber qual é.
  // O shape aceito bate com o lado novo da união em
  // moodboardSnapshotInputSchema (apps/api/src/ffe/moodboards.service.ts).
  onSaveSnapshot: (scene: {
    schemaVersion: number;
    elements: readonly unknown[];
    appState: { viewBackgroundColor: string };
  }) => Promise<void>;
  onAddComment: (body: string) => Promise<MoodboardComment>;
  // Recarrega os comentários da fonte de verdade (apps/api). Chamado
  // quando o canal avisa que ALGUÉM comentou -- ver o porquê de não
  // confiar no conteúdo do aviso em use-board-sync.ts.
  onRefreshComments: () => Promise<MoodboardComment[]>;
  // JWT curto, escopado a este quadro, emitido pelo servidor só depois de
  // autorizar a pessoa (ver lib/supabaseBoardToken.ts). null = Supabase
  // não configurado -> quadro funciona sem sincronização ao vivo.
  realtimeToken: string | null;
  // Prefixo das três Route Handlers de imagem da Fase 2/4f (nunca Server
  // Actions, ver lib/binaryProxy.ts) -- cada surface monta o seu:
  // "/api/moodboards/:id/files" (staff), "/present/:token/files/:id"
  // (cliente), "/quadro/files/:id" (convidado). PUT/GET de um fileId vira
  // `${filesBaseUrl}/${fileId}`.
  filesBaseUrl: string;
}

// Migração tldraw->Excalidraw (ver plano completo em §5 do documento):
// canvas livre + chat, sincronizados entre quem está olhando ao mesmo
// tempo via um canal Realtime do Supabase (broadcast puro, sem tabela do
// Supabase envolvida -- ver lib/supabaseRealtime.ts). Postgres continua
// sendo o sistema de registro; o canal só acelera a entrega pra quem já
// está com a página aberta, nunca é a única cópia do dado. A lógica de
// sincronização em si (os cinco blockers B1-B5 que a revisão do plano
// encontrou) mora inteira em lib/use-board-sync.ts, alcançada só pelo
// componente client-only (ver comentário no topo).
export function CollaborativeBoard({
  boardId,
  surface,
  initialScene,
  initialComments,
  onSaveSnapshot,
  onAddComment,
  onRefreshComments,
  realtimeToken,
  filesBaseUrl,
}: Props) {
  const [comments, setComments] = useState(initialComments);
  const [commentBody, setCommentBody] = useState("");
  const [sending, setSending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const notifyCommentRef = useRef<(() => void) | null>(null);

  // Achado A59, aplicado no carregamento (o backend já aplica a mesma
  // disciplina ao SALVAR, ver moodboardSnapshotInputSchema) -- restore()/
  // restoreElements() da própria lib NUNCA lançam, então um `scene`
  // corrompido silenciosamente viraria um quadro vazio, e o debounce de
  // save escreveria esse vazio por cima do único conteúdo salvo. `scene`
  // ausente (board novo, ou board antigo que só tem o `snapshot` do
  // tldraw) não é uma falha -- é só "ainda não tem nada no formato
  // novo", abre em branco normalmente (D1 do plano).
  const parsed = useMemo(() => {
    if (initialScene == null) {
      return { failed: false, elements: [] as ExcalidrawElement[], viewBackgroundColor: undefined as string | undefined };
    }
    const result = parseInitialScene(initialScene);
    if (!result) {
      console.error("[quadro] scene inválida, abrindo com o quadro vazio");
      Sentry.captureException(new Error("scene inválida no load"), { tags: { surface, boardId } });
      return { failed: true, elements: [] as ExcalidrawElement[], viewBackgroundColor: undefined as string | undefined };
    }
    return {
      failed: false,
      elements: result.elements as ExcalidrawElement[],
      viewBackgroundColor: result.viewBackgroundColor,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reavalia
    // quando o próprio scene muda; surface/boardId são estáveis por mount.
  }, [initialScene]);

  async function handleSendComment() {
    const body = commentBody.trim();
    if (!body) return;
    setSending(true);
    try {
      const comment = await onAddComment(body);
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
      notifyCommentRef.current?.();
    } catch (err) {
      console.error((err as Error).message);
      Sentry.captureException(err, { tags: { surface, boardId } });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {parsed.failed && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Não foi possível abrir o conteúdo salvo desta prancha — ela foi aberta em branco.
        </p>
      )}
      {saveError && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {saveError}
        </p>
      )}
      <div style={{ position: "relative", height: 560 }} className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        <ExcalidrawCanvas
          boardId={boardId}
          surface={surface}
          realtimeToken={realtimeToken}
          filesBaseUrl={filesBaseUrl}
          initialElements={parsed.elements}
          initialViewBackgroundColor={parsed.viewBackgroundColor ?? "#ffffff"}
          loadFailed={parsed.failed}
          onSaveSnapshot={onSaveSnapshot}
          onSaveErrorChange={setSaveError}
          onRemoteComment={() => {
            onRefreshComments()
              .then(setComments)
              .catch((err) => {
                console.warn((err as Error).message);
                Sentry.captureException(err, { tags: { surface, boardId } });
              });
          }}
          onNotifyCommentReady={(fn) => {
            notifyCommentRef.current = fn;
          }}
        />
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
