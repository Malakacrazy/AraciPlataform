import { NextRequest, NextResponse } from "next/server";
import { consumePortalToken, PortalApiError, SESSION_COOKIE } from "@/lib/portalApi";

// Cookies só podem ser setados em Server Action ou Route Handler, não
// durante o render de uma Server Component page -- por isso isso não é
// um page.tsx (achado rodando o fluxo de verdade no navegador).
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/portal/login", request.url));
  }

  let sessionToken: string;
  try {
    ({ sessionToken } = await consumePortalToken(token));
  } catch (err) {
    const message = err instanceof PortalApiError ? err.message : "Não foi possível validar o link.";
    return NextResponse.redirect(new URL(`/portal/login?error=${encodeURIComponent(message)}`, request.url));
  }

  const response = NextResponse.redirect(new URL("/portal", request.url));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
