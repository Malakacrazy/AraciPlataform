import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { STATE_COOKIE, REDIRECT_BOARD_COOKIE } from "../state-cookie";

// Login do convidado do quadro -- audiência nova, nem staff (NextAuth/
// Google Workspace) nem cliente/consultor (magic link próprio): alguém
// convidado só pra colaborar num quadro específico (ver
// WhiteboardGuestsService/WhiteboardGuest no schema), autenticado via
// Logto (OIDC), decisão explícita do usuário -- não generaliza o magic
// link do cliente/consultor pra um terceiro caso, mesmo raciocínio de
// "dois fluxos distintos, não vale a pena unificar" que já separa
// ClientMagicLink de CollaboratorMagicLink.
export async function GET(request: Request) {
  const endpoint = process.env.LOGTO_ENDPOINT;
  const appId = process.env.LOGTO_APP_ID;
  if (!endpoint || !appId) {
    return NextResponse.redirect(
      new URL(`/quadro/login?error=${encodeURIComponent("LOGTO_ENDPOINT/LOGTO_APP_ID não configurados.")}`, request.url),
    );
  }

  // Mesmo achado A-04 que já motivou o state em api/google/authorize --
  // sem isto, o callback trocaria qualquer `code` da query por uma
  // sessão, inclusive um `code` que um atacante conseguiu na própria
  // conta Logto dele.
  const state = randomBytes(32).toString("base64url");

  const url = new URL(request.url);
  const boardId = url.searchParams.get("board");

  const redirectUri = new URL("/api/quadro/callback", request.url).toString();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
  });

  const response = NextResponse.redirect(`${endpoint}/oidc/auth?${params.toString()}`);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/quadro",
    maxAge: 600,
  });
  if (boardId) {
    response.cookies.set(REDIRECT_BOARD_COOKIE, boardId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/quadro",
      maxAge: 600,
    });
  }
  return response;
}
