import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { STATE_COOKIE } from "../state-cookie";

// Fluxo separado do login SSO principal (NextAuth) de propósito -- o
// login nunca pede escopo de Drive/Calendar/Gmail (ver auth.ts), e o
// picker de Drive/Calendar/Gmail já usado em office-links-section.tsx
// usa o fluxo implícito do Google Identity Services, que por design
// nunca devolve refresh_token (ver google-client.ts). Só este fluxo aqui
// (response_type=code, access_type=offline) consegue um refresh_token de
// verdade -- necessário pra guardar a credencial e rodar coisa sem o
// navegador aberto: Calendar events.watch / Gmail users.watch (fundação
// já existia, nunca ligada) e, desde a lacuna de gestão documental,
// GoogleDriveService (provisionar pasta, checar vínculo quebrado).
// access_type=offline sozinho não garante refresh_token se a pessoa já
// tinha consentido antes sem essa flag -- prompt=consent força a tela de
// novo especificamente pra garantir que ele volte desta vez. Mesmo
// escopo (drive.file) do Picker em google-client.ts -- reconectar aqui
// não pede nada que a pessoa já não tivesse visto lá.
//
// Achado A35 da auditoria de 30 ago 2026: calendar.events (leitura E
// escrita) e gmail.readonly (escopo "restrito" pelo Google) eram pedidos
// e guardados de qualquer jeito, mas o único consumidor de
// GoogleCredentialsService.getAccessToken é GoogleDriveService -- nenhum
// código server-side usa Calendar/Gmail com esta credencial (o
// events.watch/users.watch citados no comentário acima nunca foram
// implementados). Um vazamento do banco + da chave de criptografia dava
// ao atacante leitura da caixa de e-mail inteira e escrita na agenda de
// todo admin conectado, sem nenhuma funcionalidade real usando isso hoje.
// Reduzido ao que o servidor de fato consome; se o watch de Calendar/
// Gmail for implementado de verdade, pedir esses escopos separados então.
const SYNC_SCOPES = ["https://www.googleapis.com/auth/drive.file"].join(" ");

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/api/auth/signin", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL(`/team?googleSyncError=${encodeURIComponent("GOOGLE_CLIENT_ID não configurado.")}`, request.url),
    );
  }

  // Achado A-04 da auditoria: sem `state`, o callback trocava qualquer
  // `code` que aparecesse na query por um token e salvava como a
  // credencial Google de quem estivesse logado -- um atacante conseguia
  // iniciar o próprio consentimento, pegar um `code` ligado à conta dele,
  // e induzir a vítima logada a abrir /api/google/callback?code=... com
  // esse código, fazendo o refresh token do atacante virar a
  // "Sincronização Google" da vítima. O cookie httpOnly amarra o
  // callback a ESTE navegador/flow específico; só quem passou por aqui
  // tem o valor certo pra bater no callback.
  const state = randomBytes(32).toString("base64url");

  const redirectUri = new URL("/api/google/callback", request.url).toString();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SYNC_SCOPES,
    login_hint: session.user.email,
    state,
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return response;
}
