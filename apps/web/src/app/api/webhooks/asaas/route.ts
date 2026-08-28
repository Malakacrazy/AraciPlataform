import { NextRequest } from "next/server";
import { forwardWebhook } from "@/lib/webhookPassthrough";

// Configurar no painel da Asaas como a URL do webhook em produção (em
// vez de um endereço direto de apps/api, que é privado -- ver
// render.yaml e bloqueador 12 da auditoria).
export async function POST(request: NextRequest) {
  return forwardWebhook(request, "/v1/billing/asaas/webhook", "asaas-access-token");
}
