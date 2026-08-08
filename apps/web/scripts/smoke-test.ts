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

  const projectId = wonOpportunity?.project?.id;

  const projectRes = await api(`/api/v1/projects/${projectId}`);
  report("GET /projects/:id → 200 com 5 fases", projectRes.status === 200 && projectRes.body?.data?.phases?.length === 5, projectRes.body);

  const listProjectsRes = await api("/api/v1/projects");
  report(
    "GET /projects inclui o projeto recém-criado",
    listProjectsRes.status === 200 && listProjectsRes.body?.data?.some((p: any) => p.id === projectId),
    listProjectsRes.body
  );

  const phasesRes = await api(`/api/v1/projects/${projectId}/phases`);
  const phases = phasesRes.body?.data ?? [];
  report(
    "GET /projects/:id/phases → 5 fases em ordem, todas contratadas",
    phasesRes.status === 200 && phases.length === 5 && phases.every((p: any) => p.contracted),
    phases.map((p: any) => p.stage)
  );
  const [firstPhase, secondPhase] = phases.sort((a: any, b: any) => a.order - b.order);

  const outOfOrderApproval = await api(`/api/v1/projects/${projectId}/phases/${secondPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "email" }),
  });
  report(
    "Aprovar a 2ª fase antes da 1ª → 422 GATE_OUT_OF_ORDER (gates são sequenciais)",
    outOfOrderApproval.status === 422 && outOfOrderApproval.body?.error?.code === "GATE_OUT_OF_ORDER",
    outOfOrderApproval.body
  );

  const whatsappApproval = await api(`/api/v1/projects/${projectId}/phases/${firstPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "whatsapp" }),
  });
  report(
    "Aprovar via 'whatsapp' → 400 (canal inválido; PEP só aceita email/reunião presencial)",
    whatsappApproval.status === 400,
    whatsappApproval.body
  );

  const firstApproval = await api(`/api/v1/projects/${projectId}/phases/${firstPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "email" }),
  });
  report(
    "Aprovar a 1ª fase por e-mail → 200, approvedAt setado",
    firstApproval.status === 200 && !!firstApproval.body?.data?.approvedAt,
    firstApproval.body
  );

  const secondApprovalNow = await api(`/api/v1/projects/${projectId}/phases/${secondPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "reuniao_presencial" }),
  });
  report(
    "Com a 1ª aprovada, aprovar a 2ª agora funciona → 200",
    secondApprovalNow.status === 200 && !!secondApprovalNow.body?.data?.approvedAt,
    secondApprovalNow.body
  );

  const thirdPhase = phases[2]; // ainda não aprovada
  const invoiceOnUnapproved = await api(`/api/v1/projects/${projectId}/phases/${thirdPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({ amount: 1000 }),
  });
  report(
    "Faturar um estágio sem gate aprovado → 422 PHASE_NOT_APPROVED",
    invoiceOnUnapproved.status === 422 && invoiceOnUnapproved.body?.error?.code === "PHASE_NOT_APPROVED",
    invoiceOnUnapproved.body
  );

  const invoiceRes = await api(`/api/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({ amount: 902.98 }),
  });
  report(
    "Faturar um estágio com gate aprovado → 201",
    invoiceRes.status === 201 && invoiceRes.body?.data?.status === "pendente",
    invoiceRes.body
  );
  const invoiceId = invoiceRes.body?.data?.id;

  const invoicesListRes = await api(`/api/v1/invoices?projectId=${projectId}`);
  report(
    "GET /invoices?projectId= inclui a fatura recém-criada",
    invoicesListRes.status === 200 && invoicesListRes.body?.data?.some((inv: any) => inv.id === invoiceId),
    invoicesListRes.body
  );

  const invoiceStatusRes = await api(`/api/v1/invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "emitida", nfseNumber: "NFSe-0001" }),
  });
  report(
    "PATCH /invoices/:id marca como emitida com número da NFS-e",
    invoiceStatusRes.status === 200 && invoiceStatusRes.body?.data?.status === "emitida" && invoiceStatusRes.body?.data?.nfseNumber === "NFSe-0001",
    invoiceStatusRes.body
  );

  const timeEntryRes = await api("/api/v1/time-entries", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      phaseId: firstPhase.id,
      date: new Date().toISOString(),
      hours: 3,
      activityType: "projeto",
    }),
  });
  report("POST /time-entries → 201", timeEntryRes.status === 201, timeEntryRes.body);
  const timeEntryId = timeEntryRes.body?.data?.id;

  const timeEntryUpdateRes = await api(`/api/v1/time-entries/${timeEntryId}`, {
    method: "PATCH",
    body: JSON.stringify({ hours: 4 }),
  });
  report(
    "PATCH /time-entries/:id antes da aprovação → 200, horas atualizadas",
    timeEntryUpdateRes.status === 200 && Number(timeEntryUpdateRes.body?.data?.hours) === 4,
    timeEntryUpdateRes.body
  );

  const timeEntryApproveRes = await api(`/api/v1/time-entries/${timeEntryId}/approve`, { method: "POST" });
  report(
    "POST /time-entries/:id/approve → 200, approvedAt setado",
    timeEntryApproveRes.status === 200 && !!timeEntryApproveRes.body?.data?.approvedAt,
    timeEntryApproveRes.body
  );

  const timeEntryEditAfterApproval = await api(`/api/v1/time-entries/${timeEntryId}`, {
    method: "PATCH",
    body: JSON.stringify({ hours: 8 }),
  });
  report(
    "Editar lançamento já aprovado → 422 TIME_ENTRY_APPROVED",
    timeEntryEditAfterApproval.status === 422 && timeEntryEditAfterApproval.body?.error?.code === "TIME_ENTRY_APPROVED",
    timeEntryEditAfterApproval.body
  );

  const timeEntriesListRes = await api(`/api/v1/time-entries?projectId=${projectId}`);
  report(
    "GET /time-entries?projectId= inclui o lançamento",
    timeEntriesListRes.status === 200 && timeEntriesListRes.body?.data?.some((e: any) => e.id === timeEntryId),
    timeEntriesListRes.body
  );

  // Segunda identidade: mesma conta (a única existente neste banco de
  // dev), usuário diferente — para testar atribuição de equipe de forma
  // que signifique algo (adicionar a si mesmo como membro não provaria
  // muito).
  const email2 = `smoke-test-2-${Date.now()}@studioaraci.com.br`;
  const token2 = await encode({ secret: SECRET, token: { name: "Smoke Test 2", email: email2, sub: email2 } });
  const cookie2 = `next-auth.session-token=${token2}`;
  async function api2(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie2, ...(init.headers ?? {}) },
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // 204 etc.
    }
    return { status: res.status, body };
  }
  await api2("/api/v1/clients"); // dispara o bootstrap do segundo usuário na mesma conta

  const usersListRes = await api("/api/v1/users");
  const user2 = usersListRes.body?.data?.find((u: any) => u.email === email2);
  report("GET /users lista os dois usuários da conta (bootstrap funcionou para os dois)", !!user2, usersListRes.body);

  const userPatchRes = await api(`/api/v1/users/${user2.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "Arquiteto Pleno", specialty: "FF&E", costPerHour: 45 }),
  });
  report(
    "PATCH /users/:id atualiza papel/especialidade/custo-hora",
    userPatchRes.status === 200 && userPatchRes.body?.data?.role === "Arquiteto Pleno",
    userPatchRes.body
  );

  const addMemberRes = await api(`/api/v1/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId: user2.id, roleOnProject: "Especificação FF&E" }),
  });
  report("POST /projects/:id/members → 201", addMemberRes.status === 201, addMemberRes.body);

  const addMemberAgainRes = await api(`/api/v1/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId: user2.id }),
  });
  report(
    "Adicionar o mesmo membro de novo → 409 ALREADY_MEMBER",
    addMemberAgainRes.status === 409 && addMemberAgainRes.body?.error?.code === "ALREADY_MEMBER",
    addMemberAgainRes.body
  );

  const listMembersRes = await api(`/api/v1/projects/${projectId}/members`);
  report(
    "GET /projects/:id/members inclui o novo membro",
    listMembersRes.status === 200 && listMembersRes.body?.data?.some((m: any) => m.userId === user2.id),
    listMembersRes.body
  );

  const removeMemberRes = await api(`/api/v1/projects/${projectId}/members/${user2.id}`, { method: "DELETE" });
  report("DELETE /projects/:id/members/:userId → 204", removeMemberRes.status === 204, removeMemberRes.body);

  const listMembersAfterRemoveRes = await api(`/api/v1/projects/${projectId}/members`);
  report(
    "Após remover, GET /projects/:id/members não inclui mais o membro",
    listMembersAfterRemoveRes.status === 200 && !listMembersAfterRemoveRes.body?.data?.some((m: any) => m.userId === user2.id),
    listMembersAfterRemoveRes.body
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
