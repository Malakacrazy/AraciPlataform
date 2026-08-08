import { NextRequest, NextResponse } from "next/server";
import { mintInternalToken } from "@/lib/internalToken";

// BFF: toda a lógica de negócio (CRM/ERP/FF&E) vive em apps/api agora —
// esta rota só verifica a sessão NextAuth real e encaminha para lá com um
// token interno de curta duração. apps/api nunca é chamado pelo
// navegador diretamente; este é o único caminho. Ver docs/fase-0/ para o
// desenho completo (por que BFF em vez de apps/api ter seu próprio
// login, ou o navegador chamar apps/api direto).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const token = await mintInternalToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sessão inválida ou ausente." } },
      { status: 401 }
    );
  }

  const { path } = await params;
  const targetUrl = `${API_URL}/v1/${path.join("/")}${request.nextUrl.search}`;

  const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);
  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: hasBody ? await request.text() : undefined,
  });

  const responseBody = upstream.status === 204 ? null : await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
