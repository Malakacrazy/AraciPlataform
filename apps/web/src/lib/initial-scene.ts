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
  // Quantos elementos do `scene` gravado foram descartados por
  // isSaneRemoteElement. Não é detalhe interno: quem chama LOGA e manda
  // pro Sentry (ver CollaborativeBoard) -- descartar conteúdo salvo em
  // silêncio é exatamente o que a regra 12 proíbe.
  droppedElements: number;
}
// ---------------------------------------------------------------------
// Guarda por elemento. Vive AQUI, não em board-scene.ts, porque os dois
// caminhos precisam dela e este módulo é o único dos dois que pode ser
// importado do escopo server-rendered (nenhum import de
// @excalidraw/excalidraw, ver o comentário no topo). board-scene.ts a
// reexporta pro canal e pros testes.
// ---------------------------------------------------------------------

// `index` é fractional-indexing puro (string comparada com </>, ver
// fractional-indexing no package.json da própria lib) -- NÃO faz parte
// do critério de desempate do reconcile (isso é version/versionNonce).
// Sem validar o formato, um `"zzzzzz"` forjado pina um elemento acima de
// tudo em todo peer, PERMANENTEMENTE (persistido no próximo save) --
// achado B da revisão do plano, §5.1 passo 2.
const INDEX_PATTERN = /^[a-zA-Z0-9]{1,32}$/;

// Sem teto real na lib (version é só um number incrementado por
// mutateElement) -- este teto é só uma defesa contra um forjado
// absurdo (Infinity, 1e300), generoso o bastante pra nunca ser
// alcançado por edição de verdade (dezenas de milhões de versões).
const MAX_PLAUSIBLE_VERSION = 10_000_000;

const MAX_ID_LENGTH = 256;

// Filtro de sanidade por elemento -- ver §5.1 passo 2 do plano. object;
// id string curto; type string; version inteiro seguro sob teto; index
// no formato certo. Não valida mais que isso: restoreElements (chamado
// depois, com repairBindings desligado) é quem garante a forma completa
// do elemento -- isto aqui só barra o que restoreElements NÃO rejeitaria
// sozinho (um `index` ou `version` forjado continuam "válidos" o
// bastante pra passar por restore/reconcile normalmente, é aí que o
// estrago some).
export function isSaneRemoteElement(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const el = value as Record<string, unknown>;
  if (typeof el.id !== "string" || el.id.length === 0 || el.id.length >= MAX_ID_LENGTH) return false;
  if (typeof el.type !== "string" || el.type.length === 0) return false;
  if (!Number.isSafeInteger(el.version) || (el.version as number) < 0 || (el.version as number) > MAX_PLAUSIBLE_VERSION) {
    return false;
  }
  if (typeof el.index !== "string" || !INDEX_PATTERN.test(el.index)) return false;
  return true;
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
  // A MESMA guarda do caminho do canal, aplicada ao que vem do Postgres.
  // Antes, um `version: 9e15` (ou um `index: "zzzz..."`) forjado só era
  // barrado no broadcast: bastava mandá-lo pelo PATCH de snapshot pra
  // ele ser gravado e, a partir daí, vencer o reconcile de TODO peer pra
  // sempre -- nenhuma edição legítima conseguiria mais sobrepor aquele
  // elemento, em nenhuma tela. O apps/api passou a recusar isso na
  // escrita (excalidrawSnapshotSchema); isto aqui é o outro lado, pra que
  // uma linha já envenenada abra saudável em vez de ficar inutilizável.
  const sane = obj.elements.filter(isSaneRemoteElement);
  return {
    elements: sane,
    viewBackgroundColor,
    droppedElements: obj.elements.length - sane.length,
  };
}
