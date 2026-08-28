import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/portalApi";

// Lacuna da matriz (LGPD, "Meus dados" self-service) -- NÃO passa pelo
// proxy BFF genérico (api/v1/[...path]/route.ts): aquele minta um token
// interno a partir da sessão NextAuth de STAFF (getServerSession), que
// quem está no portal nunca tem -- a autenticação aqui é o cookie
// client_session, mecanismo completamente separado (ver
// ClientPortalService). Mesmo padrão de lib/portalApi.ts: servidor
// chamando apps/api direto, X-Client-Session manual.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sessão de cliente ausente." } }, { status: 401 });
  }

  const upstream = await fetch(`${API_URL}/v1/client-portal/data-export`, {
    headers: { "X-Client-Session": sessionToken },
    cache: "no-store",
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
