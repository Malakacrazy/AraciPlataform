import { describe, it, expect } from "vitest";
import { restoreElements, restoreAppState, mutateElement } from "@excalidraw/excalidraw";
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

    // Simula o que syncInvalidIndices faz: mutateElement só em
    // index/version/versionNonce, nada do conteúdo visível muda.
    const reindexed = { ...original, index: "a2" } as OrderedExcalidrawElement;
    mutateElement(reindexed, {}, false); // bump version/versionNonce sem mudar mais nada

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

    const result = applyRemoteDelta([aLocal], [bLocal], sentA, appState)!;
    const winner = result.reconciled.find((e) => e.id === "T")!;

    if (winner.versionNonce === aLocal.versionNonce) {
      // Local (A) venceu -- o watermark antigo não bate com o conteúdo
      // vencedor, então precisa continuar/ficar dirty (nulo = força
      // reenvio no próximo flush de broadcast).
      expect(result.watermarkUpdates.get("T")).toBeNull();
    } else {
      // Remoto (B) venceu -- A absorve o conteúdo de B, watermark
      // atualizado pra refletir isso, sem necessidade de reenviar.
      expect(result.watermarkUpdates.get("T")).not.toBeNull();
      expect(result.watermarkUpdates.get("T")!.fingerprint).toBe(contentFingerprint(bLocal));
    }
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

    const sentA = seedWatermark([aLocal]); // A já confirmou ter enviado aLocal

    const result = applyRemoteDelta([aLocal], [bLocal], sentA, appState)!;
    const winner = result.reconciled.find((e) => e.id === "T")!;
    if (winner.versionNonce === aLocal.versionNonce) {
      expect(result.watermarkUpdates.get("T")).not.toBeNull();
      expect(result.watermarkUpdates.get("T")!.fingerprint).toBe(contentFingerprint(aLocal));
    }
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
