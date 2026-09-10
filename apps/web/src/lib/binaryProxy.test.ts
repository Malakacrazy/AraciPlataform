import { describe, it, expect } from "vitest";
import { isSafePathSegment } from "./binaryProxy";

// Achado A46: segmentos dinâmicos do App Router chegam DECODIFICADOS, e
// o fetch normaliza o caminho DEPOIS da interpolação -- então um segmento
// que seja exatamente ".." apaga um componente do path upstream e escapa
// do prefixo /v1/moodboards/... pretendido. A regex sozinha ACEITA "."
// e ".." porque o ponto faz parte da classe de caracteres (nome de
// arquivo com extensão), e foi assim que esta guarda foi extraída de
// api/v1/[...path]/route.ts -- perdendo as duas recusas explícitas que o
// original sempre teve.
describe("isSafePathSegment", () => {
  it("aceita os ids que as rotas de verdade passam", () => {
    expect(isSafePathSegment("clx1a2b3c4d5e6f7g8h9")).toBe(true);
    expect(isSafePathSegment("a1b2c3.png")).toBe(true);
    expect(isSafePathSegment("file_id-01~x")).toBe(true);
  });

  it("recusa travessia de caminho, decodificada ou não", () => {
    expect(isSafePathSegment("..")).toBe(false);
    expect(isSafePathSegment(".")).toBe(false);
    expect(isSafePathSegment("../../v1/admin")).toBe(false);
    expect(isSafePathSegment("%2e%2e")).toBe(false);
  });

  it("recusa separadores, query e vazio", () => {
    expect(isSafePathSegment("a/b")).toBe(false);
    expect(isSafePathSegment("a?b=1")).toBe(false);
    expect(isSafePathSegment("a#b")).toBe(false);
    expect(isSafePathSegment("")).toBe(false);
  });
});
