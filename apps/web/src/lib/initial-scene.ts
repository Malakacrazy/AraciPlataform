// Extraído de board-scene.ts de propósito -- SEM NENHUM import de
// @excalidraw/excalidraw. Esta validação precisa rodar no componente
// EXTERNO (collaborative-board.tsx), que é server-rendered mesmo sendo
// "use client" (só o <Excalidraw> em si fica atrás de next/dynamic
// ssr:false, ver excalidraw-canvas.tsx) -- qualquer import estático de
// @excalidraw/excalidraw nesse escopo entra no bundle do SERVIDOR
// também, e o pacote toca `window` já na avaliação do módulo (Popover.tsx,
// medição de texto), o que derruba o SSR com "window is not defined"
// (achado real rodando isto num browser de verdade contra o build de
// produção -- não só teoria).
export interface InitialScene {
  elements: unknown[];
  viewBackgroundColor?: string;
}

// Achado A59, aplicado ao carregar em vez de só ao salvar (moodboards.
// service.ts do apps/api valida o servidor; isto é a MESMA disciplina no
// cliente, porque restore()/restoreElements() da própria lib NUNCA
// lançam -- um `scene` corrompido ou de formato incompatível vira
// silenciosamente um quadro vazio, e o debounce de 2s escreve esse
// vazio por cima do único conteúdo salvo. Só a forma mínima que TODO
// scene de verdade tem (schemaVersion number, elements array) -- mesma
// disciplina de moodboardSnapshotInputSchema no backend, não acopla
// este componente a uma versão específica do formato de elemento.
export function parseInitialScene(raw: unknown): InitialScene | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.schemaVersion !== "number") return null;
  if (!Array.isArray(obj.elements)) return null;
  const appState = obj.appState;
  const viewBackgroundColor =
    appState && typeof appState === "object" && typeof (appState as Record<string, unknown>).viewBackgroundColor === "string"
      ? ((appState as Record<string, unknown>).viewBackgroundColor as string)
      : undefined;
  return { elements: obj.elements, viewBackgroundColor };
}
