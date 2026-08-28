import { NextResponse } from "next/server";

// Item "grande" da lista de 11 (gestão documental) -- o cliente nunca
// tem conta Google, então este handler é o único jeito de chegar aos
// bytes do arquivo: repassa o corpo binário que apps/api já baixou do
// Drive com a credencial de um admin (ver PublicPresentationController.
// downloadDocument). Mesmo padrão de lib/publicApi.ts -- servidor
// chamando apps/api direto, o token da URL é a única credencial, nunca
// passa pelo proxy BFF genérico (api/v1/[...path]/route.ts), que espera
// sessão NextAuth de staff.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; officeLinkId: string }> },
) {
  const { token, officeLinkId } = await params;

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
    },
  });
}
