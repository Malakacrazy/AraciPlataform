import { NextRequest, NextResponse } from "next/server";
import { withScheme } from "./url";

// Bloqueador 12 da auditoria: em produção, apps/api é um serviço PRIVADO
// (ver render.yaml e o comentário em apps/api/src/main.ts) -- Asaas e
// ZapSign, serviços externos, não têm como chamar POST /v1/billing/
// asaas/webhook ou POST /v1/zapsign/webhook diretamente nunca mais. Este
// helper é um "cano burro": repassa método/headers/corpo pra rota
// @Public() correspondente em apps/api sem checar sessão nenhuma (não
// faz sentido checar -- quem chama é a Asaas/ZapSign, não um navegador
// logado). A autorização de verdade continua sendo o header de segredo
// (asaas-access-token / zapsign-webhook-token), verificado do lado de
// apps/api exatamente como antes -- este arquivo não sabe nem precisa
// saber qual é o segredo.
// withScheme (achado A12 da auditoria de 30 ago 2026): API_URL vem de
// render.yaml fromService/hostport, sem protocolo.
const API_URL = withScheme(process.env.API_URL ?? "http://localhost:3001");

// Só repassa o header de segredo nomeado, não os headers todos (mesmo
// espírito do proxy BFF em api/v1/[...path]/route.ts, que também
// escolhe explicitamente o que atravessa em vez de espalhar tudo --
// host/content-length recalculados pelo fetch não deveriam viajar).
export async function forwardWebhook(
  request: NextRequest,
  apiPath: string,
  secretHeaderName: string,
): Promise<NextResponse> {
  const secret = request.headers.get(secretHeaderName);
  const upstream = await fetch(`${API_URL}${apiPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { [secretHeaderName]: secret } : {}),
    },
    body: await request.text(),
  });

  const responseBody = upstream.status === 204 ? null : await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
