import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/portalApi";
import { withScheme } from "@/lib/url";

// Lacuna da matriz (LGPD, "Meus dados" self-service) -- NÃO passa pelo
// proxy BFF genérico (api/v1/[...path]/route.ts): aquele minta um token
// interno a partir da sessão NextAuth de STAFF (getServerSession), que
// quem está no portal nunca tem -- a autenticação aqui é o cookie
// client_session, mecanismo completamente separado (ver
// ClientPortalService). Mesmo padrão de lib/portalApi.ts: servidor
// chamando apps/api direto, X-Client-Session manual.
//
// Achado A44 da auditoria de 30 ago 2026: esta rota vivia em
// /api/portal/data-export, mas portal/verify/route.ts grava o cookie
// client_session com Path=/portal -- pelo algoritmo de path-match do RFC
// 6265, o navegador só anexa um cookie de path "/portal" a um request cujo
// path seja "/portal" ou comece com "/portal/". Um request pra
// /api/portal/data-export começa com "/api", não com "/portal": o cookie
// nunca saía do navegador, e o handler sempre caía no 401 abaixo -- o
// recurso da LGPD estava 100% quebrado, sempre, pra todo cliente. Rota
// movida pra dentro do escopo do cookie (mesmo prefixo que /portal/verify
// já usa e que prova que o path scoping funciona); MyDataButton aponta
// pra cá agora.
const API_URL = withScheme(process.env.API_URL ?? "http://localhost:3001");

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
