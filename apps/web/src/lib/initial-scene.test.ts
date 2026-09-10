import { describe, it, expect } from "vitest";
import { parseInitialScene } from "./initial-scene";

// O caminho de PERSISTÊNCIA (abrir o que está no Postgres), não o do
// canal. A guarda por elemento existia só no broadcast, então o PATCH de
// snapshot era um desvio aberto em volta dela: um version/index forjado
// gravado por ali vencia o reconcile de todo peer PARA SEMPRE, e o dano
// sobrevivia a qualquer reload porque estava no banco. Estes testes são
// o que impede a guarda de voltar a existir num lado só.
const sane = { id: "a", type: "rectangle", version: 3, index: "a1" };

describe("parseInitialScene", () => {
  it("aceita um scene bem formado sem descartar nada", () => {
    const out = parseInitialScene({
      schemaVersion: 1,
      elements: [sane],
      appState: { viewBackgroundColor: "#fafafa" },
    })!;
    expect(out.elements).toEqual([sane]);
    expect(out.viewBackgroundColor).toBe("#fafafa");
    expect(out.droppedElements).toBe(0);
  });

  it("recusa o scene inteiro quando a forma mínima não está lá", () => {
    expect(parseInitialScene(null)).toBeNull();
    expect(parseInitialScene(123)).toBeNull();
    expect(parseInitialScene({ elements: [] })).toBeNull(); // sem schemaVersion
    expect(parseInitialScene({ schemaVersion: 1 })).toBeNull(); // sem elements
  });

  it("descarta o elemento com version forjada e CONTA o descarte", () => {
    const out = parseInitialScene({
      schemaVersion: 1,
      elements: [sane, { ...sane, id: "poison", version: 9e15 }],
    })!;
    expect(out.elements.map((e) => (e as { id: string }).id)).toEqual(["a"]);
    expect(out.droppedElements).toBe(1);
  });

  it("descarta o elemento com index forjado (fractional-indexing fora de formato)", () => {
    const out = parseInitialScene({
      schemaVersion: 1,
      elements: [sane, { ...sane, id: "pinned", index: "z".repeat(64) }],
    })!;
    expect(out.elements.map((e) => (e as { id: string }).id)).toEqual(["a"]);
    expect(out.droppedElements).toBe(1);
  });

  it("um scene 100% envenenado abre vazio, não como null -- a cena vazia é salvável e limpa a linha", () => {
    const out = parseInitialScene({
      schemaVersion: 1,
      elements: [{ ...sane, version: Infinity }],
    })!;
    expect(out).not.toBeNull();
    expect(out.elements).toEqual([]);
    expect(out.droppedElements).toBe(1);
  });

  it("appState sem viewBackgroundColor não vira falha -- o campo é opcional", () => {
    const out = parseInitialScene({ schemaVersion: 1, elements: [sane], appState: {} })!;
    expect(out.viewBackgroundColor).toBeUndefined();
    expect(out.droppedElements).toBe(0);
  });
});
