// Helpers puros em torno da cena do Excalidraw -- ver plano de migração
// tldraw->Excalidraw §5.1 (e §5.1.1 pros cinco blockers B1-B5 que a
// revisão do plano encontrou). Este módulo não conhece Supabase nem
// React; só embrulha `restoreElements`/`reconcileElements` da própria
// lib com as defesas que elas NÃO fazem sozinhas, pra poder ser testado
// isoladamente.
//
// SÓ importado por use-board-sync.ts, que só é importado por
// excalidraw-canvas.tsx (atrás de next/dynamic ssr:false) -- nunca por
// collaborative-board.tsx diretamente. O import de "@excalidraw/excalidraw"
// abaixo toca `window` já na avaliação do módulo (Popover.tsx, medição de
// texto); um "use client" comum ainda é server-rendered pro HTML inicial,
// então importar isto de um componente que NÃO está atrás do boundary
// dynamic derruba o SSR com "window is not defined" (achado real rodando
// contra um build de produção, não só teoria -- ver parseInitialScene em
// lib/initial-scene.ts, que existe secamente pra não precisar deste
// import no componente externo).
import { restoreElements, reconcileElements, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

import { isSaneRemoteElement } from "@/lib/initial-scene";

export { CaptureUpdateAction };
// Reexportado daqui porque o canal (use-board-sync.ts) e os testes
// tratam board-scene.ts como a fachada do núcleo de sincronização -- a
// DEFINIÇÃO vive em initial-scene.ts, que é livre de import do pacote,
// pra que o caminho de PERSISTÊNCIA (parseInitialScene, server-rendered)
// possa aplicar exatamente a mesma guarda que o caminho do canal. Duas
// cópias da mesma regra era o bug: só o canal filtrava.
export { isSaneRemoteElement };

// Campos ignorados na "impressão digital" de conteúdo de um elemento
// (ver contentFingerprint abaixo) -- version/versionNonce/updated mudam
// em TODO mutateElement, inclusive quando só o índice foi renormalizado
// por syncInvalidIndices (ver App.tsx / achado B3 da revisão: roda
// dentro de reconcileElements, restoreElements E updateScene, sempre que
// os fractional indices colidem, e SEMPRE bump version mesmo sem
// nenhuma mudança visível). `index` também fica de fora -- é
// exatamente o campo que syncInvalidIndices normaliza; comparar por ele
// tornaria toda renormalização "conteúdo diferente" de novo.
const FINGERPRINT_IGNORED_KEYS = new Set(["version", "versionNonce", "updated", "index"]);

// "Mudou de verdade" pro watermark de saída (ver use-board-sync.ts) --
// não "a version subiu". syncInvalidIndices bump version/versionNonce
// em elementos cujo conteúdo visível não mudou nada (só o índice
// fracionário foi renormalizado); tratar isso como dirty faria o board
// reenviar/regravar elementos que ninguém editou, e pior, "roubar" o
// watermark de um elemento que o peer remetente nunca viu nessa versão
// (achado B3). Comparação estrutural simples (JSON.stringify das chaves
// restantes) -- a ordem das chaves de um ExcalidrawElement é estável
// entre chamadas (mesmo objeto sempre construído com os mesmos campos,
// mutateElement muta in-place), então não precisa de um hash canônico.
export function contentFingerprint(element: ExcalidrawElement): string {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(element)) {
    if (!FINGERPRINT_IGNORED_KEYS.has(key)) {
      out[key] = (element as unknown as Record<string, unknown>)[key];
    }
  }
  return JSON.stringify(out);
}

// Passo 3 do plano (§5.1): restoreElements(elements, null) -- o segundo
// argumento PRECISA ser null (não a cena local). Ele é `localElements`,
// anotado "doesn't serve for reconciliation" no código da própria lib
// (restore.ts) -- passar a cena local ali faz restoreElements bumpar a
// version do elemento recebido pra vencer uma local mais nova por
// engano, ANTES mesmo do reconcile de verdade rodar. repairBindings
// desligado de propósito: numa DELTA parcial (não a cena inteira), o
// elemento referenciado por frameId/containerId quase sempre está
// ausente deste payload (só chegou o que mudou) -- repairBoundElement/
// repairFrameMembership tratariam "ausente aqui" como "não existe mais"
// e NULARIAM a referência de um elemento que só não fazia parte desta
// mensagem. refreshDimensions fica de fora também: é lido só dentro do
// bloco de repair, então é inerte com repairBindings desligado (achado
// da revisão -- não é uma escolha deliberada que precise de comentário
// próprio, só não faz nada aqui).
export function restoreRemoteDelta(elements: unknown[]): OrderedExcalidrawElement[] {
  const sane = elements.filter(isSaneRemoteElement);
  return restoreElements(sane as ExcalidrawElement[], null, { repairBindings: false });
}

// Passo 5 do plano: reconcileElements(local, remoto, appState). O tipo
// de retorno da própria lib é ReconciledExcalidrawElement -- delegado
// inteiro pra reconcileElements, nunca reimplementado (é o único lugar
// onde um bug sutil de desempate causa divergência permanente e
// silenciosa entre dois clientes, ver §3 do plano).
export function reconcileIncoming(
  local: readonly OrderedExcalidrawElement[],
  restored: OrderedExcalidrawElement[],
  appState: AppState,
) {
  return reconcileElements(local, restored as unknown as readonly RemoteExcalidrawElement[], appState);
}

// Única coisa de AppState que atravessa o canal/Postgres -- ver plano
// §5.1.2: "a linha mais importante do documento". AppState mistura
// scrollX/scrollY/zoom/selectedElementIds/activeTool (sessão de QUEM
// está olhando agora) com campos de documento de verdade, sem nenhum
// split "documento vs sessão". Persistir isso cru recriaria o exato
// bug de câmera-sequestrada que este allowlist existe pra evitar: quem
// salvou por último empurraria sua própria câmera/seleção/ferramenta
// pra cima de todo mundo que reabrisse a prancha depois.
export function pickPersistedAppState(appState: AppState): { viewBackgroundColor: string } {
  return { viewBackgroundColor: appState.viewBackgroundColor };
}

export interface WatermarkEntry {
  version: number;
  fingerprint: string;
}

// id -> última versão/fingerprint que CONFIRMAMOS ter enviado (broadcast
// com ack:true bem-sucedido, ou uma resync de 20s). Não "a version atual
// do elemento" -- ver contentFingerprint acima sobre por que os dois
// divergem.
export type Watermark = ReadonlyMap<string, WatermarkEntry>;

// Quais elementos da cena AINDA não batem com o que o watermark diz que
// já foi enviado -- usado tanto pro flush de broadcast quanto (extraído
// pra fora do hook) testável sem precisar de uma instância real do
// Excalidraw. B1: logo após semear o watermark com a cena de mount,
// chamar isto com a MESMA cena devolve [] (nada dirty) -- é essa
// propriedade que impede o rebroadcast da cena inteira no mount.
export function computeDirtyElements(
  elements: readonly OrderedExcalidrawElement[],
  sent: Watermark,
): OrderedExcalidrawElement[] {
  const dirty: OrderedExcalidrawElement[] = [];
  for (const el of elements) {
    const prev = sent.get(el.id);
    if (!prev || prev.fingerprint !== contentFingerprint(el)) {
      dirty.push(el);
    }
  }
  return dirty;
}

export function seedWatermark(elements: readonly OrderedExcalidrawElement[]): Map<string, WatermarkEntry> {
  const sent = new Map<string, WatermarkEntry>();
  for (const el of elements) {
    sent.set(el.id, { version: el.version, fingerprint: contentFingerprint(el) });
  }
  return sent;
}

export interface ApplyRemoteDeltaResult {
  reconciled: OrderedExcalidrawElement[];
  // id -> novo valor do watermark; null = REMOVER a entrada (força
  // reenvio no próximo flush, ver achado B2 abaixo). Devolvido em vez de
  // mutar o watermark do chamador diretamente -- mantém esta função
  // pura/testável.
  watermarkUpdates: Map<string, WatermarkEntry | null>;
}

// Núcleo do receive path (passos 2-6 do plano §5.1), extraído do hook
// pra poder ser testado sem uma instância de Excalidraw montada. null
// devolvido quando NENHUM elemento do payload passa em isSaneRemoteElement
// (mensagem descartável, nada a fazer).
export function applyRemoteDelta(
  local: readonly OrderedExcalidrawElement[],
  incomingRaw: readonly unknown[],
  sent: Watermark,
  appState: AppState,
): ApplyRemoteDeltaResult | null {
  const sane = incomingRaw.filter(isSaneRemoteElement);
  if (sane.length === 0) return null;

  const restored = restoreRemoteDelta(sane);
  const reconciled = reconcileIncoming(local, restored, appState);
  const reconciledById = new Map(reconciled.map((e) => [e.id, e]));

  const watermarkUpdates = new Map<string, WatermarkEntry | null>();
  for (const remote of restored) {
    const merged = reconciledById.get(remote.id);
    if (!merged) continue;
    const fp = contentFingerprint(merged);

    if (merged.versionNonce === remote.versionNonce) {
      // O objeto remoto venceu o desempate -- em dia com o que o peer
      // mandou, não precisa reenviar.
      watermarkUpdates.set(remote.id, { version: merged.version, fingerprint: fp });
      continue;
    }

    // O local venceu este elemento sobre a atualização remota recebida.
    const prevSent = sent.get(remote.id);
    if (prevSent && prevSent.fingerprint === fp) {
      // B3: só version/index foram renormalizados por syncInvalidIndices
      // (roda dentro de reconcileElements mesmo quando o objeto local é
      // o vencedor) -- conteúdo idêntico ao que já confirmamos ter
      // enviado, só atualiza o watermark, não é dirty de verdade.
      watermarkUpdates.set(remote.id, { version: merged.version, fingerprint: fp });
    } else {
      // B2: o local venceu um conflito de VERDADE contra uma edição
      // independente de um peer. Do lado do peer, o update dele "ganhou"
      // a mesma disputa simetricamente (mesma lógica de reconcile
      // rodando lá) -- sem forçar isto, nenhum dos dois lados jamais
      // reenvia, e o próximo save de qualquer um sobrescreve o outro
      // sem histórico (interleaving exato do achado B2).
      watermarkUpdates.set(remote.id, null);
    }
  }

  return { reconciled, watermarkUpdates };
}

export function applyWatermarkUpdates(
  sent: Map<string, WatermarkEntry>,
  updates: ReadonlyMap<string, WatermarkEntry | null>,
): void {
  for (const [id, value] of updates) {
    if (value === null) sent.delete(id);
    else sent.set(id, value);
  }
}

// ~20s, bypassa o watermark por elemento inteiramente -- backstop de
// convergência do B2 (colisão texto-vs-estilo, ver use-board-sync.ts).
// O reparo HTTP existente (achado A-quadro anterior) só dispara depois
// de 60s de SILÊNCIO no canal, ou seja, nunca enquanto alguém ainda
// está desenhando -- é esse intervalo "as pessoas ainda estão
// desenhando" que uma resync watermark-blind cobre.
export const SYNC_FULL_SCENE_INTERVAL_MS = 20_000;

// Detector de mudança (não uma ordenação!) -- hashElementsVersion é um
// hash djb2 sobre versionNonce ONDE A ORDEM IMPORTA, não comparável com
// </> e muda numa pura reordenação sem edição de conteúdo nenhuma.
// getSceneVersion é @deprecated unsafe e é uma SOMA simples -- apagar um
// elemento DIMINUI a soma, então duas cenas com conteúdo diferente podem
// ter a "mesma versão". Nunca trocar um pelo outro (achado do plano
// §5.1.2) -- nenhum dos dois é usado neste módulo hoje, documentado
// aqui porque é o lugar mais provável de alguém tentar usar um deles
// como atalho de dirty-check no futuro.
