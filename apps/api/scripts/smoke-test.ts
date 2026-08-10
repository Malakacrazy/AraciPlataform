// Precisa ser o primeiro import: @araci/db lê process.env.DATABASE_URL no
// carregamento do módulo (mesma ordem de apps/api/src/main.ts).
import "dotenv/config";
import { SignJWT } from "jose";
import { prisma } from "@araci/db";

// Exercises the real CRM/ERP/FF&E API over HTTP against a running NestJS
// instance + local Postgres — see docs/fase-0/ and the root README for
// how to stand those up. apps/web is never in this loop: this hits
// apps/api directly with the same short-lived internal JWT that
// apps/web's BFF proxy would mint per request (see AuthGuard). No real
// Google OAuth involved either way.
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const SECRET = process.env.INTERNAL_API_SECRET ?? "local-dev-internal-secret-do-not-use-in-prod";
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

async function mintToken(email: string) {
  const secretKey = new TextEncoder().encode(SECRET);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("60s")
    .sign(secretKey);
}

async function main() {
  const token = await mintToken(EMAIL);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
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

  const unauth = await fetch(`${BASE_URL}/v1/clients`);
  report("GET /clients sem token → 401", unauth.status === 401);

  const clientRes = await api("/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: "Fernanda Ribeiro", email: "fernanda@example.com", source: "indicacao" }),
  });
  report("POST /clients → 201", clientRes.status === 201, clientRes.body);
  const clientId = clientRes.body?.data?.id;

  const badClient = await api("/v1/clients", { method: "POST", body: JSON.stringify({}) });
  report(
    "POST /clients sem nome → 400 VALIDATION_ERROR",
    badClient.status === 400 && badClient.body?.error?.code === "VALIDATION_ERROR",
    badClient.body
  );

  const roleRateRes = await api("/v1/role-rates", {
    method: "POST",
    body: JSON.stringify({ role: "Arquiteto Líder (RT)", hourlyRate: 64.04 }),
  });
  report("POST /role-rates → 201", roleRateRes.status === 201, roleRateRes.body);

  const oppRes = await api("/v1/opportunities", {
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

  const badOpp = await api("/v1/opportunities", {
    method: "POST",
    body: JSON.stringify({ clientId: "nonexistent-id", title: "x", stage: "novo_lead", feeModel: "hora_tecnica" }),
  });
  report("POST /opportunities com clientId de outra conta/inexistente → 404", badOpp.status === 404, badOpp.body);

  const proposalRes = await api("/v1/proposals", {
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

  const stagesRes = await api(`/v1/proposals/${proposal?.id}/stages`);
  report(
    "GET /proposals/:id/stages → 200 com 5 linhas",
    stagesRes.status === 200 && Array.isArray(stagesRes.body?.data) && stagesRes.body.data.length === 5,
    stagesRes.body
  );

  const wonRes = await api(`/v1/opportunities/${opportunityId}`, {
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

  const wonAgainRes = await api(`/v1/opportunities/${opportunityId}`, {
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

  const projectRes = await api(`/v1/projects/${projectId}`);
  report("GET /projects/:id → 200 com 5 fases", projectRes.status === 200 && projectRes.body?.data?.phases?.length === 5, projectRes.body);

  const listProjectsRes = await api("/v1/projects");
  report(
    "GET /projects inclui o projeto recém-criado",
    listProjectsRes.status === 200 && listProjectsRes.body?.data?.some((p: any) => p.id === projectId),
    listProjectsRes.body
  );

  const phasesRes = await api(`/v1/projects/${projectId}/phases`);
  const phases = phasesRes.body?.data ?? [];
  report(
    "GET /projects/:id/phases → 5 fases em ordem, todas contratadas",
    phasesRes.status === 200 && phases.length === 5 && phases.every((p: any) => p.contracted),
    phases.map((p: any) => p.stage)
  );
  const [firstPhase, secondPhase] = phases.sort((a: any, b: any) => a.order - b.order);

  const outOfOrderApproval = await api(`/v1/projects/${projectId}/phases/${secondPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "email" }),
  });
  report(
    "Aprovar a 2ª fase antes da 1ª → 422 GATE_OUT_OF_ORDER (gates são sequenciais)",
    outOfOrderApproval.status === 422 && outOfOrderApproval.body?.error?.code === "GATE_OUT_OF_ORDER",
    outOfOrderApproval.body
  );

  const whatsappApproval = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "whatsapp" }),
  });
  report(
    "Aprovar via 'whatsapp' → 400 (canal inválido; PEP só aceita email/reunião presencial)",
    whatsappApproval.status === 400,
    whatsappApproval.body
  );

  const firstApproval = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "email" }),
  });
  report(
    "Aprovar a 1ª fase por e-mail → 200, approvedAt setado",
    firstApproval.status === 200 && !!firstApproval.body?.data?.approvedAt,
    firstApproval.body
  );

  const secondApprovalNow = await api(`/v1/projects/${projectId}/phases/${secondPhase.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "reuniao_presencial" }),
  });
  report(
    "Com a 1ª aprovada, aprovar a 2ª agora funciona → 200",
    secondApprovalNow.status === 200 && !!secondApprovalNow.body?.data?.approvedAt,
    secondApprovalNow.body
  );

  const phaseDatesRes = await api(`/v1/projects/${projectId}/phases/${phases[2].id}`, {
    method: "PATCH",
    body: JSON.stringify({
      startDate: "2026-09-01T00:00:00.000Z",
      dueDate: "2026-09-15T00:00:00.000Z",
      budget: 5000,
    }),
  });
  report(
    "PATCH /projects/:id/phases/:phaseId com datas/orçamento → 200, não mexe em approvedAt",
    phaseDatesRes.status === 200 &&
      phaseDatesRes.body?.data?.startDate === "2026-09-01T00:00:00.000Z" &&
      phaseDatesRes.body?.data?.dueDate === "2026-09-15T00:00:00.000Z" &&
      Number(phaseDatesRes.body?.data?.budget) === 5000 &&
      phaseDatesRes.body?.data?.approvedAt === null,
    phaseDatesRes.body
  );

  const phaseBadBudgetRes = await api(`/v1/projects/${projectId}/phases/${phases[2].id}`, {
    method: "PATCH",
    body: JSON.stringify({ budget: -100 }),
  });
  report(
    "PATCH .../phases/:phaseId com orçamento negativo → 400 VALIDATION_ERROR",
    phaseBadBudgetRes.status === 400 && phaseBadBudgetRes.body?.error?.code === "VALIDATION_ERROR",
    phaseBadBudgetRes.body
  );

  const thirdPhase = phases[2]; // ainda não aprovada
  const invoiceOnUnapproved = await api(`/v1/projects/${projectId}/phases/${thirdPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({ amount: 1000 }),
  });
  report(
    "Faturar um estágio sem gate aprovado → 422 PHASE_NOT_APPROVED",
    invoiceOnUnapproved.status === 422 && invoiceOnUnapproved.body?.error?.code === "PHASE_NOT_APPROVED",
    invoiceOnUnapproved.body
  );

  const invoiceRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({ amount: 902.98 }),
  });
  report(
    "Faturar um estágio com gate aprovado → 201",
    invoiceRes.status === 201 && invoiceRes.body?.data?.status === "pendente",
    invoiceRes.body
  );
  const invoiceId = invoiceRes.body?.data?.id;

  const invoicesListRes = await api(`/v1/invoices?projectId=${projectId}`);
  report(
    "GET /invoices?projectId= inclui a fatura recém-criada",
    invoicesListRes.status === 200 && invoicesListRes.body?.data?.some((inv: any) => inv.id === invoiceId),
    invoicesListRes.body
  );

  const invoiceStatusRes = await api(`/v1/invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "emitida", nfseNumber: "NFSe-0001" }),
  });
  report(
    "PATCH /invoices/:id marca como emitida com número da NFS-e",
    invoiceStatusRes.status === 200 && invoiceStatusRes.body?.data?.status === "emitida" && invoiceStatusRes.body?.data?.nfseNumber === "NFSe-0001",
    invoiceStatusRes.body
  );

  const timeEntryRes = await api("/v1/time-entries", {
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

  const timeEntryUpdateRes = await api(`/v1/time-entries/${timeEntryId}`, {
    method: "PATCH",
    body: JSON.stringify({ hours: 4 }),
  });
  report(
    "PATCH /time-entries/:id antes da aprovação → 200, horas atualizadas",
    timeEntryUpdateRes.status === 200 && Number(timeEntryUpdateRes.body?.data?.hours) === 4,
    timeEntryUpdateRes.body
  );

  const timeEntryApproveRes = await api(`/v1/time-entries/${timeEntryId}/approve`, { method: "POST" });
  report(
    "POST /time-entries/:id/approve → 200, approvedAt setado",
    timeEntryApproveRes.status === 200 && !!timeEntryApproveRes.body?.data?.approvedAt,
    timeEntryApproveRes.body
  );

  const timeEntryEditAfterApproval = await api(`/v1/time-entries/${timeEntryId}`, {
    method: "PATCH",
    body: JSON.stringify({ hours: 8 }),
  });
  report(
    "Editar lançamento já aprovado → 422 TIME_ENTRY_APPROVED",
    timeEntryEditAfterApproval.status === 422 && timeEntryEditAfterApproval.body?.error?.code === "TIME_ENTRY_APPROVED",
    timeEntryEditAfterApproval.body
  );

  const timeEntriesListRes = await api(`/v1/time-entries?projectId=${projectId}`);
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
  const token2 = await mintToken(email2);
  const headers2 = { "Content-Type": "application/json", Authorization: `Bearer ${token2}` };
  async function api2(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...headers2, ...(init.headers ?? {}) },
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // 204 etc.
    }
    return { status: res.status, body };
  }
  await api2("/v1/clients"); // dispara o bootstrap do segundo usuário na mesma conta

  const usersListRes = await api("/v1/users");
  const user2 = usersListRes.body?.data?.find((u: any) => u.email === email2);
  report("GET /users lista os dois usuários da conta (bootstrap funcionou para os dois)", !!user2, usersListRes.body);

  const userPatchRes = await api(`/v1/users/${user2.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "Arquiteto Pleno", specialty: "FF&E", costPerHour: 45 }),
  });
  report(
    "PATCH /users/:id atualiza papel/especialidade/custo-hora",
    userPatchRes.status === 200 && userPatchRes.body?.data?.role === "Arquiteto Pleno",
    userPatchRes.body
  );

  const addMemberRes = await api(`/v1/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId: user2.id, roleOnProject: "Especificação FF&E" }),
  });
  report("POST /projects/:id/members → 201", addMemberRes.status === 201, addMemberRes.body);

  const addMemberAgainRes = await api(`/v1/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId: user2.id }),
  });
  report(
    "Adicionar o mesmo membro de novo → 409 ALREADY_MEMBER",
    addMemberAgainRes.status === 409 && addMemberAgainRes.body?.error?.code === "ALREADY_MEMBER",
    addMemberAgainRes.body
  );

  const listMembersRes = await api(`/v1/projects/${projectId}/members`);
  report(
    "GET /projects/:id/members inclui o novo membro",
    listMembersRes.status === 200 && listMembersRes.body?.data?.some((m: any) => m.userId === user2.id),
    listMembersRes.body
  );

  const removeMemberRes = await api(`/v1/projects/${projectId}/members/${user2.id}`, { method: "DELETE" });
  report("DELETE /projects/:id/members/:userId → 204", removeMemberRes.status === 204, removeMemberRes.body);

  const listMembersAfterRemoveRes = await api(`/v1/projects/${projectId}/members`);
  report(
    "Após remover, GET /projects/:id/members não inclui mais o membro",
    listMembersAfterRemoveRes.status === 200 && !listMembersAfterRemoveRes.body?.data?.some((m: any) => m.userId === user2.id),
    listMembersAfterRemoveRes.body
  );

  const product1Res = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Sofá Modular Nuvem", supplier: "Móveis Bertolucci", price: 8200 }),
  });
  report("POST /products → 201", product1Res.status === 201, product1Res.body);
  const product1Id = product1Res.body?.data?.id;

  const product2Res = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Luminária Pendente Latão", isGeneric: true }),
  });
  report(
    "POST /products (produto genérico, sem preço) → 201",
    product2Res.status === 201 && product2Res.body?.data?.isGeneric === true,
    product2Res.body
  );
  const product2Id = product2Res.body?.data?.id;

  const areaRes = await api(`/v1/projects/${projectId}/areas`, {
    method: "POST",
    body: JSON.stringify({ name: "Sala de Estar" }),
  });
  report("POST /projects/:id/areas → 201", areaRes.status === 201, areaRes.body);
  const areaId = areaRes.body?.data?.id;

  const listAreasRes = await api(`/v1/projects/${projectId}/areas`);
  report(
    "GET /projects/:id/areas inclui a área recém-criada",
    listAreasRes.status === 200 && listAreasRes.body?.data?.some((a: any) => a.id === areaId),
    listAreasRes.body
  );

  const spec1Res = await api(`/v1/areas/${areaId}/specifications`, {
    method: "POST",
    body: JSON.stringify({ productId: product1Id, quantity: 1, unitPrice: 8200, markupPercent: 0.1 }),
  });
  report("POST /areas/:id/specifications → 201", spec1Res.status === 201, spec1Res.body);
  const spec1Id = spec1Res.body?.data?.id;

  const spec2Res = await api(`/v1/areas/${areaId}/specifications`, {
    method: "POST",
    body: JSON.stringify({ productId: product2Id }), // sem unitPrice — SKU genérico ainda sem preço
  });
  report("POST /areas/:id/specifications (produto genérico, sem unitPrice) → 201", spec2Res.status === 201, spec2Res.body);
  const spec2Id = spec2Res.body?.data?.id;

  const checkoutMissingPriceRes = await api(`/v1/projects/${projectId}/ffe-checkout`, {
    method: "POST",
    body: JSON.stringify({ specificationIds: [spec2Id] }),
  });
  report(
    "Checkout de item sem unitPrice → 422 MISSING_PRICE",
    checkoutMissingPriceRes.status === 422 && checkoutMissingPriceRes.body?.error?.code === "MISSING_PRICE",
    checkoutMissingPriceRes.body
  );

  const checkoutRes = await api(`/v1/projects/${projectId}/ffe-checkout`, {
    method: "POST",
    body: JSON.stringify({ specificationIds: [spec1Id] }),
  });
  report(
    "Checkout do carrinho FF&E → 201, gera Invoice (1 × 8200 × 1.10 = 9020)",
    checkoutRes.status === 201 && Math.abs(Number(checkoutRes.body?.data?.amount) - 9020) < 0.01,
    checkoutRes.body
  );
  const ffeInvoiceId = checkoutRes.body?.data?.id;

  const specsAfterCheckoutRes = await api(`/v1/areas/${areaId}/specifications`);
  const spec1AfterCheckout = specsAfterCheckoutRes.body?.data?.find((s: any) => s.id === spec1Id);
  report(
    "Fluxo automático: checkout marca a especificação como clientApproved",
    spec1AfterCheckout?.clientApproved === true,
    spec1AfterCheckout
  );

  const ffeInvoiceListRes = await api(`/v1/invoices?projectId=${projectId}`);
  report(
    "A fatura de FF&E aparece em GET /invoices sem phaseId (não é um estágio do PEP)",
    ffeInvoiceListRes.body?.data?.some((inv: any) => inv.id === ffeInvoiceId && inv.phaseId === null),
    ffeInvoiceListRes.body
  );

  const driveLinkRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "DRIVE",
      externalId: "1a2b3c-drive-file-id",
      url: "https://drive.google.com/file/d/1a2b3c-drive-file-id/view",
      title: "Planta baixa - v3.pdf",
    }),
  });
  report("POST /projects/:id/office-links (DRIVE) → 201", driveLinkRes.status === 201, driveLinkRes.body);
  const driveLinkId = driveLinkRes.body?.data?.id;

  const calendarLinkRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "CALENDAR",
      externalId: "evt-briefing-kickoff",
      url: "https://calendar.google.com/calendar/event?eid=evt-briefing-kickoff",
      title: "Reunião de briefing",
    }),
  });
  report("POST /projects/:id/office-links (CALENDAR) → 201", calendarLinkRes.status === 201, calendarLinkRes.body);

  const listProjectLinksRes = await api(`/v1/projects/${projectId}/office-links`);
  report(
    "GET /projects/:id/office-links inclui os dois vínculos (Drive e Calendar)",
    listProjectLinksRes.status === 200 && listProjectLinksRes.body?.data?.length === 2,
    listProjectLinksRes.body
  );

  const clientLinkRes = await api(`/v1/clients/${clientId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "DRIVE",
      externalId: "9x8y7z-drive-folder-id",
      url: "https://drive.google.com/drive/folders/9x8y7z-drive-folder-id",
      title: "Pasta do cliente",
    }),
  });
  report("POST /clients/:id/office-links (DRIVE) → 201", clientLinkRes.status === 201, clientLinkRes.body);

  const listClientLinksRes = await api(`/v1/clients/${clientId}/office-links`);
  report(
    "GET /clients/:id/office-links só traz o vínculo do cliente, não os do projeto",
    listClientLinksRes.status === 200 && listClientLinksRes.body?.data?.length === 1,
    listClientLinksRes.body
  );

  const badProviderLinkRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({ provider: "DROPBOX", externalId: "x", url: "https://example.com", title: "x" }),
  });
  report(
    "POST /office-links com provider inválido → 400 VALIDATION_ERROR",
    badProviderLinkRes.status === 400 && badProviderLinkRes.body?.error?.code === "VALIDATION_ERROR",
    badProviderLinkRes.body
  );

  const badUrlLinkRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({ provider: "DRIVE", externalId: "x", url: "not-a-url", title: "x" }),
  });
  report(
    "POST /office-links com url inválida → 400 VALIDATION_ERROR",
    badUrlLinkRes.status === 400 && badUrlLinkRes.body?.error?.code === "VALIDATION_ERROR",
    badUrlLinkRes.body
  );

  const linkOnMissingProjectRes = await api("/v1/projects/does-not-exist/office-links", {
    method: "POST",
    body: JSON.stringify({ provider: "DRIVE", externalId: "x", url: "https://example.com", title: "x" }),
  });
  report(
    "POST /projects/:id/office-links em projeto inexistente → 404",
    linkOnMissingProjectRes.status === 404,
    linkOnMissingProjectRes.body
  );

  const deleteLinkRes = await api(`/v1/office-links/${driveLinkId}`, { method: "DELETE" });
  report("DELETE /office-links/:id → 204", deleteLinkRes.status === 204, deleteLinkRes.body);

  const listProjectLinksAfterDeleteRes = await api(`/v1/projects/${projectId}/office-links`);
  report(
    "Após deletar, GET /projects/:id/office-links não inclui mais o vínculo removido",
    listProjectLinksAfterDeleteRes.status === 200 &&
      !listProjectLinksAfterDeleteRes.body?.data?.some((l: any) => l.id === driveLinkId),
    listProjectLinksAfterDeleteRes.body
  );

  // OfficeLink não tem FK para Project/Client (é polimórfico — ver
  // office-links.service.ts), então excluir o dono não dispara P2003 nem
  // CASCADE automático: precisa da limpeza explícita em
  // ClientsService.deleteClient (mesmo em ProjectsService.deleteProject,
  // mas isso não é testável aqui — DELETE /projects/:id já 409 sempre,
  // porque toda Project nasce com 5 ProjectPhase e phases.controller.ts
  // não expõe rota de delete; o fix lá é so por paridade/defensivo, não
  // um caminho alcançável hoje). HTTP sozinho não prova a limpeza do
  // cliente (a listagem já dá 404 antes de listar, órfão ou não), então
  // confere direto no banco.
  const throwawayClientRes = await api("/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: "Cliente Descartável (teste de limpeza)" }),
  });
  const throwawayClientId = throwawayClientRes.body?.data?.id;

  await api(`/v1/clients/${throwawayClientId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "CALENDAR",
      externalId: "throwaway-evt-id",
      url: "https://calendar.google.com/calendar/event?eid=throwaway-evt-id",
      title: "Evento do cliente descartável",
    }),
  });
  const orphanCountBefore = await prisma.officeLink.count({ where: { entityId: throwawayClientId } });
  report("Setup: OfficeLink criado para o cliente descartável antes do delete", orphanCountBefore === 1, orphanCountBefore);

  const deleteThrowawayClientRes = await api(`/v1/clients/${throwawayClientId}`, { method: "DELETE" });
  report(
    "DELETE /clients/:id → 204 mesmo com OfficeLink vinculado, sem oportunidade (não é 409)",
    deleteThrowawayClientRes.status === 204,
    deleteThrowawayClientRes.body
  );

  const orphanCountAfter = await prisma.officeLink.count({ where: { entityId: throwawayClientId } });
  report(
    "Excluir o cliente limpa o OfficeLink junto — zero órfãos no banco (não só 404 na listagem)",
    orphanCountAfter === 0,
    orphanCountAfter
  );

  const deleteProductInUseRes = await api(`/v1/products/${product1Id}`, { method: "DELETE" });
  report(
    "DELETE /products/:id em uso por uma especificação → 409 CONFLICT (não 500)",
    deleteProductInUseRes.status === 409 && deleteProductInUseRes.body?.error?.code === "CONFLICT",
    deleteProductInUseRes.body
  );

  const deleteConflict = await api(`/v1/clients/${clientId}`, { method: "DELETE" });
  report(
    "DELETE /clients/:id com oportunidade vinculada → 409 CONFLICT (não 500)",
    deleteConflict.status === 409 && deleteConflict.body?.error?.code === "CONFLICT",
    deleteConflict.body
  );

  const notFound = await api("/v1/clients/does-not-exist");
  report("GET /clients/:id inexistente → 404", notFound.status === 404, notFound.body);

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
