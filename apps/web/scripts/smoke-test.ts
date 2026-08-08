import { encode } from "next-auth/jwt";

// This is deliberately small. All CRM/ERP/FF&E business-logic correctness
// is already proven end to end against apps/api directly
// (apps/api/scripts/smoke-test.ts, 51 checks). This script only proves
// the BFF proxy plumbing itself: a real NextAuth session reaches this
// server, gets exchanged for a short-lived internal token, and that
// token successfully reaches apps/api and gets a real response back —
// not that every business rule holds (that's apps/api's job to prove).
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.NEXTAUTH_SECRET ?? "local-dev-smoke-test-secret-do-not-use-in-prod";
const EMAIL = `smoke-test-proxy-${Date.now()}@studioaraci.com.br`;

let passed = 0;
let failed = 0;

function report(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    if (detail !== undefined) console.log(`    ${JSON.stringify(detail)}`);
  }
}

async function main() {
  const token = await encode({ secret: SECRET, token: { name: "Smoke Test", email: EMAIL, sub: EMAIL } });
  const cookie = `next-auth.session-token=${token}`;

  async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // 204 etc.
    }
    return { status: res.status, body };
  }

  console.log(`\nSmoke test do proxy BFF contra ${BASE_URL} — usuário ${EMAIL}\n`);

  const unauth = await fetch(`${BASE_URL}/api/v1/clients`);
  report("GET /api/v1/clients sem sessão NextAuth → 401", unauth.status === 401);

  const createRes = await api("/api/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: "Cliente via Proxy BFF" }),
  });
  report(
    "POST /api/v1/clients com sessão real → 201 (proxy forjou o token interno e alcançou apps/api)",
    createRes.status === 201,
    createRes.body
  );
  const clientId = createRes.body?.data?.id;

  const listRes = await api("/api/v1/clients");
  report(
    "GET /api/v1/clients → inclui o cliente criado pelo proxy",
    listRes.status === 200 && listRes.body?.data?.some((c: any) => c.id === clientId),
    listRes.body
  );

  const badRes = await api("/api/v1/clients", { method: "POST", body: JSON.stringify({}) });
  report(
    "Erro de validação do apps/api chega intacto pelo proxy (400 VALIDATION_ERROR)",
    badRes.status === 400 && badRes.body?.error?.code === "VALIDATION_ERROR",
    badRes.body
  );

  const notFoundRes = await api("/api/v1/clients/does-not-exist");
  report(
    "404 do apps/api chega intacto pelo proxy",
    notFoundRes.status === 404 && notFoundRes.body?.error?.code === "NOT_FOUND",
    notFoundRes.body
  );

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
