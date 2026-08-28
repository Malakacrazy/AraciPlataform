import { NextResponse } from "next/server";

// Bloqueador 15 da auditoria: antes, respondia {status:'ok'} sempre, sem
// checar nada -- um healthcheck que nunca falha não protege contra a
// situação mais comum de todas (apps/web de pé, mas incapaz de falar com
// apps/api). Reaproveita o /health de lá, que já checa o Postgres (ver
// apps/api/src/app.controller.ts) -- não duplica a checagem de banco
// aqui, só confirma que o caminho web → api está de pé.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return NextResponse.json({ status: "error", detail: "apps/api não está saudável." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ status: "error", detail: "apps/api inalcançável." }, { status: 503 });
  }
  return NextResponse.json({ status: "ok" });
}
