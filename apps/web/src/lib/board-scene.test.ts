import { describe, it, expect } from "vitest";
import { restoreElements, restoreAppState, mutateElement, bumpVersion } from "@excalidraw/excalidraw";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  isSaneRemoteElement,
  computeDirtyElements,
  seedWatermark,
  applyRemoteDelta,
  applyWatermarkUpdates,
  contentFingerprint,
} from "./board-scene";

// Testes do núcleo de sincronização (board-scene.ts) -- ver plano de
// migração tldraw->Excalidraw §8 (bar mínimo de teste) e §5.1.1 (os
// cinco blockers B1-B5 que a revisão do plano encontrou). Cada teste
// aqui prova WHY o comportamento importa (o cenário concreto do plano),
// não só WHAT a função faz -- um teste que não conseguiria falhar se a
// lógica de negócio mudasse estaria errado (regra 9).

// reconcileElements desempata version igual pelo versionNonce, e o
// MENOR ganha -- confirmado rodando reconcileElements de verdade contra o
// 0.18.1 instalado, não lido da documentação. Fixar os nonces é o que
// torna os testes de colisão abaixo determinísticos: sem isso o
// vencedor sai do Math.random() interno do mutateElement e cada rodada
// de CI exercita um caminho diferente (foi exatamente o que a revisão
// pegou -- um `if (winner.versionNonce === aLocal.versionNonce)` sem
// `else` que na metade das execuções não asseverava NADA).
function pinNonces(winner: OrderedExcalidrawElement, loser: OrderedExcalidrawElement): void {
  (winner as { versionNonce: number }).versionNonce = 1;
  (loser as { versionNonce: number }).versionNonce = 2;
}

function baseAppState(): AppState {
  return restoreAppState(null, null) as unknown as AppState;
}

function makeElement(overrides: Partial<ExcalidrawElement> & { id: string }): OrderedExcalidrawElement {
  const [el] = restoreElements(
    [{ type: "rectangle", x: 0, y: 0, width: 100, height: 100, ...overrides } as ExcalidrawElement],
    null,
  );
  return el;
}

describe("isSaneRemoteElement (defesa contra index/version forjados)", () => {
  it("accepts a well-formed element", () => {
    expect(isSaneRemoteElement({ id: "a", type: "rectangle", version: 1, index: "a1" })).toBe(true);
  });

  it("rejects a forged index outside the fractional-indexing alphabet/length", () => {
    // Achado da revisão: `index` é comparado com </> como string, não
    // faz parte do desempate de version -- um "zzzzzz...z" forjado pina
    // o elemento acima de tudo em todo peer, permanentemente.
    expect(isSaneRemoteElement({ id: "a", type: "rectangle", version: 1, index: "z".repeat(40) })).toBe(false);
    expect(isSaneRemoteElement({ id: "a", type: "rectangle", version: 1, index: "" })).toBe(false);
    expect(isSaneRemoteElement({ id: "a", type: "rectangle", version: 1, index: "has space" })).toBe(false);
  });

  it("rejects a forged/absurd version", () => {
    expect(isSaneRemoteElement({ id: "a", type: "rectangle", version: Infinity, index: "a1" })).toBe(false);
    expect(isSaneRemoteElement({ id: "a", type: "rectangle", version: -1, index: "a1" })).toBe(false);
    expect(isSaneRemoteElement({ id: "a", type: "rectangle", version: 1e300, index: "a1" })).toBe(false);
  });

  it("rejects a primitive or an id/type of the wrong shape", () => {
    expect(isSaneRemoteElement(123)).toBe(false);
    expect(isSaneRemoteElement(null)).toBe(false);
    expect(isSaneRemoteElement({ id: "", type: "rectangle", version: 1, index: "a1" })).toBe(false);
    expect(isSaneRemoteElement({ id: "a", type: 5, version: 1, index: "a1" })).toBe(false);
  });
});

describe("B1 -- mount não rebroadcast a cena inteira", () => {
  it("computeDirtyElements devolve [] pra cena recém-semeada", () => {
    const elements = [makeElement({ id: "a" }), makeElement({ id: "b" })];
    // Exatamente o que o hook faz no callback excalidrawAPI, antes de
    // qualquer inscrição no canal (ver use-board-sync.ts).
    const sent = seedWatermark(elements);
    expect(computeDirtyElements(elements, sent)).toEqual([]);
  });

  it("um elemento genuinamente novo (nunca visto) aparece como dirty", () => {
    const elements = [makeElement({ id: "a" })];
    const sent = seedWatermark(elements);
    const withNew = [...elements, makeElement({ id: "b" })];
    const dirty = computeDirtyElements(withNew, sent);
    expect(dirty.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("B3 -- bump de version só por causa do índice não é dirty", () => {
  it("mesmo conteúdo, version diferente (simulando syncInvalidIndices) -> não dirty", () => {
    const original = makeElement({ id: "a", strokeColor: "#000" });
    const sent = seedWatermark([original]);

    // Simula o que syncInvalidIndices faz: mexe SÓ no index e sobe
    // version/versionNonce, sem tocar em nada do conteúdo visível.
    //
    // bumpVersion, não mutateElement(el, {}) -- a primeira versão deste
    // teste usava mutateElement com updates vazio acreditando que isso
    // subia a version, e NÃO sube: ele faz um early-return quando nada
    // mudou (confirmado empiricamente: version ficava em 2, não ia pra
    // 3). Com a version inalterada o teste passava até se
    // computeDirtyElements comparasse por VERSION em vez de fingerprint
    // de conteúdo -- ou seja, não conseguia falhar se o B3 regredisse,
    // que é justamente o único motivo dele existir (regra 9).
    const reindexed = { ...original, index: "a2" } as OrderedExcalidrawElement;
    bumpVersion(reindexed);
    expect(reindexed.version).toBeGreaterThan(original.version);

    const dirty = computeDirtyElements([reindexed], sent);
    expect(dirty).toEqual([]);
  });

  it("uma mudança de conteúdo de verdade continua dirty mesmo com o mesmo padrão de bump", () => {
    const original = makeElement({ id: "a", strokeColor: "#000" });
    const sent = seedWatermark([original]);

    const edited = { ...original } as OrderedExcalidrawElement;
    mutateElement(edited, { strokeColor: "#f00" }, false);

    const dirty = computeDirtyElements([edited], sent);
    expect(dirty.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("B2 -- colisão texto-vs-estilo converge em vez de divergir para sempre", () => {
  it("local vence um conflito que o watermark ainda não sabia ter vencido -> força reenvio", () => {
    const appState = baseAppState();
    const shared = makeElement({ id: "T", type: "rectangle", strokeColor: "#000" });

    // A ainda não confirmou ter enviado a PRÓPRIA edição (ex.: o
    // throttle de ~100ms do broadcast ainda não disparou) quando a
    // mensagem de B chega -- watermark de A ainda reflete o conteúdo
    // ANTIGO (pré-edição), não o que A tem localmente agora.
    const sentA = seedWatermark([shared]);

    const bLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(bLocal, { strokeColor: "#00f" }, false);
    const aLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(aLocal, { strokeColor: "#0f0" }, false);
    pinNonces(aLocal, bLocal); // local (A) vence o desempate

    const result = applyRemoteDelta([aLocal], [bLocal], sentA, appState)!;
    const winner = result.reconciled.find((e) => e.id === "T")!;

    // Local (A) venceu -- o watermark antigo não bate com o conteúdo
    // vencedor, então precisa ficar dirty (nulo = força reenvio no
    // próximo flush de broadcast). Sem isso B nunca fica sabendo que
    // perdeu e as duas telas divergem PRA SEMPRE, que é o B2.
    expect(winner.strokeColor).toBe("#0f0");
    expect(result.watermarkUpdates.get("T")).toBeNull();
  });

  it("remoto vence o mesmo conflito -> A absorve e o watermark passa a refletir o conteúdo remoto", () => {
    // Mesmo cenário, desempate invertido: aqui NÃO há nada que A precise
    // reanunciar (o conteúdo vencedor é o do próprio B, que já o tem),
    // então forçar reenvio seria tráfego puro. É o par que faltava --
    // sem ele, "watermarkUpdates é nulo" poderia estar hardcoded e o
    // teste acima continuaria verde.
    const appState = baseAppState();
    const shared = makeElement({ id: "T", type: "rectangle", strokeColor: "#000" });
    const sentA = seedWatermark([shared]);

    const bLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(bLocal, { strokeColor: "#00f" }, false);
    const aLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(aLocal, { strokeColor: "#0f0" }, false);
    pinNonces(bLocal, aLocal); // remoto (B) vence o desempate

    const result = applyRemoteDelta([aLocal], [bLocal], sentA, appState)!;
    const winner = result.reconciled.find((e) => e.id === "T")!;

    expect(winner.strokeColor).toBe("#00f");
    expect(result.watermarkUpdates.get("T")).not.toBeNull();
    expect(result.watermarkUpdates.get("T")!.fingerprint).toBe(contentFingerprint(bLocal));
  });

  it("local vence e o watermark JÁ bate com o conteúdo vencedor -> não força (fica pro backstop de 20s)", () => {
    // Caso em que A já tinha confirmado ter enviado a própria edição
    // ANTES de processar a mensagem de B -- não há nada NOVO que A
    // precise anunciar por conta própria; a convergência com um B ainda
    // protegido por editingTextElement (não modelado aqui, ver
    // use-board-sync.ts) fica a cargo da resync de 20s, não deste
    // watermark por elemento (o próprio plano avisa: "Do not ship a
    // per-element watermark with no resync").
    const appState = baseAppState();
    const shared = makeElement({ id: "T", type: "rectangle", strokeColor: "#000" });

    const bLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(bLocal, { strokeColor: "#00f" }, false);
    const aLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(aLocal, { strokeColor: "#0f0" }, false);
    pinNonces(aLocal, bLocal); // local (A) vence o desempate

    const sentA = seedWatermark([aLocal]); // A já confirmou ter enviado aLocal

    const result = applyRemoteDelta([aLocal], [bLocal], sentA, appState)!;
    const winner = result.reconciled.find((e) => e.id === "T")!;

    // Sem o pinNonces acima, TODAS as asserções deste teste ficavam
    // dentro de um `if` no vencedor sorteado, sem `else` -- metade das
    // execuções de CI não asseverava nada e o teste passava vazio.
    expect(winner.strokeColor).toBe("#0f0");
    expect(result.watermarkUpdates.get("T")).not.toBeNull();
    expect(result.watermarkUpdates.get("T")!.fingerprint).toBe(contentFingerprint(aLocal));
  });

  it("depois de duas rodadas de troca (cada lado reenviando o que perdeu), os dois convergem pro mesmo vencedor", () => {
    const appState = baseAppState();
    const shared = makeElement({ id: "T", strokeColor: "#000" });

    const bLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(bLocal, { strokeColor: "#00f" }, false);
    const aLocal = { ...shared } as OrderedExcalidrawElement;
    mutateElement(aLocal, { strokeColor: "#0f0" }, false);

    const sentA = seedWatermark([aLocal]);
    const sentB = seedWatermark([bLocal]);

    // Rodada 1: A recebe B, B recebe A (troca simultânea, típica de
    // broadcast).
    const aAfterRound1 = applyRemoteDelta([aLocal], [bLocal], sentA, appState)!;
    const bAfterRound1 = applyRemoteDelta([bLocal], [aLocal], sentB, appState)!;
    applyWatermarkUpdates(sentA, aAfterRound1.watermarkUpdates);
    applyWatermarkUpdates(sentB, bAfterRound1.watermarkUpdates);

    const aSceneAfter1 = aAfterRound1.reconciled;
    const bSceneAfter1 = bAfterRound1.reconciled;

    // O lado que "perdeu" tem o id fora do watermark (B2) -- simula o
    // flush de broadcast reenviando exatamente esse elemento pro outro
    // lado (rodada 2).
    const aWinnerNonce = aSceneAfter1.find((e) => e.id === "T")!.versionNonce;
    const bWinnerNonce = bSceneAfter1.find((e) => e.id === "T")!.versionNonce;
    expect(aWinnerNonce).toBe(bWinnerNonce); // já convergem em conteúdo depois da 1a rodada (reconcile é determinístico dos dois lados)

    // Rodada 2: quem tinha o watermark removido reenvia; o outro lado já
    // está com o vencedor certo, reconcile é idempotente.
    const aAfterRound2 = applyRemoteDelta(aSceneAfter1, bSceneAfter1, sentA, appState);
    const bAfterRound2 = applyRemoteDelta(bSceneAfter1, aSceneAfter1, sentB, appState);

    const aFinal = (aAfterRound2?.reconciled ?? aSceneAfter1).find((e) => e.id === "T")!;
    const bFinal = (bAfterRound2?.reconciled ?? bSceneAfter1).find((e) => e.id === "T")!;
    expect(aFinal.versionNonce).toBe(bFinal.versionNonce);
    expect(aFinal.strokeColor).toBe(bFinal.strokeColor);
  });
});

describe("Convergência de delete", () => {
  it("um delete (isDeleted:true) recebido é aplicado como elemento comum, não removido da lista", () => {
    const appState = baseAppState();
    const original = makeElement({ id: "a" });
    const local = [original];
    const sent = seedWatermark(local);

    const deleted = { ...original } as OrderedExcalidrawElement;
    mutateElement(deleted, { isDeleted: true }, false);

    const result = applyRemoteDelta(local, [deleted], sent, appState);
    expect(result).not.toBeNull();
    const merged = result!.reconciled.find((e) => e.id === "a")!;
    expect(merged.isDeleted).toBe(true);
  });
});

describe("Payload sem elementos sãos", () => {
  it("applyRemoteDelta devolve null (nada a fazer) se tudo for filtrado por isSaneRemoteElement", () => {
    const appState = baseAppState();
    const result = applyRemoteDelta([], [{ id: "", type: "x", version: 1, index: "a1" }], new Map(), appState);
    expect(result).toBeNull();
  });
});
