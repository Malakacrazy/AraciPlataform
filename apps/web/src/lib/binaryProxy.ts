import { NextResponse } from "next/server";

// Compartilhado pelas três rotas de imagem de prancha (staff, /present,
// portal do convidado) -- ver plano de migração tldraw->Excalidraw
// §5.2. O proxy BFF genérico (api/v1/[...path]/route.ts) força
// application/json e chama .text() nos dois sentidos, corrompendo
// binário; estas rotas usam arrayBuffer() nos dois lados, mesmo padrão
// já usado em present/[token]/documents/[officeLinkId]/route.ts.

// Achado A46 da auditoria de 30 ago 2026: segmentos dinâmicos do App
// Router chegam já DECODIFICADOS -- um "%2e%2e%2f" na URL vira "../"
// dentro da string interpolada, e o fetch normaliza o caminho DEPOIS,
// escapando do prefixo /v1/... pretendido. Mesma guarda em toda rota que
// interpola um segmento de URL num fetch pro apps/api.
const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

export function isSafePathSegment(segment: string): boolean {
  // O `.` faz parte da classe acima (nome de arquivo com extensão), então
  // a regex SOZINHA aceita "." e ".." -- e um ".." decodificado colapsa um
  // componente do path upstream depois que o fetch normaliza. As duas
  // recusas explícitas abaixo são a metade que faltava quando esta guarda
  // foi extraída de api/v1/[...path]/route.ts:32, que sempre teve as duas.
  return SAFE_SEGMENT.test(segment) && segment !== '..' && segment !== '.';
}

export function badRequest(message = "Caminho inválido."): NextResponse {
  return NextResponse.json({ error: { code: "BAD_REQUEST", message } }, { status: 400 });
}

export async function relayPut(targetUrl: string, headers: Record<string, string>, body: ArrayBuffer): Promise<NextResponse> {
  const upstream = await fetch(targetUrl, { method: "PUT", headers, body });
  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}

export async function relayGet(targetUrl: string, headers: Record<string, string>): Promise<NextResponse> {
  const upstream = await fetch(targetUrl, { headers, cache: "no-store" });
  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null);
    return NextResponse.json(
      { error: body?.error ?? { code: "DOWNLOAD_FAILED", message: "Não foi possível abrir a imagem." } },
      { status: upstream.status },
    );
  }
  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      // Repassa o disposition: o apps/api força `attachment` pra qualquer
      // coisa fora da allowlist de imagem (ver normalizeImageMimeType em
      // moodboard-files.service.ts); perder esse cabeçalho aqui
      // desfaria a defesa no último hop, que é justamente o que roda na
      // mesma origem do dashboard.
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "inline",
      "Cache-Control": upstream.headers.get("Cache-Control") ?? "private, max-age=31536000, immutable",
      // Achados A32/A45: defesa em profundidade -- mesmo que o upstream
      // já normalize o Content-Type, o navegador nunca tenta adivinhar
      // um tipo mais perigoso pelo conteúdo (sniffing).
      "X-Content-Type-Options": "nosniff",
    },
  });
}
