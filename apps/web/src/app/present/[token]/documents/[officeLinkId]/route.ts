import { NextResponse } from "next/server";
import { withScheme } from "@/lib/url";

// Item "grande" da lista de 11 (gestão documental) -- o cliente nunca
// tem conta Google, então este handler é o único jeito de chegar aos
// bytes do arquivo: repassa o corpo binário que apps/api já baixou do
// Drive com a credencial de um admin (ver PublicPresentationController.
// downloadDocument). Mesmo padrão de lib/publicApi.ts -- servidor
// chamando apps/api direto, o token da URL é a única credencial, nunca
// passa pelo proxy BFF genérico (api/v1/[...path]/route.ts), que espera
// sessão NextAuth de staff.
// withScheme (achado A12 da auditoria de 30 ago 2026): API_URL vem de
// render.yaml fromService/hostport, sem protocolo -- esta rota tinha
// ficado de fora da correção original por ter nascido depois, na lacuna
// de gestão documental.
const API_URL = withScheme(process.env.API_URL ?? "http://localhost:3001");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; officeLinkId: string }> },
) {
  const { token, officeLinkId } = await params;

  // Achado A46 da auditoria de 30 ago 2026: os segmentos dinâmicos do App
  // Router chegam já decodificados -- um "%2e%2e%2f" na URL vira "../"
  // dentro da string interpolada, e o fetch normaliza o caminho DEPOIS,
  // escapando do prefixo /v1/present/. Mesma guarda que o proxy BFF
  // genérico já aplica (api/v1/[...path]/route.ts); esta rota nasceu
  // depois, na lacuna de gestão documental, e não a recebeu -- diferente
  // do proxy BFF, esta rota é alcançável por qualquer visitante sem
  // sessão nenhuma.
  if (![token, officeLinkId].every((s) => /^[A-Za-z0-9._~-]+$/.test(s))) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Caminho inválido." } }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/v1/present/${token}/documents/${officeLinkId}`, {
    cache: "no-store",
  });

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null);
    return NextResponse.json(
      { error: body?.error ?? { code: "DOWNLOAD_FAILED", message: "Não foi possível abrir o documento." } },
      { status: upstream.status },
    );
  }

  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "inline",
      // Achado A45: defesa em profundidade -- mesmo que o upstream já
      // normalize o Content-Type pra uma allowlist, garante que o
      // navegador nunca tente adivinhar um tipo mais perigoso pelo
      // conteúdo (sniffing) do que o cabeçalho diz.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
