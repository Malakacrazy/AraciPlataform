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

  // O primeiro POST acima já criou o User (ensureAccountAndUser, lazy no
  // primeiro request autenticado) -- mas como a Account já existe há
  // muito tempo, ele nasce accessLevel:'staff' por padrão (só quem cria a
  // conta pela primeira vez nasce admin, ver AuthService). O resto deste
  // script sempre assumiu acesso total (fiscal, invoices, role-rates,
  // deletes) -- promovido aqui pra manter esse comportamento, não pra
  // testar o caminho staff (isso tem seção própria mais abaixo).
  await prisma.user.update({ where: { email: EMAIL }, data: { accessLevel: "admin" } });

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

  // --- Versionamento e assinatura de proposta -----------------------
  // Recalcular pra mesma Opportunity deve criar v2 e expirar a v1 (ainda
  // "draft") em vez de deixar duas propostas abertas ao mesmo tempo.
  const proposalV2Res = await api("/v1/proposals", {
    method: "POST",
    body: JSON.stringify({
      opportunityId,
      roleHours: [{ role: "Arquiteto Líder (RT)", stage: "CAPTACAO_ALINHAMENTO", hours: 8 }],
      complexityScores: { tipologia: 3, programaEscopo: 3, terreno: 3, regulatorio: 3, ambicaoDesign: 3 },
      contractedStages: ["CAPTACAO_ALINHAMENTO"],
    }),
  });
  const proposalV2 = proposalV2Res.body?.data;
  report(
    "Recalcular a mesma Opportunity → v2, com previousVersionId apontando pra v1",
    proposalV2Res.status === 201 && proposalV2?.version === 2 && proposalV2?.previousVersionId === proposal?.id,
    proposalV2Res.body
  );

  const proposalV1AfterRes = await api(`/v1/proposals/${proposal?.id}`);
  report(
    "v1 (ainda draft) vira 'expired' automaticamente ao criar a v2",
    proposalV1AfterRes.body?.data?.status === "expired",
    proposalV1AfterRes.body
  );

  // sendForSignature chama a ZapSign de verdade -- mesma decisão já
  // tomada pra Asaas (ver POST /invoices/:id/charge mais abaixo): não
  // vale a pena disparar isso a cada execução automática do smoke suite
  // (custo/efeito colateral num serviço externo real), então esta
  // cobertura fica pra verificação manual, uma vez, com a chave sandbox
  // de verdade. O que dá pra testar de forma real e repetível é o
  // webhook: fixa via Prisma o que sendForSignature() teria gravado
  // (zapsignDocToken/status/zapsignSignUrl), depois faz um POST de
  // verdade no endpoint do webhook -- mesmo padrão já usado pro webhook
  // da Asaas.
  const fakeZapsignDocToken = `smoke-test-zapsign-doc-${Date.now()}`;
  await prisma.proposal.update({
    where: { id: proposalV2?.id },
    data: { status: "sent", sentAt: new Date(), zapsignDocToken: fakeZapsignDocToken, zapsignSignUrl: "https://app.zapsign.com.br/verificar/fake-sandbox-url" },
  });

  const webhookNoTokenRes = await fetch(`${BASE_URL}/v1/zapsign/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: "doc_signed", token: fakeZapsignDocToken }),
  });
  report(
    "POST /zapsign/webhook sem zapsign-webhook-token → 401",
    webhookNoTokenRes.status === 401,
    await webhookNoTokenRes.json().catch(() => null)
  );

  const zapsignWebhookToken = process.env.ZAPSIGN_WEBHOOK_AUTH_TOKEN;
  const webhookRes = await fetch(`${BASE_URL}/v1/zapsign/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "zapsign-webhook-token": zapsignWebhookToken ?? "" },
    body: JSON.stringify({
      event_type: "doc_signed",
      token: fakeZapsignDocToken,
      signers: [{ name: "Fernanda Ribeiro", email: "fernanda@example.com", signed_at: new Date().toISOString() }],
    }),
  });
  report("POST /zapsign/webhook com token certo → 200", webhookRes.status === 200, await webhookRes.json().catch(() => null));

  const proposalV2AfterWebhookRes = await api(`/v1/proposals/${proposalV2?.id}`);
  report(
    "Webhook doc_signed → status vira 'signed' com signerName gravado",
    proposalV2AfterWebhookRes.body?.data?.status === "signed" &&
      proposalV2AfterWebhookRes.body?.data?.signerName === "Fernanda Ribeiro",
    proposalV2AfterWebhookRes.body
  );

  const webhookAgainRes = await fetch(`${BASE_URL}/v1/zapsign/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "zapsign-webhook-token": zapsignWebhookToken ?? "" },
    body: JSON.stringify({ event_type: "doc_signed", token: fakeZapsignDocToken, signers: [{ name: "Outra pessoa" }] }),
  });
  const proposalV2AfterSecondWebhookRes = await api(`/v1/proposals/${proposalV2?.id}`);
  report(
    "Reenviar o mesmo evento doc_signed → idempotente (não sobrescreve o signerName já gravado)",
    webhookAgainRes.status === 200 && proposalV2AfterSecondWebhookRes.body?.data?.signerName === "Fernanda Ribeiro",
    proposalV2AfterSecondWebhookRes.body
  );

  // Validação que acontece antes de qualquer chamada real pra ZapSign --
  // seguro de testar sem tocar no serviço externo.
  const sendAlreadySignedRes = await api(`/v1/proposals/${proposalV2?.id}/send-for-signature`, { method: "POST" });
  report(
    "POST /proposals/:id/send-for-signature numa proposta já assinada → 422 PROPOSAL_NOT_SENDABLE",
    sendAlreadySignedRes.status === 422 && sendAlreadySignedRes.body?.error?.code === "PROPOSAL_NOT_SENDABLE",
    sendAlreadySignedRes.body
  );

  const signAuditRes = await api(`/v1/audit-log?entityType=Proposal&entityId=${proposalV2?.id}&action=update`);
  const signAuditEntry = signAuditRes.body?.data?.entries?.find((e: any) => e.changes?.status?.to === "signed");
  report(
    "Assinar pelo link público atribui o log ao ator 'client' certo, não ao default 'system'",
    signAuditEntry?.actorType === "client" && signAuditEntry?.actorEmail === "fernanda@example.com",
    signAuditEntry
  );

  const proposalSignedNotificationRes = await api("/v1/notifications");
  report(
    "Assinar a proposta pelo link público gera notificação pro admin (type: proposal_signed)",
    proposalSignedNotificationRes.body?.data?.notifications?.some(
      (n: any) => n.type === "proposal_signed" && n.opportunityId === opportunityId
    ),
    proposalSignedNotificationRes.body?.data?.notifications?.length
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

  const activityRes = await api(`/v1/projects/${projectId}/activities`, {
    method: "POST",
    body: JSON.stringify({ body: "Ligação com a cliente: aprovou o conceito por telefone." }),
  });
  report("POST /projects/:id/activities → 201", activityRes.status === 201, activityRes.body);
  const activityId = activityRes.body?.data?.id;

  const listActivitiesRes = await api(`/v1/projects/${projectId}/activities`);
  const activityCreated = listActivitiesRes.body?.data?.find((a: any) => a.id === activityId);
  report(
    "GET /projects/:id/activities inclui a nota recém-criada, com autor",
    listActivitiesRes.status === 200 && activityCreated?.author?.email === EMAIL,
    listActivitiesRes.body
  );

  const deleteActivityRes = await api(`/v1/activities/${activityId}`, { method: "DELETE" });
  report("DELETE /activities/:id → 204", deleteActivityRes.status === 204, deleteActivityRes.body);

  const listActivitiesAfterDeleteRes = await api(`/v1/projects/${projectId}/activities`);
  report(
    "Após remover, GET /projects/:id/activities não inclui mais a nota",
    !listActivitiesAfterDeleteRes.body?.data?.some((a: any) => a.id === activityId),
    listActivitiesAfterDeleteRes.body
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

  // O projeto deste run é hora_tecnica (feeModel na criação da Opportunity,
  // linha ~97) -- fatura de estágio pra esse feeModel é calculada a partir
  // de TimeEntry aprovada, não de um valor digitado (ver
  // InvoicesService.createHourlyInvoice). Testa a cadeia de regras nessa
  // ordem: sem hora nenhuma → sem hora aprovada → amount não permitido →
  // papel sem tarifa → sucesso → não pode faturar de novo.
  const invoiceSemHorasRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "Faturar hora_tecnica sem nenhuma hora apontada → 422 NO_APPROVED_HOURS",
    invoiceSemHorasRes.status === 422 && invoiceSemHorasRes.body?.error?.code === "NO_APPROVED_HOURS",
    invoiceSemHorasRes.body
  );

  const horasFaturaveisRes = await api("/v1/time-entries", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      phaseId: firstPhase.id,
      date: new Date().toISOString(),
      hours: 5,
      activityType: "projeto",
    }),
  });
  report("POST /time-entries (horas a faturar) → 201", horasFaturaveisRes.status === 201, horasFaturaveisRes.body);
  const horasFaturaveisId = horasFaturaveisRes.body?.data?.id;

  const invoiceComHoraNaoAprovadaRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "Faturar com hora lançada mas ainda não aprovada → 422 NO_APPROVED_HOURS",
    invoiceComHoraNaoAprovadaRes.status === 422 && invoiceComHoraNaoAprovadaRes.body?.error?.code === "NO_APPROVED_HOURS",
    invoiceComHoraNaoAprovadaRes.body
  );

  const aprovarHorasFaturaveisRes = await api(`/v1/time-entries/${horasFaturaveisId}/approve`, { method: "POST" });
  report(
    "POST /time-entries/:id/approve (horas a faturar) → 200",
    aprovarHorasFaturaveisRes.status === 200 && !!aprovarHorasFaturaveisRes.body?.data?.approvedAt,
    aprovarHorasFaturaveisRes.body
  );

  const invoiceComAmountRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({ amount: 902.98 }),
  });
  report(
    "Faturar hora_tecnica enviando amount → 422 AMOUNT_NOT_ALLOWED",
    invoiceComAmountRes.status === 422 && invoiceComAmountRes.body?.error?.code === "AMOUNT_NOT_ALLOWED",
    invoiceComAmountRes.body
  );

  // O usuário deste smoke test nasce com role 'admin' (ver auth.service.ts).
  // RoleRate é dado de referência da conta inteira e sobrevive de propósito
  // entre execuções do smoke suite (mesma convenção já valendo pra
  // "Arquiteto Líder (RT)" acima) -- então uma execução anterior pode já
  // ter deixado uma tarifa cadastrada pro papel 'admin'. Reseta na unha
  // antes de provar o caminho de erro; a tarifa de verdade é recriada duas
  // linhas abaixo mesmo, então isso não é "limpeza de resíduo", é garantir
  // a pré-condição do teste independente do histórico do banco.
  const smokeUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  await prisma.roleRate.deleteMany({ where: { accountId: smokeUser!.accountId, role: "admin" } });

  const invoiceSemTarifaRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "Faturar hora aprovada de papel sem RoleRate cadastrada → 422 ROLE_RATE_MISSING",
    invoiceSemTarifaRes.status === 422 && invoiceSemTarifaRes.body?.error?.code === "ROLE_RATE_MISSING",
    invoiceSemTarifaRes.body
  );

  const roleRateAdminRes = await api("/v1/role-rates", {
    method: "POST",
    body: JSON.stringify({ role: "admin", hourlyRate: 80 }),
  });
  report("POST /role-rates (papel 'admin') → 201", roleRateAdminRes.status === 201, roleRateAdminRes.body);

  const invoiceRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "Faturar hora_tecnica com hora aprovada e tarifa cadastrada → 201, valor = horas × tarifa",
    invoiceRes.status === 201 &&
      invoiceRes.body?.data?.status === "pendente" &&
      Number(invoiceRes.body?.data?.amount) === 400,
    invoiceRes.body
  );
  report(
    "Fatura por hora traz uma InvoiceLine por papel, com hours/hourlyRate/amount corretos",
    invoiceRes.body?.data?.lines?.length === 1 &&
      invoiceRes.body.data.lines[0].role === "admin" &&
      Number(invoiceRes.body.data.lines[0].hours) === 5 &&
      Number(invoiceRes.body.data.lines[0].hourlyRate) === 80 &&
      Number(invoiceRes.body.data.lines[0].amount) === 400,
    invoiceRes.body
  );
  const invoiceId = invoiceRes.body?.data?.id;

  const invoiceDuplicadaRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "Faturar o mesmo estágio de novo → 422 PHASE_ALREADY_INVOICED",
    invoiceDuplicadaRes.status === 422 && invoiceDuplicadaRes.body?.error?.code === "PHASE_ALREADY_INVOICED",
    invoiceDuplicadaRes.body
  );

  const invoicesListRes = await api(`/v1/invoices?projectId=${projectId}`);
  report(
    "GET /invoices?projectId= inclui a fatura recém-criada",
    invoicesListRes.status === 200 && invoicesListRes.body?.data?.some((inv: any) => inv.id === invoiceId),
    invoicesListRes.body
  );

  const invoiceStatusRes = await api(`/v1/invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "emitida",
      nfseNumber: "NFSe-0001",
      cstIbs: "000",
      cstCbs: "000",
      cClassTrib: "000001",
    }),
  });
  report(
    "PATCH /invoices/:id marca como emitida com número da NFS-e e campos da Reforma Tributária",
    invoiceStatusRes.status === 200 &&
      invoiceStatusRes.body?.data?.status === "emitida" &&
      invoiceStatusRes.body?.data?.nfseNumber === "NFSe-0001" &&
      invoiceStatusRes.body?.data?.cstIbs === "000" &&
      invoiceStatusRes.body?.data?.cstCbs === "000" &&
      invoiceStatusRes.body?.data?.cClassTrib === "000001",
    invoiceStatusRes.body
  );

  // Cobrança via Asaas — sem ASAAS_API_KEY configurada neste ambiente
  // (segredo real, nunca no smoke test), então só o caminho "não
  // configurado" é testável fazendo a chamada de verdade. O resto do
  // fluxo (webhook confirmando pagamento) é testado adiante simulando o
  // que chargeInvoice() teria gravado — asaasPaymentId setado direto via
  // Prisma, igual ao padrão já usado nos testes de OfficeLink órfão.
  const chargeSemApiKeyRes = await api(`/v1/invoices/${invoiceId}/charge`, { method: "POST" });
  report(
    "POST /invoices/:id/charge sem ASAAS_API_KEY → 422 ASAAS_NOT_CONFIGURED",
    chargeSemApiKeyRes.status === 422 && chargeSemApiKeyRes.body?.error?.code === "ASAAS_NOT_CONFIGURED",
    chargeSemApiKeyRes.body
  );

  const webhookTokenErrado = await fetch(`${BASE_URL}/v1/billing/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": "chave-errada" },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: "pay_x" } }),
  });
  report(
    "POST /billing/asaas/webhook com asaas-access-token errado → 401",
    webhookTokenErrado.status === 401,
    await webhookTokenErrado.json().catch(() => null)
  );

  const fakeAsaasPaymentId = `pay_smoketest_${Date.now()}`;
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { asaasPaymentId: fakeAsaasPaymentId, status: "emitida", paidAt: null },
  });
  const webhookTokenCorretoRes = await fetch(`${BASE_URL}/v1/billing/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": process.env.ASAAS_WEBHOOK_AUTH_TOKEN ?? "" },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: fakeAsaasPaymentId } }),
  });
  const invoiceAposWebhook = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  report(
    "POST /billing/asaas/webhook com PAYMENT_RECEIVED → 200, Invoice vira 'paga'",
    webhookTokenCorretoRes.status === 200 &&
      invoiceAposWebhook?.status === "paga" &&
      invoiceAposWebhook?.paidAt !== null,
    { webhookStatus: webhookTokenCorretoRes.status, invoiceStatus: invoiceAposWebhook?.status }
  );

  const webhookReenviadoRes = await fetch(`${BASE_URL}/v1/billing/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": process.env.ASAAS_WEBHOOK_AUTH_TOKEN ?? "" },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: fakeAsaasPaymentId } }),
  });
  report(
    "Reenviar o mesmo evento de pagamento → 200, idempotente (sem erro)",
    webhookReenviadoRes.status === 200,
    await webhookReenviadoRes.json().catch(() => null)
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

  // --- Tarefas (Task model existia sem controller/service/tela --------
  // achado da auditoria: "dead code") -------------------------------
  const taskBadAssigneeRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "x", assigneeId: "nonexistent-id" }),
  });
  report(
    "POST .../tasks com assigneeId inexistente → 404",
    taskBadAssigneeRes.status === 404,
    taskBadAssigneeRes.body
  );

  const task1Res = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "Aprovar paleta de cores", assigneeId: user2.id }),
  });
  report(
    "POST .../phases/:phaseId/tasks → 201, nasce 'a_fazer' com assignee de verdade",
    task1Res.status === 201 && task1Res.body?.data?.status === "a_fazer" && task1Res.body?.data?.assignee?.id === user2.id,
    task1Res.body
  );
  const task1Id = task1Res.body?.data?.id;

  const taskBadDependsOnRes = await api(`/v1/projects/${projectId}/phases/${secondPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "x", dependsOnIds: ["nonexistent-id"] }),
  });
  report(
    "POST .../tasks com dependsOnIds apontando pra tarefa inexistente → 404",
    taskBadDependsOnRes.status === 404,
    taskBadDependsOnRes.body
  );

  const task2Res = await api(`/v1/projects/${projectId}/phases/${secondPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "Encomendar tecido", dependsOnIds: [task1Id] }),
  });
  report(
    "POST .../tasks com dependsOnIds válido (fase diferente da tarefa-alvo) → 201",
    task2Res.status === 201 && task2Res.body?.data?.dependsOn?.[0]?.id === task1Id,
    task2Res.body
  );
  const task2Id = task2Res.body?.data?.id;

  const cycleRes = await api(`/v1/tasks/${task1Id}`, {
    method: "PATCH",
    body: JSON.stringify({ dependsOnIds: [task2Id] }),
  });
  report(
    "Fazer task1 depender de task2 (que já depende de task1) → 422 TASK_DEPENDENCY_CYCLE",
    cycleRes.status === 422 && cycleRes.body?.error?.code === "TASK_DEPENDENCY_CYCLE",
    cycleRes.body
  );

  const blockedRes = await api(`/v1/tasks/${task2Id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "concluida" }),
  });
  report(
    "Concluir task2 antes de task1 (dependência) → 422 TASK_BLOCKED",
    blockedRes.status === 422 && blockedRes.body?.error?.code === "TASK_BLOCKED",
    blockedRes.body
  );

  const completeTask1Res = await api(`/v1/tasks/${task1Id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "concluida" }),
  });
  report(
    "Concluir task1 (sem dependências pendentes) → 200, completedAt setado",
    completeTask1Res.status === 200 &&
      completeTask1Res.body?.data?.status === "concluida" &&
      !!completeTask1Res.body?.data?.completedAt,
    completeTask1Res.body
  );

  const unblockedRes = await api(`/v1/tasks/${task2Id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "concluida" }),
  });
  report(
    "Com task1 concluída, concluir task2 agora funciona → 200",
    unblockedRes.status === 200 && unblockedRes.body?.data?.status === "concluida",
    unblockedRes.body
  );

  const listTasksRes = await api(`/v1/projects/${projectId}/tasks`);
  report(
    "GET /projects/:id/tasks → inclui as duas tarefas, ordenadas por fase",
    listTasksRes.status === 200 &&
      listTasksRes.body?.data?.length === 2 &&
      listTasksRes.body.data[0].id === task1Id &&
      listTasksRes.body.data[1].id === task2Id,
    listTasksRes.body
  );

  const deleteTaskRes = await api(`/v1/tasks/${task2Id}`, { method: "DELETE" });
  report("DELETE /tasks/:id → 204", deleteTaskRes.status === 204, deleteTaskRes.body);

  const listAfterDeleteTaskRes = await api(`/v1/projects/${projectId}/tasks`);
  report(
    "Após remover task2, só task1 aparece na listagem",
    listAfterDeleteTaskRes.body?.data?.length === 1 && listAfterDeleteTaskRes.body?.data?.[0]?.id === task1Id,
    listAfterDeleteTaskRes.body
  );

  const userPatchRes = await api(`/v1/users/${user2.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "Arquiteto Pleno", specialty: "FF&E", costPerHour: 45 }),
  });
  report(
    "PATCH /users/:id atualiza papel/especialidade/custo-hora",
    userPatchRes.status === 200 && userPatchRes.body?.data?.role === "Arquiteto Pleno",
    userPatchRes.body
  );

  // Extensão Captura autentica com X-Api-Key em vez do Bearer interno —
  // ver AuthGuard. Testado contra a API real (não mockado) porque o
  // caminho inteiro (gerar → hash → bater no header → resolver
  // accountId/userId) só existe de fato batendo no banco.
  const noKeyYetRes = await api(`/v1/products`, {
    headers: { "X-Api-Key": "chave-inexistente" },
  });
  report(
    "GET /products com X-Api-Key inválida → 401, mesmo com Bearer válido também presente",
    noKeyYetRes.status === 401,
    noKeyYetRes.body
  );

  const generateKeyRes = await api(`/v1/users/${user2.id}/api-key`, { method: "POST" });
  const apiKey = generateKeyRes.body?.data?.apiKey;
  report(
    "POST /users/:id/api-key → 201, devolve a chave em texto puro",
    generateKeyRes.status === 201 && typeof apiKey === "string" && apiKey.startsWith("araci_"),
    generateKeyRes.body
  );

  const productViaApiKeyRes = await api(`/v1/products`, {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: JSON.stringify({ name: "Sofá capturado via extensão", price: 4200 }),
  });
  report(
    "POST /products autenticado só com X-Api-Key → 201",
    productViaApiKeyRes.status === 201,
    productViaApiKeyRes.body
  );

  const regenerateKeyRes = await api(`/v1/users/${user2.id}/api-key`, { method: "POST" });
  const newApiKey = regenerateKeyRes.body?.data?.apiKey;
  const oldKeyAfterRegenRes = await api(`/v1/products`, { headers: { "X-Api-Key": apiKey } });
  report(
    "Regenerar a chave invalida a anterior → 401 com a chave antiga",
    regenerateKeyRes.status === 201 && newApiKey !== apiKey && oldKeyAfterRegenRes.status === 401,
    { regenerateKeyRes: regenerateKeyRes.body, oldKeyAfterRegenRes: oldKeyAfterRegenRes.body }
  );

  const revokeKeyRes = await api(`/v1/users/${user2.id}/api-key`, { method: "DELETE" });
  const afterRevokeRes = await api(`/v1/products`, { headers: { "X-Api-Key": newApiKey } });
  report(
    "DELETE /users/:id/api-key → 204, e a chave revogada para de autenticar",
    revokeKeyRes.status === 204 && afterRevokeRes.status === 401,
    { revokeKeyRes: revokeKeyRes.body, afterRevokeRes: afterRevokeRes.body }
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

  const capacityDefaultRes = await api(`/v1/users/${user2.id}`);
  report(
    "weeklyCapacityHours vem com default 40 (não precisa setar em cada usuário)",
    Number(capacityDefaultRes.body?.data?.weeklyCapacityHours) === 40,
    capacityDefaultRes.body
  );

  const createAllocationRes = await api("/v1/allocations", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      projectId,
      hoursPerWeek: 20,
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-09-30T00:00:00.000Z",
    }),
  });
  report(
    "POST /allocations → 201, inclui user e project (com phases e client)",
    createAllocationRes.status === 201 &&
      createAllocationRes.body?.data?.user?.id === user2.id &&
      Array.isArray(createAllocationRes.body?.data?.project?.phases),
    createAllocationRes.body
  );
  const allocationId = createAllocationRes.body?.data?.id;

  const badRangeRes = await api("/v1/allocations", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      projectId,
      hoursPerWeek: 10,
      startDate: "2026-09-30T00:00:00.000Z",
      endDate: "2026-09-01T00:00:00.000Z",
    }),
  });
  report(
    "POST /allocations com data de término antes do início → 400 VALIDATION_ERROR",
    badRangeRes.status === 400 && badRangeRes.body?.error?.code === "VALIDATION_ERROR",
    badRangeRes.body
  );

  const allocationBadProjectRes = await api("/v1/allocations", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      projectId: "does-not-exist",
      hoursPerWeek: 10,
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-09-30T00:00:00.000Z",
    }),
  });
  report("POST /allocations em projeto inexistente → 404", allocationBadProjectRes.status === 404, allocationBadProjectRes.body);

  const listAllocationsRes = await api(`/v1/allocations?userId=${user2.id}`);
  report(
    "GET /allocations?userId= inclui a alocação recém-criada",
    listAllocationsRes.status === 200 && listAllocationsRes.body?.data?.some((a: any) => a.id === allocationId),
    listAllocationsRes.body
  );

  const deleteAllocationRes = await api(`/v1/allocations/${allocationId}`, { method: "DELETE" });
  report("DELETE /allocations/:id → 204", deleteAllocationRes.status === 204, deleteAllocationRes.body);

  const listAllocationsAfterDeleteRes = await api(`/v1/allocations?userId=${user2.id}`);
  report(
    "Após remover, GET /allocations não inclui mais a alocação",
    listAllocationsAfterDeleteRes.status === 200 && !listAllocationsAfterDeleteRes.body?.data?.some((a: any) => a.id === allocationId),
    listAllocationsAfterDeleteRes.body
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

  // Captura reenvia o mesmo item toda vez que o orçamento é mandado de
  // novo — sem upsert por sourceUrl, cada reenvio duplicava o Product.
  const capturedSourceUrl = "https://www.leroymerlin.com.br/produto-verify-dedup";
  const capturedFirstRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Torneira Monocomando (v1)", price: 350, sourceUrl: capturedSourceUrl }),
  });
  const capturedSecondRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Torneira Monocomando (v2, preço atualizado)", price: 399, sourceUrl: capturedSourceUrl }),
  });
  report(
    "POST /products duas vezes com o mesmo sourceUrl → mesmo id, dados atualizados (não duplica)",
    capturedFirstRes.status === 201 &&
      capturedSecondRes.status === 201 &&
      capturedFirstRes.body?.data?.id === capturedSecondRes.body?.data?.id &&
      capturedSecondRes.body?.data?.name === "Torneira Monocomando (v2, preço atualizado)" &&
      Number(capturedSecondRes.body?.data?.price) === 399,
    { first: capturedFirstRes.body, second: capturedSecondRes.body }
  );
  const listAfterDedupRes = await api("/v1/products");
  report(
    "GET /products depois do reenvio tem só uma linha para o sourceUrl reenviado",
    listAfterDedupRes.body?.data?.filter((p: any) => p.sourceUrl === capturedSourceUrl).length === 1,
    listAfterDedupRes.body
  );

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

  const moodboardRes = await api(`/v1/projects/${projectId}/moodboards`, {
    method: "POST",
    body: JSON.stringify({ name: "Sala de Estar — Conceito 1" }),
  });
  report("POST /projects/:id/moodboards → 201", moodboardRes.status === 201, moodboardRes.body);
  const moodboardId = moodboardRes.body?.data?.id;

  const moodboardItemRes = await api(`/v1/moodboards/${moodboardId}/items`, {
    method: "POST",
    body: JSON.stringify({ productId: product1Id }),
  });
  report(
    "POST /moodboards/:id/items → 201, inclui o produto",
    moodboardItemRes.status === 201 && moodboardItemRes.body?.data?.product?.id === product1Id,
    moodboardItemRes.body
  );
  const moodboardItemId = moodboardItemRes.body?.data?.id;

  const moodboardListRes = await api(`/v1/projects/${projectId}/moodboards`);
  const listedMoodboard = moodboardListRes.body?.data?.find((m: any) => m.id === moodboardId);
  report(
    "GET /projects/:id/moodboards inclui a prancha com o item",
    listedMoodboard?.items?.length === 1 && listedMoodboard.items[0].id === moodboardItemId,
    moodboardListRes.body
  );

  const deleteMoodboardItemRes = await api(`/v1/moodboard-items/${moodboardItemId}`, { method: "DELETE" });
  report("DELETE /moodboard-items/:id → 204", deleteMoodboardItemRes.status === 204, deleteMoodboardItemRes.body);

  const deleteMoodboardRes = await api(`/v1/moodboards/${moodboardId}`, { method: "DELETE" });
  report(
    "DELETE /moodboards/:id → 204 (cascade cuida dos itens, já sem nenhum aqui)",
    deleteMoodboardRes.status === 204,
    deleteMoodboardRes.body
  );

  // --- Link de apresentação: sem sessão nenhuma a partir daqui, o token
  // na URL é a única credencial. `api()` continua mandando o Bearer
  // interno (é o mesmo helper), mas as rotas /v1/present/:token são
  // @Public() e nem olham pra ele -- por isso o teste de "sem token
  // nenhum" abaixo usa fetch() puro, não api(), pra provar de verdade
  // que funciona sem Authorization.
  const noLinkYetRes = await api(`/v1/projects/${projectId}/presentation-link`);
  report(
    "GET /projects/:id/presentation-link antes de gerar → 200 com data null",
    noLinkYetRes.status === 200 && noLinkYetRes.body?.data === null,
    noLinkYetRes.body
  );

  const bogusTokenRes = await fetch(`${BASE_URL}/v1/present/token-que-nao-existe`);
  report(
    "GET /v1/present/:token com token inválido → 404, sem precisar de nenhum header",
    bogusTokenRes.status === 404,
    await bogusTokenRes.json().catch(() => null)
  );

  const createLinkRes = await api(`/v1/projects/${projectId}/presentation-link`, { method: "POST" });
  report("POST /projects/:id/presentation-link → 201, devolve token", createLinkRes.status === 201 && !!createLinkRes.body?.data?.token, createLinkRes.body);
  const firstToken = createLinkRes.body?.data?.token;

  const publicViewRes = await fetch(`${BASE_URL}/v1/present/${firstToken}`);
  const publicViewBody = await publicViewRes.json().catch(() => null);
  report(
    "GET /v1/present/:token sem Authorization → 200, traz cliente/áreas/pranchas do projeto certo",
    publicViewRes.status === 200 &&
      publicViewBody?.data?.id === projectId &&
      Array.isArray(publicViewBody?.data?.areas) &&
      Array.isArray(publicViewBody?.data?.moodboards),
    publicViewBody
  );

  const approveViaLinkRes = await fetch(`${BASE_URL}/v1/present/${firstToken}/specifications/${spec1Id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientApproved: true, clientComment: "Adorei!", unitPrice: 999999 }),
  });
  const approveViaLinkBody = await approveViaLinkRes.json().catch(() => null);
  report(
    "PATCH .../present/:token/specifications/:id sem Authorization → 200, aprova e comenta",
    approveViaLinkRes.status === 200 &&
      approveViaLinkBody?.data?.clientApproved === true &&
      approveViaLinkBody?.data?.clientComment === "Adorei!",
    approveViaLinkBody
  );
  report(
    "Mesma chamada NÃO aceita unitPrice — campo fora do schema público é ignorado, não vira erro nem some o preço",
    Number(approveViaLinkBody?.data?.unitPrice) !== 999999,
    approveViaLinkBody?.data?.unitPrice
  );

  const regenerateLinkRes = await api(`/v1/projects/${projectId}/presentation-link`, { method: "POST" });
  const secondToken = regenerateLinkRes.body?.data?.token;
  report(
    "Gerar de novo troca o token (revogação implícita do anterior)",
    !!secondToken && secondToken !== firstToken,
    { firstToken, secondToken }
  );

  const oldTokenNowRes = await fetch(`${BASE_URL}/v1/present/${firstToken}`);
  report("Token antigo, depois de regenerar → 404", oldTokenNowRes.status === 404, await oldTokenNowRes.json().catch(() => null));

  const revokeLinkRes = await api(`/v1/projects/${projectId}/presentation-link`, { method: "DELETE" });
  report("DELETE /projects/:id/presentation-link → 204", revokeLinkRes.status === 204, revokeLinkRes.body);

  const revokedTokenRes = await fetch(`${BASE_URL}/v1/present/${secondToken}`);
  report(
    "Token revogado → 404 (não sobra acesso nenhum depois do DELETE)",
    revokedTokenRes.status === 404,
    await revokedTokenRes.json().catch(() => null)
  );

  // --- Portal do cliente: magic link + sessão --------------------------
  // Roda só depois do bloco de presentation-link acima (não antes): o
  // portal gera um link sob demanda pra quem ainda não tem um (ver
  // ClientPortalService.listProjects), e isso teria contaminado o teste
  // "antes de gerar → data null" logo acima se rodasse primeiro --
  // achado rodando o smoke suite de verdade, não hipotético.
  //
  // Client.email não é único no schema -- e "fernanda@example.com" é
  // reusado por toda execução deste script E pelo projeto real mantido
  // entre sessões pra outras verificações (Asaas), então mais de uma
  // "Fernanda Ribeiro" com o mesmo e-mail sempre vai coexistir no banco
  // de dev, cleanup ou não. Um e-mail próprio e único pra este cliente
  // (ainda em example.com, RFC 2606, nunca entrega de verdade) evita
  // ambiguidade sem precisar mexer no clientId/e-mail compartilhado
  // usado pelo resto do script.
  const portalTestEmail = `fernanda-portal-${Date.now()}@example.com`;
  await api(`/v1/clients/${clientId}`, {
    method: "PATCH",
    body: JSON.stringify({ email: portalTestEmail }),
  });

  const requestLinkRes = await api("/v1/client-portal/request-link", {
    method: "POST",
    body: JSON.stringify({ email: portalTestEmail }),
  });
  report("POST /client-portal/request-link → 200 (mensagem genérica)", requestLinkRes.status === 200, requestLinkRes.body);

  const requestLinkUnknownRes = await api("/v1/client-portal/request-link", {
    method: "POST",
    body: JSON.stringify({ email: "ninguem-cadastrado@example.com" }),
  });
  report(
    "POST /client-portal/request-link com e-mail não cadastrado → mesma resposta 200 (sem enumeração)",
    requestLinkUnknownRes.status === 200 &&
      requestLinkUnknownRes.body?.data?.message === requestLinkRes.body?.data?.message,
    requestLinkUnknownRes.body
  );

  const magicLink = await prisma.clientMagicLink.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  report("Magic link foi persistido no banco pra o cliente certo", !!magicLink, magicLink);

  const consumeRes = await api("/v1/client-portal/consume", {
    method: "POST",
    body: JSON.stringify({ token: magicLink?.token }),
  });
  report("POST /client-portal/consume → 200, devolve sessionToken", consumeRes.status === 200 && !!consumeRes.body?.data?.sessionToken, consumeRes.body);
  const clientSessionToken = consumeRes.body?.data?.sessionToken;

  const consumeAgainRes = await api("/v1/client-portal/consume", {
    method: "POST",
    body: JSON.stringify({ token: magicLink?.token }),
  });
  report(
    "Reusar o mesmo magic link → 401 (uso único)",
    consumeAgainRes.status === 401,
    consumeAgainRes.body
  );

  const portalProjectsNoAuthRes = await fetch(`${BASE_URL}/v1/client-portal/projects`);
  report(
    "GET /client-portal/projects sem X-Client-Session → 401",
    portalProjectsNoAuthRes.status === 401
  );

  const portalProjectsBadTokenRes = await fetch(`${BASE_URL}/v1/client-portal/projects`, {
    headers: { "X-Client-Session": "token-invalido-qualquer-coisa" },
  });
  report(
    "GET /client-portal/projects com token inválido → 401",
    portalProjectsBadTokenRes.status === 401
  );

  const portalProjectsRes = await fetch(`${BASE_URL}/v1/client-portal/projects`, {
    headers: { "X-Client-Session": clientSessionToken },
  });
  const portalProjectsBody = await portalProjectsRes.json().catch(() => null);
  const portalProject = portalProjectsBody?.data?.projects?.find((p: any) => p.id === projectId);
  report(
    "GET /client-portal/projects → inclui o projeto do cliente, com link de apresentação gerado sob demanda",
    portalProjectsRes.status === 200 && !!portalProject?.presentationToken,
    portalProjectsBody
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

  const gmailLinkRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "GMAIL",
      externalId: "17f2a1b9c8d6e5f4",
      url: "https://mail.google.com/mail/u/0/#all/17f2a1b9c8d6e5f4",
      title: "Re: Aprovação do conceito",
    }),
  });
  report("POST /projects/:id/office-links (GMAIL) → 201", gmailLinkRes.status === 201, gmailLinkRes.body);

  const listProjectLinksRes = await api(`/v1/projects/${projectId}/office-links`);
  report(
    "GET /projects/:id/office-links inclui os três vínculos (Drive, Calendar e Gmail)",
    listProjectLinksRes.status === 200 && listProjectLinksRes.body?.data?.length === 3,
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

  // Fator R / regime tributário — a conta é compartilhada entre todos os
  // testes (AuthService.ensureAccountAndUser reaproveita a primeira
  // Account existente, não cria uma por teste), então este bloco
  // restaura taxRegime para "MEI" no final — é o valor real do estúdio
  // hoje, não só um detalhe de limpeza de teste.
  const accountBeforeRes = await api("/v1/account");
  report(
    "GET /account → 200, taxRegime default é MEI",
    accountBeforeRes.status === 200 && accountBeforeRes.body?.data?.taxRegime === "MEI",
    accountBeforeRes.body
  );

  const fatorRWhileMeiRes = await api("/v1/fiscal/fator-r/simulate", {
    method: "POST",
    body: JSON.stringify({ folhaPagamento12m: 20000, receitaBruta12m: 80000 }),
  });
  report(
    "POST /fiscal/fator-r/simulate com regime MEI → 422 FATOR_R_NOT_APPLICABLE_MEI",
    fatorRWhileMeiRes.status === 422 && fatorRWhileMeiRes.body?.error?.code === "FATOR_R_NOT_APPLICABLE_MEI",
    fatorRWhileMeiRes.body
  );

  const switchToMeRes = await api("/v1/account", {
    method: "PATCH",
    body: JSON.stringify({ taxRegime: "ME" }),
  });
  report("PATCH /account { taxRegime: 'ME' } → 200", switchToMeRes.status === 200, switchToMeRes.body);

  const fatorRRes = await api("/v1/fiscal/fator-r/simulate", {
    method: "POST",
    body: JSON.stringify({ folhaPagamento12m: 30000, receitaBruta12m: 100000 }),
  });
  report(
    "POST /fiscal/fator-r/simulate com regime ME → 201, fatorR 0.3 recomenda Anexo III",
    fatorRRes.status === 201 &&
      Math.abs(fatorRRes.body?.data?.fatorR - 0.3) < 0.0001 &&
      fatorRRes.body?.data?.anexoRecomendado === "III",
    fatorRRes.body
  );

  const accountAfterSimulateRes = await api("/v1/account");
  report(
    "Simulação persiste fatorRPercent e taxRegimeAnexo na Account",
    Number(accountAfterSimulateRes.body?.data?.fatorRPercent) === 0.3 &&
      accountAfterSimulateRes.body?.data?.taxRegimeAnexo === "III",
    accountAfterSimulateRes.body
  );

  const fatorRZeroReceitaRes = await api("/v1/fiscal/fator-r/simulate", {
    method: "POST",
    body: JSON.stringify({ folhaPagamento12m: 1000, receitaBruta12m: 0 }),
  });
  report(
    "POST /fiscal/fator-r/simulate com receita zero → 400 VALIDATION_ERROR",
    fatorRZeroReceitaRes.status === 400 && fatorRZeroReceitaRes.body?.error?.code === "VALIDATION_ERROR",
    fatorRZeroReceitaRes.body
  );

  const restoreMeiRes = await api("/v1/account", {
    method: "PATCH",
    body: JSON.stringify({ taxRegime: "MEI" }),
  });
  report(
    "PATCH /account { taxRegime: 'MEI' } → 200 (restaura o regime real do estúdio)",
    restoreMeiRes.status === 200 && restoreMeiRes.body?.data?.taxRegime === "MEI",
    restoreMeiRes.body
  );

  // --- Despesas (lado de saída do caixa, achado da auditoria) ---------
  const expenseProjetoRes = await api("/v1/expenses", {
    method: "POST",
    body: JSON.stringify({
      description: "Marcenaria sob medida",
      category: "subcontratado",
      amount: 1200,
      projectId: projectIdFirst,
    }),
  });
  report(
    "POST /expenses (com projectId) → 201, nasce 'pendente'",
    expenseProjetoRes.status === 201 && expenseProjetoRes.body?.data?.status === "pendente",
    expenseProjetoRes.body
  );
  const expenseProjetoId = expenseProjetoRes.body?.data?.id;

  const expenseGeralRes = await api("/v1/expenses", {
    method: "POST",
    body: JSON.stringify({ description: "Assinatura do software de renderização", category: "software", amount: 300 }),
  });
  report(
    "POST /expenses sem projectId → 201, despesa geral (project null)",
    expenseGeralRes.status === 201 && expenseGeralRes.body?.data?.project === null,
    expenseGeralRes.body
  );
  const expenseGeralId = expenseGeralRes.body?.data?.id;

  const expenseBadProjectRes = await api("/v1/expenses", {
    method: "POST",
    body: JSON.stringify({ description: "x", category: "x", amount: 10, projectId: "nonexistent-id" }),
  });
  report(
    "POST /expenses com projectId de outra conta/inexistente → 404",
    expenseBadProjectRes.status === 404,
    expenseBadProjectRes.body
  );

  const markExpensePaidRes = await api(`/v1/expenses/${expenseProjetoId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paga", paidAt: new Date().toISOString() }),
  });
  report(
    "PATCH /expenses/:id { status: 'paga' } → 200",
    markExpensePaidRes.status === 200 && markExpensePaidRes.body?.data?.status === "paga",
    markExpensePaidRes.body
  );

  const listExpensesByProjectRes = await api(`/v1/expenses?projectId=${projectIdFirst}`);
  report(
    "GET /expenses?projectId= só traz a despesa deste projeto, não a geral",
    listExpensesByProjectRes.body?.data?.length === 1 &&
      listExpensesByProjectRes.body?.data?.[0]?.id === expenseProjetoId,
    listExpensesByProjectRes.body
  );

  const deleteExpenseRes = await api(`/v1/expenses/${expenseGeralId}`, { method: "DELETE" });
  report("DELETE /expenses/:id → 204", deleteExpenseRes.status === 204, deleteExpenseRes.body);
  const listAfterDeleteRes = await api("/v1/expenses");
  report(
    "Após remover, a despesa geral não aparece mais na listagem",
    !listAfterDeleteRes.body?.data?.some((e: any) => e.id === expenseGeralId),
    listAfterDeleteRes.body
  );

  const biRes = await api("/v1/bi/executivo");
  const biData = biRes.body?.data;
  report("GET /bi/executivo → 200", biRes.status === 200, biRes.body);
  report(
    "kpis traz os 4 números de topo, todos numéricos",
    typeof biData?.kpis?.pipelineEmAberto === "number" &&
      typeof biData?.kpis?.projetosAtivos === "number" &&
      typeof biData?.kpis?.aReceber === "number" &&
      typeof biData?.kpis?.recebidoEsteMes === "number",
    biData?.kpis
  );
  report(
    "kpis.pagoEsteMes reflete a despesa marcada como paga agora mesmo, margemEsteMes = recebido - pago",
    biData?.kpis?.pagoEsteMes >= 1200 &&
      Math.abs(biData?.kpis?.margemEsteMes - (biData?.kpis?.recebidoEsteMes - biData?.kpis?.pagoEsteMes)) < 0.01,
    biData?.kpis
  );
  report(
    "despesas tem os 2 status de Expense (pendente/paga)",
    biData?.despesas?.length === 2,
    biData?.despesas
  );
  report(
    "kpis.projetosAtivos conta o projeto 'ativo' criado neste run",
    (biData?.kpis?.projetosAtivos ?? 0) >= 1,
    biData?.kpis
  );
  report(
    "kpis.recebidoEsteMes reflete o pagamento via webhook feito agora mesmo",
    (biData?.kpis?.recebidoEsteMes ?? 0) > 0,
    biData?.kpis
  );
  report(
    "pipeline.porEstagio tem os 6 estágios do kanban (novo_lead..perdido)",
    biData?.pipeline?.porEstagio?.length === 6,
    biData?.pipeline?.porEstagio
  );
  const estagioGanho = biData?.pipeline?.porEstagio?.find((e: any) => e.estagio === "ganho");
  report(
    "Oportunidade marcada ganho neste run aparece em pipeline.porEstagio",
    (estagioGanho?.quantidade ?? 0) >= 1,
    estagioGanho
  );
  report(
    "faturamento tem os 3 status de Invoice (pendente/emitida/paga)",
    biData?.faturamento?.length === 3,
    biData?.faturamento
  );
  const projetoDoRun = biData?.projetos?.find((p: any) => p.projetoId === projectIdFirst);
  report(
    "Projeto criado neste run aparece em projetos com orçado/realizado numéricos",
    typeof projetoDoRun?.orcado === "number" && typeof projetoDoRun?.realizado === "number",
    projetoDoRun
  );
  report(
    "projetoDoRun.despesas reflete a despesa paga deste projeto; margem = recebido - realizado - despesas",
    projetoDoRun?.despesas >= 1200 &&
      Math.abs(projetoDoRun?.margem - (projetoDoRun?.recebido - projetoDoRun?.realizado - projetoDoRun?.despesas)) < 0.01,
    projetoDoRun
  );
  report(
    "tendencia tem os últimos 6 meses, mês corrente por último",
    biData?.tendencia?.length === 6 &&
      biData.tendencia[5].mes === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    biData?.tendencia
  );
  const mesCorrente = biData?.tendencia?.[5];
  report(
    "tendencia do mês corrente reflete o pagamento via webhook e a oportunidade ganha deste run",
    (mesCorrente?.recebido ?? 0) > 0 && (mesCorrente?.oportunidadesGanhas ?? 0) >= 1,
    mesCorrente
  );
  report(
    "tendencia do mês corrente reflete a despesa paga deste run; margem = recebido - despesas",
    (mesCorrente?.despesas ?? 0) >= 1200 &&
      Math.abs(mesCorrente?.margem - (mesCorrente?.recebido - mesCorrente?.despesas)) < 0.01,
    mesCorrente
  );

  const capacidadeRes = await api("/v1/bi/capacidade");
  const capacidadeData = capacidadeRes.body?.data;
  report("GET /bi/capacidade → 200", capacidadeRes.status === 200, capacidadeRes.body);
  const pessoaDoRun = capacidadeData?.porPessoa?.find((p: any) => p.userId === user2.id);
  report(
    "porPessoa inclui o colaborador criado neste run, com capacidade default 40h",
    pessoaDoRun?.capacidadeSemanal === 40,
    pessoaDoRun
  );

  const ffeRes = await api("/v1/bi/ffe");
  const ffeData = ffeRes.body?.data;
  report("GET /bi/ffe → 200", ffeRes.status === 200, ffeRes.body);
  const ffeProjetoDoRun = ffeData?.porProjeto?.find((p: any) => p.projetoId === projectIdFirst);
  report(
    "porProjeto reflete o checkout do carrinho deste run (valorAprovado = 9020)",
    Math.abs((ffeProjetoDoRun?.valorAprovado ?? 0) - 9020) < 0.01,
    ffeProjetoDoRun
  );
  report(
    "especificacoesSemPreco conta a especificação genérica sem unitPrice deste run",
    (ffeData?.especificacoesSemPreco ?? 0) >= 1,
    ffeData?.especificacoesSemPreco
  );
  // Não afirma que o produto deste run está no top 5 -- depois de muitos
  // runs acumulados na mesma conta de dev, vários produtos empatam em
  // quantidadeTotal=1, e qual deles entra no corte de 5 é arbitrário
  // (não reflete um bug, só empate). Testa a forma da resposta em vez
  // disso: ordenado decrescente, no máximo 5 itens.
  const listaProdutos = ffeData?.produtosMaisEspecificados ?? [];
  const ordenadaDecrescente = listaProdutos.every(
    (p: any, i: number) => i === 0 || listaProdutos[i - 1].quantidadeTotal >= p.quantidadeTotal
  );
  report(
    "produtosMaisEspecificados: no máximo 5 itens, ordenados por quantidade decrescente",
    listaProdutos.length <= 5 && ordenadaDecrescente,
    listaProdutos
  );

  // --- Permissões: Admin vs Staff -------------------------------------
  // Deixado pro final de propósito: se um bug deixasse um DELETE staff
  // passar de verdade, isso derrubaria clientId/projectId que todo o
  // resto do script acima já usou e já verificou -- rodando por último,
  // uma falha aqui nunca invalida retroativamente o que já passou.
  const staffEmail = `smoke-test-staff-${Date.now()}@studioaraci.com.br`;
  const staffToken = await mintToken(staffEmail);
  async function apiAsStaff(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffToken}`, ...(init.headers ?? {}) },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // 204 No Content etc.
    }
    return { status: res.status, body: body as any };
  }

  const meAsAdminRes = await api("/v1/me");
  report(
    "GET /me como admin (promovido no início deste run) → accessLevel admin",
    meAsAdminRes.body?.data?.accessLevel === "admin",
    meAsAdminRes.body
  );

  const meAsStaffRes = await apiAsStaff("/v1/me");
  const staffUserId = meAsStaffRes.body?.data?.userId;
  report(
    "GET /me como staff (usuário novo) → accessLevel staff por padrão",
    meAsStaffRes.body?.data?.accessLevel === "staff",
    meAsStaffRes.body
  );

  const staffRoleRatesRes = await apiAsStaff("/v1/role-rates");
  report(
    "GET /role-rates como staff → 403 FORBIDDEN",
    staffRoleRatesRes.status === 403 && staffRoleRatesRes.body?.error?.code === "FORBIDDEN",
    staffRoleRatesRes.body
  );

  const staffInvoicesRes = await apiAsStaff("/v1/invoices");
  report("GET /invoices como staff → 403 FORBIDDEN", staffInvoicesRes.status === 403, staffInvoicesRes.body);

  const staffAccountRes = await apiAsStaff("/v1/account");
  report("GET /account como staff → 403 FORBIDDEN", staffAccountRes.status === 403, staffAccountRes.body);

  const staffExpensesRes = await apiAsStaff("/v1/expenses");
  report("GET /expenses como staff → 403 FORBIDDEN", staffExpensesRes.status === 403, staffExpensesRes.body);

  const staffFiscalRes = await apiAsStaff("/v1/fiscal/fator-r/simulate", {
    method: "POST",
    body: JSON.stringify({ folhaPagamento12m: 1000, receitaBruta12m: 5000 }),
  });
  report(
    "POST /fiscal/fator-r/simulate como staff → 403 FORBIDDEN",
    staffFiscalRes.status === 403,
    staffFiscalRes.body
  );

  const staffDeleteClientRes = await apiAsStaff(`/v1/clients/${clientId}`, { method: "DELETE" });
  report(
    "DELETE /clients/:id como staff → 403 FORBIDDEN (não deleta)",
    staffDeleteClientRes.status === 403,
    staffDeleteClientRes.body
  );

  const staffDeleteProjectRes = await apiAsStaff(`/v1/projects/${projectId}`, { method: "DELETE" });
  report(
    "DELETE /projects/:id como staff → 403 FORBIDDEN (não deleta)",
    staffDeleteProjectRes.status === 403,
    staffDeleteProjectRes.body
  );

  const clientAindaExisteRes = await api(`/v1/clients/${clientId}`);
  report(
    "Cliente principal ainda existe depois da tentativa de delete como staff",
    clientAindaExisteRes.status === 200,
    clientAindaExisteRes.body
  );

  const staffUsersRes = await apiAsStaff("/v1/users");
  report(
    "GET /users como staff → costPerHour ausente em todo mundo",
    staffUsersRes.status === 200 && staffUsersRes.body?.data?.every((u: any) => !("costPerHour" in u)),
    staffUsersRes.body
  );

  const adminUsersRes = await api("/v1/users");
  report(
    "GET /users como admin → costPerHour presente",
    adminUsersRes.status === 200 && adminUsersRes.body?.data?.some((u: any) => "costPerHour" in u),
    adminUsersRes.body
  );

  const staffSelfPromoteRes = await apiAsStaff(`/v1/users/${staffUserId}`, {
    method: "PATCH",
    body: JSON.stringify({ accessLevel: "admin", costPerHour: 999 }),
  });
  report(
    "PATCH /users/:id (staff tentando se promover às cegas) → 200, sem erro",
    staffSelfPromoteRes.status === 200,
    staffSelfPromoteRes.body
  );

  const staffAfterSelfPromoteRes = await apiAsStaff("/v1/me");
  report(
    "...mas continua staff — accessLevel/costPerHour são removidos do PATCH antes de chegar no service",
    staffAfterSelfPromoteRes.body?.data?.accessLevel === "staff",
    staffAfterSelfPromoteRes.body
  );

  const adminPromoteRes = await api(`/v1/users/${staffUserId}`, {
    method: "PATCH",
    body: JSON.stringify({ accessLevel: "admin" }),
  });
  report(
    "Admin de verdade promove o mesmo usuário via PATCH /users/:id → 200",
    adminPromoteRes.status === 200 && adminPromoteRes.body?.data?.accessLevel === "admin",
    adminPromoteRes.body
  );

  // --- Notificações in-app (sino da Nav) --------------------------------
  // Cria a Notification direto via prisma em vez de aprovar uma
  // especificação de verdade: o gatilho real (updateSpecification na
  // transição false→true) manda e-mail pro mesmo lote de admins através
  // do MESMO sendEmail() já testado manualmente com a Giulia -- exercitar
  // esse caminho aqui de novo re-abriria o problema já decidido acima
  // (spam de e-mail real a cada run). O que este bloco testa é o
  // CRUD/escopo do sino em si (listar, marcar lida, marcar todas),
  // ortogonal a como a notificação nasce.
  const adminAccountId = meAsAdminRes.body?.data?.accountId;
  const adminUserId = meAsAdminRes.body?.data?.userId;
  const testNotification = await prisma.notification.create({
    data: {
      accountId: adminAccountId,
      userId: adminUserId,
      type: "specification_approved",
      title: "Projeto de teste: item aprovado pelo cliente",
      body: "Comentário de teste do smoke suite.",
      projectId,
    },
  });

  const notificationsListRes = await api("/v1/notifications");
  const notificationsList = notificationsListRes.body?.data?.notifications ?? [];
  report(
    "GET /notifications → inclui a notificação criada, com unreadCount >= 1",
    notificationsListRes.status === 200 &&
      notificationsList.some((n: any) => n.id === testNotification.id) &&
      notificationsListRes.body?.data?.unreadCount >= 1,
    notificationsListRes.body
  );

  const staffNotificationsRes = await apiAsStaff("/v1/notifications");
  report(
    "GET /notifications como staff → não inclui notificação de outro usuário",
    staffNotificationsRes.status === 200 &&
      !staffNotificationsRes.body?.data?.notifications?.some((n: any) => n.id === testNotification.id),
    staffNotificationsRes.body
  );

  const markReadRes = await api(`/v1/notifications/${testNotification.id}/read`, { method: "PATCH" });
  report("PATCH /notifications/:id/read → 204", markReadRes.status === 204);

  const afterMarkReadRes = await api("/v1/notifications");
  const notifAfterMarkRead = afterMarkReadRes.body?.data?.notifications?.find((n: any) => n.id === testNotification.id);
  report(
    "Após marcar como lida, readAt vem preenchido na listagem",
    !!notifAfterMarkRead?.readAt,
    notifAfterMarkRead
  );

  const secondNotification = await prisma.notification.create({
    data: {
      accountId: adminAccountId,
      userId: adminUserId,
      type: "specification_approved",
      title: "Segunda notificação de teste",
      projectId,
    },
  });
  const markAllReadRes = await api("/v1/notifications/read-all", { method: "POST" });
  report("POST /notifications/read-all → 204", markAllReadRes.status === 204);

  const afterMarkAllReadRes = await api("/v1/notifications");
  report(
    "Após marcar todas como lidas, unreadCount zera e a segunda notificação também vem lida",
    afterMarkAllReadRes.body?.data?.unreadCount === 0 &&
      !!afterMarkAllReadRes.body?.data?.notifications?.find((n: any) => n.id === secondNotification.id)?.readAt,
    afterMarkAllReadRes.body
  );

  // --- Log de auditoria (quem mudou o quê) ------------------------------
  // Não insere nada direto via prisma como os blocos acima -- ao contrário
  // de Notification, aqui o objetivo é validar que a extensão do Prisma
  // (audit/prisma-audit-extension.ts) gravou sozinha, a partir de ações
  // reais já feitas por este script inteiro (o POST /clients lá no topo,
  // a promoção de staff pra admin, etc.), sem nenhum service ter chamado
  // nada explicitamente.
  const auditLogRes = await api("/v1/audit-log");
  report("GET /audit-log → 200", auditLogRes.status === 200, auditLogRes.body);

  // Filtra por entityId em vez de vasculhar a página default (50 mais
  // recentes): o create do Client principal aconteceu lá no topo do
  // script, então dezenas de ações depois (todo o resto do smoke suite) o
  // empurram pra fora da primeira página se a checagem for pela lista
  // sem filtro -- achado rodando de verdade, não hipotético.
  const clientAuditRes = await api(`/v1/audit-log?entityType=Client&entityId=${clientId}`);
  const clientAuditEntries = clientAuditRes.body?.data?.entries ?? [];
  report(
    "GET /audit-log?entityId=... inclui o create do Client principal deste run",
    clientAuditEntries.some((e: any) => e.action === "create"),
    clientAuditEntries.length
  );

  const userAuditRes = await api(`/v1/audit-log?entityType=User&entityId=${staffUserId}`);
  const userAuditEntries = userAuditRes.body?.data?.entries ?? [];
  const promoteEntry = userAuditEntries.find((e: any) => e.action === "update");
  report(
    "Entrada da promoção de staff→admin tem o ator certo e o diff certo",
    promoteEntry?.actorEmail === EMAIL &&
      promoteEntry?.actorType === "user" &&
      promoteEntry?.changes?.accessLevel?.to === "admin" &&
      promoteEntry?.changes?.accessLevel?.from === "staff",
    promoteEntry
  );

  const auditFilteredRes = await api("/v1/audit-log?entityType=Client&action=create");
  const auditFiltered = auditFilteredRes.body?.data?.entries ?? [];
  report(
    "GET /audit-log?entityType=Client&action=create → só traz create de Client",
    auditFilteredRes.status === 200 &&
      auditFiltered.length > 0 &&
      auditFiltered.every((e: any) => e.entityType === "Client" && e.action === "create"),
    auditFiltered.length
  );

  // Não usa apiAsStaff/staffToken aqui -- essa identidade já foi promovida
  // a admin pelo teste "Admin de verdade promove..." mais acima, e
  // AuthGuard sempre relê o accessLevel atual do banco, não o que o token
  // tinha quando foi emitido. Precisa de um staff que nunca foi tocado
  // (achado rodando o suite de verdade: a primeira versão deste teste
  // reusava staffToken e passava com 200 em vez de 403).
  const secondStaffEmail = `smoke-test-staff2-${Date.now()}@studioaraci.com.br`;
  const secondStaffToken = await mintToken(secondStaffEmail);
  const auditAsStaffRes = await fetch(`${BASE_URL}/v1/audit-log`, {
    headers: { Authorization: `Bearer ${secondStaffToken}` },
  });
  const auditAsStaffBody = await auditAsStaffRes.json().catch(() => null);
  report("GET /audit-log como staff → 403 FORBIDDEN", auditAsStaffRes.status === 403, auditAsStaffBody);

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
