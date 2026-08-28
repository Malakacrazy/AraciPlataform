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
}

type BroadcastPayload =
  | { kind: "patch"; put: unknown[]; remove: string[] }
  | { kind: "comment"; comment: MoodboardComment };

// Correção "moodboard vira quadro tldraw", colaboração ao vivo pedida
// junto: canvas livre de verdade (tldraw) + chat, sincronizados entre
// quem está olhando ao mesmo tempo via um canal Realtime do Supabase
// (broadcast puro, sem tabela do Supabase envolvida -- ver
// lib/supabaseRealtime.ts). Postgres continua sendo o sistema de
// registro: o canvas é salvo com debounce (não a cada traço) e os
// comentários são persistidos a cada envio; o canal só acelera a entrega
// pra quem já está com a página aberta, nunca é a única cópia do dado.
export function CollaborativeBoard({ boardId, initialSnapshot, initialComments, onSaveSnapshot, onAddComment }: Props) {
  const store = useMemo(() => createTLStore({ shapeUtils: defaultShapeUtils }), []);
  const [comments, setComments] = useState(initialComments);
  const [commentBody, setCommentBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (initialSnapshot) {
      loadSnapshot(store, initialSnapshot as TLStoreSnapshot);
    }
  }, [store, initialSnapshot]);

  const channelRef = useRef<ReturnType<typeof createBoardChannel> | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof createBoardChannel>;
    try {
      channel = createBoardChannel(boardId);
    } catch (err) {
      // Supabase não configurado -- degrada pra "sem sincronização ao
      // vivo", não quebra o canvas/chat em si (salvar/enviar continuam
      // funcionando, só sem retransmissão instantânea pra outra aba).
      console.warn((err as Error).message);
      return;
    }
    channelRef.current = channel;

    channel.on("broadcast", { event: "board" }, ({ payload }: { payload: BroadcastPayload }) => {
      if (payload.kind === "patch") {
        store.mergeRemoteChanges(() => {
          if (payload.put.length > 0) store.put(payload.put as Parameters<typeof store.put>[0]);
          if (payload.remove.length > 0) store.remove(payload.remove as Parameters<typeof store.remove>[0]);
        });
      } else if (payload.kind === "comment") {
        setComments((prev) => (prev.some((c) => c.id === payload.comment.id) ? prev : [...prev, payload.comment]));
      }
    });
    channel.subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [store, boardId]);

  useEffect(() => {
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

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
          // .document, não o TLEditorSnapshot inteiro -- session (câmera,
          // ferramenta selecionada) é por pessoa, salvar isso serviria só
          // pra empurrar a câmera de quem salvou por último em cima de
          // todo mundo que reabrir a prancha depois.
          onSaveSnapshot(getSnapshot(store).document);
        }, SNAPSHOT_SAVE_DEBOUNCE_MS);
      },
      { source: "user", scope: "document" },
    );

    return () => {
      unlisten();
      if (saveTimeout) clearTimeout(saveTimeout);
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
      channelRef.current?.send({ type: "broadcast", event: "board", payload: { kind: "comment", comment } });
    } catch (err) {
      console.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
