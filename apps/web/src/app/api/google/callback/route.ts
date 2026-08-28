import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { STATE_COOKIE } from "../state-cookie";

function redirectToTeam(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/team", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

// Troca o code pelo token AQUI (apps/web), não em apps/api -- apps/api
// nunca é exposto ao navegador (só apps/web chama, via proxy interno),
// então não pode ser o destino de um redirect que o Google manda direto
// pro navegador da pessoa. GOOGLE_CLIENT_ID/SECRET já vivem aqui (mesmo
// par que o NextAuth usa pro login), então a troca acontece no mesmo
// lugar, sem duplicar o segredo em apps/api também. Só o refresh_token
// resultante (o dado que realmente precisa ser guardado) segue adiante
// pro apps/api, que criptografa e persiste (ver GoogleCredentialsService).
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/api/auth/signin", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  // Achado A-04: exige que `state` bata com o cookie setado por
  // authorize/route.ts para ESTE navegador -- sem isso, qualquer `code`
  // que chegasse na query (inclusive de um consentimento que o atacante
  // iniciou na própria conta dele) seria trocado e salvo como a
  // credencial de quem estiver logado aqui. De uso único: toda resposta
  // daqui pra frente passa por respond(), que apaga o cookie de estado
  // esteja o fluxo indo pro sucesso ou pra qualquer erro.
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  function respond(response: NextResponse) {
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  if (!state || !expectedState || state !== expectedState) {
    return respond(
      redirectToTeam(request, {
        googleSyncError: "Não foi possível confirmar que esta autorização começou neste navegador. Tente conectar de novo.",
      }),
    );
  }

  if (error || !code) {
    return respond(
      redirectToTeam(request, { googleSyncError: error ?? "O Google não devolveu um código de autorização." }),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return respond(redirectToTeam(request, { googleSyncError: "GOOGLE_CLIENT_ID/SECRET não configurados." }));
  }

  const redirectUri = new URL("/api/google/callback", request.url).toString();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody: { refresh_token?: string; scope?: string; error?: string; error_description?: string } =
    await tokenRes.json();

  if (!tokenRes.ok || !tokenBody.refresh_token) {
    // Acontece quando a pessoa já tinha consentido antes SEM
    // access_type=offline (refresh_token só volta na primeira vez que o
    // Google emite um, a não ser que prompt=consent force de novo -- se
    // ainda assim não veio, algo na configuração do client OAuth está
    // errado, não é um erro transitório).
    return respond(
      redirectToTeam(request, {
        googleSyncError:
          tokenBody.error_description ??
          "O Google não devolveu um refresh_token. Tente remover o acesso do app em myaccount.google.com/permissions e conectar de novo.",
      }),
    );
  }

  const saveRes = await apiFetch("office/google-credential", {
    method: "POST",
    body: JSON.stringify({ refreshToken: tokenBody.refresh_token, scope: tokenBody.scope ?? "" }),
  });
  if (!saveRes.ok) {
    return respond(redirectToTeam(request, { googleSyncError: "Falha ao salvar a credencial." }));
  }

  return respond(redirectToTeam(request, { googleSyncConnected: "1" }));
}
