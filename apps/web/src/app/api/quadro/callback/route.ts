import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, REDIRECT_BOARD_COOKIE } from "../state-cookie";
import { verifyLogtoLogin, WhiteboardGuestPortalApiError, SESSION_COOKIE } from "@/lib/whiteboardGuestPortalApi";

function redirectToLogin(request: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/quadro/login?error=${encodeURIComponent(error)}`, request.url));
}

// Troca o code pelo token AQUI (apps/web), não em apps/api -- mesmo
// motivo de api/google/callback.ts: apps/api nunca é exposto ao
// navegador, não pode ser o destino de um redirect que o Logto manda
// direto pro navegador do convidado. Diferente do fluxo Google (que já
// conhece a identidade via sessão NextAuth e só guarda um refresh
// token), aqui o objetivo do login É estabelecer a identidade -- por
// isso a chamada a /oidc/userinfo abaixo, além da troca code→token.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const pendingBoardId = request.cookies.get(REDIRECT_BOARD_COOKIE)?.value;
  function respond(response: NextResponse) {
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(REDIRECT_BOARD_COOKIE);
    return response;
  }

  if (!state || !expectedState || state !== expectedState) {
    return respond(
      redirectToLogin(request, "Não foi possível confirmar que este login começou neste navegador. Tente de novo."),
    );
  }
  if (error || !code) {
    return respond(redirectToLogin(request, error ?? "O Logto não devolveu um código de autorização."));
  }

  const endpoint = process.env.LOGTO_ENDPOINT;
  const appId = process.env.LOGTO_APP_ID;
  const appSecret = process.env.LOGTO_APP_SECRET;
  if (!endpoint || !appId || !appSecret) {
    return respond(redirectToLogin(request, "LOGTO_ENDPOINT/LOGTO_APP_ID/LOGTO_APP_SECRET não configurados."));
  }

  const redirectUri = new URL("/api/quadro/callback", request.url).toString();
  const tokenRes = await fetch(`${endpoint}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody: { access_token?: string; error?: string; error_description?: string } = await tokenRes.json();
  if (!tokenRes.ok || !tokenBody.access_token) {
    return respond(
      redirectToLogin(request, tokenBody.error_description ?? "Falha ao trocar o código de autorização com o Logto."),
    );
  }

  // /oidc/me (não /oidc/userinfo, nome que o resto do mundo OIDC usa --
  // Logto expõe o userinfo endpoint sob esse path próprio) em vez de
  // decodificar o id_token manualmente -- devolve as claims já
  // verificadas pelo próprio Logto, sem precisar de uma biblioteca de
  // verificação de JWT/JWKS só pra isto.
  const userInfoRes = await fetch(`${endpoint}/oidc/me`, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const userInfo: { sub?: string; email?: string; name?: string } = await userInfoRes.json();
  if (!userInfoRes.ok || !userInfo.sub || !userInfo.email) {
    return respond(redirectToLogin(request, "O Logto não devolveu e-mail/identidade pra esta conta."));
  }

  let sessionToken: string;
  try {
    ({ sessionToken } = await verifyLogtoLogin({
      email: userInfo.email,
      name: userInfo.name ?? userInfo.email,
      logtoSubjectId: userInfo.sub,
    }));
  } catch (err) {
    const message = err instanceof WhiteboardGuestPortalApiError ? err.message : "Não foi possível validar seu login.";
    return respond(redirectToLogin(request, message));
  }

  const destination = pendingBoardId ? `/quadro/${pendingBoardId}` : "/quadro";
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/quadro",
    maxAge: 60 * 60 * 24 * 7,
  });
  return respond(response);
}
