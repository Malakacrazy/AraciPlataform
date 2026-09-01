import { NextResponse } from "next/server";
import { withScheme } from "@/lib/url";

// Bloqueador 15 da auditoria: antes, respondia {status:'ok'} sempre, sem
// checar nada -- um healthcheck que nunca falha não protege contra a
// situação mais comum de todas (apps/web de pé, mas incapaz de falar com
// apps/api). Reaproveita o /health de lá, que já checa o Postgres (ver
// apps/api/src/app.controller.ts) -- não duplica a checagem de banco
// aqui, só confirma que o caminho web → api está de pé.
// withScheme (achado A12 da auditoria de 30 ago 2026): sem isto, um
// API_URL sem protocolo (render.yaml fromService/hostport) faz este
// fetch falhar sempre, e o healthCheckPath do araci-web nunca fica
// saudável -- o serviço público nunca entra no ar.
const API_URL = withScheme(process.env.API_URL ?? "http://localhost:3001");

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      // Logado de propósito (não só devolvido no body): healthCheckPath
      // é chamado pelo prober do Render, cuja resposta ninguém lê -- sem
      // isto, um 503 aqui é invisível nos logs, e é exatamente a causa
      // mais provável de o deploy nunca ficar "live".
      console.error(`GET /api/health: apps/api respondeu ${res.status} em ${API_URL}/health`);
      return NextResponse.json({ status: "error", detail: "apps/api não está saudável." }, { status: 503 });
    }
  } catch (err) {
    console.error(`GET /api/health: fetch em ${API_URL}/health falhou --`, err);
    return NextResponse.json({ status: "error", detail: "apps/api inalcançável." }, { status: 503 });
  }
  return NextResponse.json({ status: "ok" });
}
