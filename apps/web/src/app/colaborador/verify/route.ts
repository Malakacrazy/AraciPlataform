import { NextRequest, NextResponse } from "next/server";
import { consumeCollaboratorToken, CollaboratorPortalApiError, SESSION_COOKIE } from "@/lib/collaboratorPortalApi";

// Mesmo motivo de portal/verify/route.ts: cookies só podem ser setados em
// Server Action ou Route Handler, não durante o render de uma Server
// Component page.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/colaborador/login", request.url));
  }

  let sessionToken: string;
  try {
    ({ sessionToken } = await consumeCollaboratorToken(token));
  } catch (err) {
    const message = err instanceof CollaboratorPortalApiError ? err.message : "Não foi possível validar o link.";
    return NextResponse.redirect(new URL(`/colaborador/login?error=${encodeURIComponent(message)}`, request.url));
  }

  const response = NextResponse.redirect(new URL("/colaborador", request.url));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/colaborador",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
