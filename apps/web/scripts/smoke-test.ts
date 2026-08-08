import { encode } from "next-auth/jwt";

// Exercises the real CRM API over HTTP against a running `next dev` +
// local Postgres — see docs/fase-0/ for how to stand those up. There are
// no real Google OAuth credentials configured, so this crafts a NextAuth
// session JWT directly with the same NEXTAUTH_SECRET the server uses,
// instead of driving a browser through the OAuth flow.
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.NEXTAUTH_SECRET ?? "local-dev-smoke-test-secret-do-not-use-in-prod";
const EMAIL = `smoke-test-${Date.now()}@studioaraci.com.br`;

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
  const token = await encode({
    secret: SECRET,
    token: { name: "Smoke Test", email: EMAIL, sub: EMAIL },
  });
  const cookie = `next-auth.session-token=${token}`;

  async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // 204 No Content etc.
    }
    return { status: res.status, body: body as any };
  }

  console.log(`\nSmoke test contra ${BASE_URL} — usuário ${EMAIL}\n`);

  const unauth = await fetch(`${BASE_URL}/api/v1/clients`);
  report("GET /clients sem sessão → 401", unauth.status === 401);

  const clientRes = await api("/api/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: "Fernanda Ribeiro", email: "fernanda@example.com", source: "indicacao" }),
  });
  report("POST /clients → 201", clientRes.status === 201, clientRes.body);
  const clientId = clientRes.body?.data?.id;

  const badClient = await api("/api/v1/clients", { method: "POST", body: JSON.stringify({}) });
  report(
    "POST /clients sem nome → 400 VALIDATION_ERROR",
    badClient.status === 400 && badClient.body?.error?.code === "VALIDATION_ERROR",
    badClient.body
  );

  const roleRateRes = await api("/api/v1/role-rates", {
    method: "POST",
    body: JSON.stringify({ role: "Arquiteto Líder (RT)", hourlyRate: 64.04 }),
  });
  report("POST /role-rates → 201", roleRateRes.status === 201, roleRateRes.body);

  const oppRes = await api("/api/v1/opportunities", {
    method: "POST",
    body: JSON.stringify({
      clientId,
      title: "Apto Vila Madalena",
      stage: "proposta_enviada",
      feeModel: "hora_tecnica",
      estimatedValue: 48000,
    }),
  });
  report("POST /opportunities → 201", oppRes.status === 201, oppRes.body);
  const opportunityId = oppRes.body?.data?.id;

  const badOpp = await api("/api/v1/opportunities", {
    method: "POST",
    body: JSON.stringify({ clientId: "nonexistent-id", title: "x", stage: "novo_lead", feeModel: "hora_tecnica" }),
  });
  report("POST /opportunities com clientId de outra conta/inexistente → 404", badOpp.status === 404, badOpp.body);

  const proposalRes = await api("/api/v1/proposals", {
    method: "POST",
    body: JSON.stringify({
      opportunityId,
      roleHours: [
        { role: "Arquiteto Líder (RT)", stage: "CAPTACAO_ALINHAMENTO", hours: 10 },
        { role: "Arquiteto Líder (RT)", stage: "BRIEFING", hours: 10 },
        { role: "Arquiteto Líder (RT)", stage: "CRIACAO_CONCEITO", hours: 20 },
        { role: "Arquiteto Líder (RT)", stage: "DETALHAMENTO_ACABAMENTOS", hours: 20 },
        { role: "Arquiteto Líder (RT)", stage: "EXECUTIVO", hours: 15 },
      ],
      complexityScores: { tipologia: 5, programaEscopo: 5, terreno: 5, regulatorio: 5, ambicaoDesign: 5 },
      contractedStages: [
        "CAPTACAO_ALINHAMENTO",
        "BRIEFING",
        "CRIACAO_CONCEITO",
        "DETALHAMENTO_ACABAMENTOS",
        "EXECUTIVO",
      ],
    }),
  });
  report("POST /proposals → 201 (motor de precificação rodando contra o banco real)", proposalRes.status === 201, proposalRes.body);
  const proposal = proposalRes.body?.data;
  report(
    "Proposta aplica desconto de pacote de 10% (5 estágios contratados)",
    Number(proposal?.packageDiscountPercent) === 0.1,
    proposal?.packageDiscountPercent
  );
  report("Proposta tem 5 ProposalStage", Array.isArray(proposal?.stages) && proposal.stages.length === 5, proposal?.stages?.length);
  const value = Number(proposal?.value);
  report(`Valor final ≈ R$ 6484.20 (calculado: ${value})`, Math.abs(value - 6484.2) < 1);

  const stagesRes = await api(`/api/v1/proposals/${proposal?.id}/stages`);
  report(
    "GET /proposals/:id/stages → 200 com 5 linhas",
    stagesRes.status === 200 && Array.isArray(stagesRes.body?.data) && stagesRes.body.data.length === 5,
    stagesRes.body
  );

  const wonRes = await api(`/api/v1/opportunities/${opportunityId}`, {
    method: "PATCH",
    body: JSON.stringify({ wonAt: new Date().toISOString() }),
  });
  report("PATCH /opportunities/:id { wonAt } → 200", wonRes.status === 200, wonRes.body);
  const wonOpportunity = wonRes.body?.data;
  report("Fluxo automático: oportunidade ganha já tem Project vinculado", !!wonOpportunity?.project, wonOpportunity?.project);
  report(
    "Project.name veio do Opportunity.title, sem redigitação",
    wonOpportunity?.project?.name === "Apto Vila Madalena",
    wonOpportunity?.project?.name
  );

  const wonAgainRes = await api(`/api/v1/opportunities/${opportunityId}`, {
    method: "PATCH",
    body: JSON.stringify({ wonAt: wonOpportunity?.wonAt }),
  });
  const projectIdFirst = wonOpportunity?.project?.id;
  const projectIdSecond = wonAgainRes.body?.data?.project?.id;
  report(
    "Repetir o PATCH com o mesmo wonAt não cria um segundo Project (idempotente)",
    !!projectIdFirst && projectIdFirst === projectIdSecond,
    { projectIdFirst, projectIdSecond }
  );

  const deleteConflict = await api(`/api/v1/clients/${clientId}`, { method: "DELETE" });
  report(
    "DELETE /clients/:id com oportunidade vinculada → 409 CONFLICT (não 500)",
    deleteConflict.status === 409 && deleteConflict.body?.error?.code === "CONFLICT",
    deleteConflict.body
  );

  const notFound = await api("/api/v1/clients/does-not-exist");
  report("GET /clients/:id inexistente → 404", notFound.status === 404, notFound.body);

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
