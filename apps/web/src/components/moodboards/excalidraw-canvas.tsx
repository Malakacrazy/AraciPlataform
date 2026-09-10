"use client";

// Único lugar do app que importa "@excalidraw/excalidraw" (valor, não só
// tipo) -- este arquivo só é alcançado através do next/dynamic ssr:false
// em collaborative-board.tsx. O pacote toca `window` já na avaliação do
// módulo (Popover.tsx, medição de texto/layout), então importar isto de
// QUALQUER caminho que ainda seja server-rendered derruba o SSR com
// "window is not defined" -- achado real rodando contra um build de
// produção (Turbopack) num navegador de verdade, não só teoria. Ver
// board-scene.ts/use-board-sync.ts pro porquê deles ficarem também
// isolados aqui (mesmo import transitivo).
import { useEffect, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useBoardSync } from "@/lib/use-board-sync";

interface Props {
  boardId: string;
  surface: "staff" | "client" | "guest";
  realtimeToken: string | null;
  initialElements: ExcalidrawElement[];
  initialViewBackgroundColor: string;
  loadFailed: boolean;
  onSaveSnapshot: (scene: {
    schemaVersion: number;
    elements: readonly unknown[];
    appState: { viewBackgroundColor: string };
  }) => Promise<void>;
  onSaveErrorChange: (error: string | null) => void;
  onRemoteComment: () => void;
  // Callback (não ref) de propósito -- encaminhar ref através de um
  // boundary next/dynamic é uma aresta viva conhecida da lib; um
  // callback comum não depende de forwardRef nenhum. O componente
  // externo guarda a função recebida numa ref própria (ver
  // collaborative-board.tsx) pra poder chamá-la de um handler de clique.
  onNotifyCommentReady: (notifyComment: () => void) => void;
}

// Fronteira client-only: só o <Excalidraw> em si + o hook de
// sincronização (que faz o trabalho real, ver use-board-sync.ts). O
// componente externo (collaborative-board.tsx) cuida do chat/avisos e
// NUNCA importa nada daqui estaticamente -- só via next/dynamic
// ssr:false, ver comentário no topo.
export function ExcalidrawCanvas({
  boardId,
  surface,
  realtimeToken,
  initialElements,
  initialViewBackgroundColor,
  loadFailed,
  onSaveSnapshot,
  onSaveErrorChange,
  onRemoteComment,
  onNotifyCommentReady,
}: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  const { saveError, notifyComment } = useBoardSync({
    boardId,
    surface,
    realtimeToken,
    excalidrawAPI: api,
    onSaveSnapshot,
    onRemoteComment,
    loadFailed,
  });

  useEffect(() => {
    onSaveErrorChange(saveError);
  }, [saveError, onSaveErrorChange]);

  useEffect(() => {
    onNotifyCommentReady(notifyComment);
  }, [notifyComment, onNotifyCommentReady]);

  return (
    <Excalidraw
      excalidrawAPI={setApi}
      initialData={{ elements: initialElements, appState: { viewBackgroundColor: initialViewBackgroundColor } }}
    />
  );
}
