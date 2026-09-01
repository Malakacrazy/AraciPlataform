import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Versionamento e assinatura de proposta". O nome do cabeçalho original
// ficou pequeno pro que realmente vive aqui: versionamento/ZapSign da
// proposta, o ciclo de vida da Opportunity (ganho/perdido/reabertura),
// captação pública de leads, fases/gates do projeto, apontamento e
// faturamento de horas, guardas de NFS-e e o webhook da Asaas -- tudo
// numa sequência contínua e fortemente dependente de estado (não dá pra
// separar sem quebrar a ordem). Devolve exatamente os fixtures que as
// seções já extraídas mais adiante no arquivo original precisam
// (projectId/firstPhase/secondPhase/thirdPhase/smokeUser/user2);
// projectIdFirst e projectIdSecond do trecho original eram sempre o
// mesmo valor (calculado duas vezes só por causa de como o script foi
// crescendo) -- simplificado aqui pra um projectId só.
export async function runProposalVersioningAndLifecycleChecks({
  api,
  report,
  baseUrl,
  mintToken,
  email,
  clientId,
  opportunityId,
  proposalId,
  valorM2OppId,
  fernandaEmail,
}: {
  api: ApiFn;
  report: ReportFn;
  baseUrl: string;
  mintToken: (email: string) => Promise<string>;
  email: string;
  clientId: string;
  opportunityId: string;
  proposalId: string;
  valorM2OppId: string;
  fernandaEmail: string;
}) {
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
    proposalV2Res.status === 201 && proposalV2?.version === 2 && proposalV2?.previousVersionId === proposalId,
    proposalV2Res.body
  );

  const proposalV1AfterRes = await api(`/v1/proposals/${proposalId}`);
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

  const webhookNoTokenRes = await fetch(`${baseUrl}/v1/zapsign/webhook`, {
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
  const webhookRes = await fetch(`${baseUrl}/v1/zapsign/webhook`, {
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

  const webhookAgainRes = await fetch(`${baseUrl}/v1/zapsign/webhook`, {
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

  const patchWithLostAtRes = await api(`/v1/opportunities/${opportunityId}`, {
    method: "PATCH",
    body: JSON.stringify({ lostAt: new Date().toISOString() }),
  });
  report(
    "PATCH genérico não aceita mais lostAt (campo desconhecido, ignorado) — não vira perdida por aí",
    patchWithLostAtRes.status === 200 && patchWithLostAtRes.body?.data?.lostAt === null,
    patchWithLostAtRes.body
  );

  const marcarPerdidaJaGanhaRes = await api(`/v1/opportunities/${opportunityId}/mark-lost`, {
    method: "POST",
    body: JSON.stringify({ lostReason: "preco" }),
  });
  report(
    "POST .../mark-lost numa oportunidade já ganha → 422 OPPORTUNITY_ALREADY_WON",
    marcarPerdidaJaGanhaRes.status === 422 && marcarPerdidaJaGanhaRes.body?.error?.code === "OPPORTUNITY_ALREADY_WON",
    marcarPerdidaJaGanhaRes.body
  );

  const segundaOppRes = await api("/v1/opportunities", {
    method: "POST",
    body: JSON.stringify({ clientId, title: "Reforma Cobertura (vai perder)", stage: "qualificacao", feeModel: "hora_tecnica" }),
  });
  const segundaOppId = segundaOppRes.body?.data?.id;

  const semMotivoRes = await api(`/v1/opportunities/${segundaOppId}/mark-lost`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "POST .../mark-lost sem lostReason → 400 VALIDATION_ERROR",
    semMotivoRes.status === 400 && semMotivoRes.body?.error?.code === "VALIDATION_ERROR",
    semMotivoRes.body
  );

  const marcarPerdidaRes = await api(`/v1/opportunities/${segundaOppId}/mark-lost`, {
    method: "POST",
    body: JSON.stringify({ lostReason: "sem_retorno" }),
  });
  report(
    "POST .../mark-lost com motivo → 200, lostAt e lostReason setados",
    marcarPerdidaRes.status === 200 &&
      !!marcarPerdidaRes.body?.data?.lostAt &&
      marcarPerdidaRes.body?.data?.lostReason === "sem_retorno",
    marcarPerdidaRes.body
  );

  // Achado da auditoria: ganho/perdido era irreversível por qualquer API.
  const reopenJaGanhaRes = await api(`/v1/opportunities/${opportunityId}/reopen`, { method: "POST" });
  report(
    "POST .../reopen numa oportunidade ganha → 422 OPPORTUNITY_ALREADY_WON",
    reopenJaGanhaRes.status === 422 && reopenJaGanhaRes.body?.error?.code === "OPPORTUNITY_ALREADY_WON",
    reopenJaGanhaRes.body
  );

  const reopenNaoPerdidaRes = await api(`/v1/opportunities/${valorM2OppId}/reopen`, { method: "POST" });
  report(
    "POST .../reopen numa oportunidade que nunca foi perdida → 422 OPPORTUNITY_NOT_LOST",
    reopenNaoPerdidaRes.status === 422 && reopenNaoPerdidaRes.body?.error?.code === "OPPORTUNITY_NOT_LOST",
    reopenNaoPerdidaRes.body
  );

  const reopenRes = await api(`/v1/opportunities/${segundaOppId}/reopen`, { method: "POST" });
  report(
    "POST .../reopen → 200, lostAt e lostReason voltam pra null",
    reopenRes.status === 200 && reopenRes.body?.data?.lostAt === null && reopenRes.body?.data?.lostReason === null,
    reopenRes.body
  );

  const leadSemEmailRes = await fetch(`${baseUrl}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Visitante do site" }),
  });
  report(
    "POST /v1/leads sem e-mail (rota pública, sem token) → 400 VALIDATION_ERROR",
    leadSemEmailRes.status === 400,
    await leadSemEmailRes.json().catch(() => null)
  );

  const leadRes = await fetch(`${baseUrl}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Visitante do Site",
      email: "visitante-lead@example.com",
      phone: "11999990000",
      message: "Gostaria de um orçamento para reforma de apartamento de 80m².",
      consent: true,
    }),
  });
  report("POST /v1/leads (formulário público) → 201, sem exigir token", leadRes.status === 201, await leadRes.json().catch(() => null));

  const clientesAposLeadRes = await api("/v1/clients");
  const clienteDoLead = clientesAposLeadRes.body?.data?.find((c: any) => c.email === "visitante-lead@example.com");
  report(
    "Lead público cria um Client novo com source 'site'",
    clienteDoLead?.source === "site",
    clienteDoLead
  );

  const oppsAposLeadRes = await api("/v1/opportunities");
  const oppDoLead = oppsAposLeadRes.body?.data?.find((o: any) => o.clientId === clienteDoLead?.id);
  report(
    "Lead público cria uma Opportunity em 'novo_lead', feeModel hora_tecnica, com a mensagem gravada",
    oppDoLead?.stage === "novo_lead" &&
      oppDoLead?.feeModel === "hora_tecnica" &&
      oppDoLead?.leadMessage?.includes("80m²"),
    oppDoLead
  );

  // Achado A-05: Client.email é @unique agora, então o mesmo visitante
  // preenchendo o formulário uma segunda vez não pode mais virar um
  // segundo Client com o e-mail repetido -- LeadsService passou a
  // reaproveitar o Client existente e só criar uma Opportunity nova (um
  // segundo contato do mesmo lead, não um cliente duplicado).
  const leadOutraVezRes = await fetch(`${baseUrl}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Visitante do Site",
      email: "VISITANTE-lead@example.com", // mesma pessoa, e-mail em outra caixa -- prova a normalização também
      message: "Segunda mensagem, mesmo contato.",
      consent: true,
    }),
  });
  report(
    "POST /v1/leads de novo com o mesmo e-mail (outra caixa) → 201, não 409",
    leadOutraVezRes.status === 201,
    await leadOutraVezRes.json().catch(() => null)
  );

  const clientesAposSegundoLeadRes = await api("/v1/clients");
  const clientesDoLead = clientesAposSegundoLeadRes.body?.data?.filter(
    (c: any) => c.email === "visitante-lead@example.com"
  );
  report(
    "Segundo envio do formulário reaproveita o mesmo Client — não duplica (achado A-05)",
    clientesDoLead?.length === 1 && clientesDoLead[0]?.id === clienteDoLead?.id,
    clientesDoLead
  );

  const oppsAposSegundoLeadRes = await api("/v1/opportunities");
  const oppsDoMesmoCliente = oppsAposSegundoLeadRes.body?.data?.filter(
    (o: any) => o.clientId === clienteDoLead?.id
  );
  report(
    "...mas cria uma segunda Opportunity para o mesmo Client, não descarta o contato novo",
    oppsDoMesmoCliente?.length === 2,
    oppsDoMesmoCliente
  );
  report(
    "...mas NÃO sobrescreve consentedAt de um Client já existente (achado A69: sem prova de posse do e-mail)",
    clientesDoLead?.[0]?.consentedAt === clienteDoLead?.consentedAt,
    { antes: clienteDoLead?.consentedAt, depois: clientesDoLead?.[0]?.consentedAt }
  );

  const leadNomeGigantescoRes = await fetch(`${baseUrl}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x".repeat(121), email: "lead-nome-gigante@example.com", consent: true }),
  });
  report(
    "POST /v1/leads com name > 120 chars → 400 VALIDATION_ERROR (achado A56)",
    leadNomeGigantescoRes.status === 400,
    await leadNomeGigantescoRes.json().catch(() => null)
  );

  const duplicateEmailRes = await api("/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: "Outra Pessoa", email: fernandaEmail }),
  });
  report(
    "POST /clients com e-mail já em uso → 409 CONFLICT, não 500 (achado A-05)",
    duplicateEmailRes.status === 409 && duplicateEmailRes.body?.error?.code === "CONFLICT",
    duplicateEmailRes.body
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
    listActivitiesRes.status === 200 && activityCreated?.author?.email === email,
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

  // O usuário deste smoke test nasce com role 'admin' (ver auth.service.ts).
  // RoleRate é dado de referência da conta inteira e sobrevive de propósito
  // entre execuções do smoke suite (mesma convenção já valendo pra
  // "Arquiteto Líder (RT)" acima) -- então uma execução anterior pode já
  // ter deixado uma tarifa cadastrada pro papel 'admin'. Reseta na unha
  // ANTES de aprovar a hora abaixo (achado A7 da auditoria de 30 ago 2026:
  // approveTimeEntry agora congela a tarifa vigente em
  // TimeEntry.approvedHourlyRate no momento da aprovação -- resetar DEPOIS
  // de aprovar não provaria mais ROLE_RATE_MISSING nenhum, porque a tarifa
  // já teria sido congelada antes do reset e o fallback nem seria
  // consultado). A tarifa de verdade é recriada mais abaixo mesmo, então
  // isso não é "limpeza de resíduo", é garantir a pré-condição do teste
  // independente do histórico do banco.
  const smokeUser = await prisma.user.findUnique({ where: { email } });
  await prisma.roleRate.deleteMany({ where: { accountId: smokeUser!.accountId, role: "admin" } });

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

  // Aprovada SEM nenhuma RoleRate pro papel 'admin' cadastrada (reset
  // acima) -- approveTimeEntry não bloqueia por isso (achado A7):
  // approvedHourlyRate fica null, e o 422 ROLE_RATE_MISSING só aparece
  // de verdade na hora de faturar, testado logo abaixo.
  const aprovarHorasFaturaveisRes = await api(`/v1/time-entries/${horasFaturaveisId}/approve`, { method: "POST" });
  report(
    "POST /time-entries/:id/approve (horas a faturar, sem RoleRate ainda) → 200, approvedHourlyRate fica null",
    aprovarHorasFaturaveisRes.status === 200 &&
      !!aprovarHorasFaturaveisRes.body?.data?.approvedAt &&
      aprovarHorasFaturaveisRes.body?.data?.approvedHourlyRate === null,
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

  // Achado A2 da auditoria de 30 ago 2026: "uma fatura por fase" deixou de
  // ser a regra pra hora_tecnica -- as 5h já faturadas acima estão
  // consumidas (TimeEntry.invoiceId setado), então faturar de novo AGORA
  // (sem nenhuma hora nova aprovada) bate em NO_APPROVED_HOURS, não mais
  // PHASE_ALREADY_INVOICED (esse código continua existindo, só que agora é
  // exclusivo do fee model fixo -- ver bloco de invoice de FF&E/orçamento
  // fechado, que não passa por aqui).
  const invoiceSemHorasNovasRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "Faturar de novo sem hora nova aprovada → 422 NO_APPROVED_HOURS (não mais PHASE_ALREADY_INVOICED, achado A2)",
    invoiceSemHorasNovasRes.status === 422 && invoiceSemHorasNovasRes.body?.error?.code === "NO_APPROVED_HOURS",
    invoiceSemHorasNovasRes.body
  );

  // Prova de verdade da fatura COMPLEMENTAR (o motivo de A1/A2 existirem):
  // horas aprovadas DEPOIS do primeiro faturamento do mesmo estágio agora
  // geram uma SEGUNDA fatura, cobrindo só as horas novas -- antes desta
  // correção, essas horas ficavam permanentemente não faturáveis.
  const horasComplementaresRes = await api("/v1/time-entries", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      phaseId: firstPhase.id,
      date: new Date().toISOString(),
      hours: 3,
      activityType: "projeto",
    }),
  });
  const horasComplementaresId = horasComplementaresRes.body?.data?.id;
  await api(`/v1/time-entries/${horasComplementaresId}/approve`, { method: "POST" });

  const invoiceComplementarRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  report(
    "Aprovar hora NOVA no mesmo estágio já faturado e faturar de novo → 201, fatura COMPLEMENTAR só com a hora nova (achado A2)",
    invoiceComplementarRes.status === 201 &&
      invoiceComplementarRes.body?.data?.id !== invoiceId &&
      Number(invoiceComplementarRes.body?.data?.amount) === 240 &&
      invoiceComplementarRes.body?.data?.lines?.length === 1 &&
      Number(invoiceComplementarRes.body.data.lines[0].hours) === 3,
    invoiceComplementarRes.body
  );
  const invoiceOriginalAposComplementoRes = await api(`/v1/invoices/${invoiceId}`);
  report(
    "A fatura ORIGINAL não muda quando a complementar é criada -- ainda 5h/R$400",
    invoiceOriginalAposComplementoRes.status === 200 &&
      Number(invoiceOriginalAposComplementoRes.body?.data?.amount) === 400 &&
      invoiceOriginalAposComplementoRes.body?.data?.lines?.length === 1 &&
      Number(invoiceOriginalAposComplementoRes.body.data.lines[0].hours) === 5,
    invoiceOriginalAposComplementoRes.body
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

  // Lacuna da matriz (NFS-e dentro do fluxo real) -- guardas testadas
  // aqui não chamam a SEFIN de verdade (a real Homologação é coberta por
  // scripts/verify-nfse-invoice.ts, mesmo precedente de sendForSignature
  // não ser exercitado aqui): as duas checagens abaixo curto-circuitam
  // ANTES de chegar no certificado/webservice.
  const nfseSemDocumentoRes = await api(`/v1/invoices/${invoiceId}/nfse`, { method: "POST" });
  report(
    "POST /invoices/:id/nfse com cliente sem CPF/CNPJ → 422 CLIENT_MISSING_DOCUMENT (clientId ainda sem document neste ponto do run)",
    nfseSemDocumentoRes.status === 422 && nfseSemDocumentoRes.body?.error?.code === "CLIENT_MISSING_DOCUMENT",
    nfseSemDocumentoRes.body
  );

  // Lacuna da matriz (NFS-e: cancelamento/substituição) -- mesmo
  // precedente do bloco acima: guardas testadas aqui curto-circuitam
  // ANTES do certificado/webservice, sem nfseChaveAcesso nenhuma ainda.
  const cancelarSemEmissaoRes = await api(`/v1/invoices/${invoiceId}/nfse/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo: 1, justificativa: "Teste" }),
  });
  report(
    "POST /invoices/:id/nfse/cancelar sem NFS-e emitida → 422 NFSE_NOT_ISSUED",
    cancelarSemEmissaoRes.status === 422 && cancelarSemEmissaoRes.body?.error?.code === "NFSE_NOT_ISSUED",
    cancelarSemEmissaoRes.body
  );

  const substituirSemEmissaoRes = await api(`/v1/invoices/${invoiceId}/nfse/substituir`, {
    method: "POST",
    body: JSON.stringify({ justificativa: "Teste" }),
  });
  report(
    "POST /invoices/:id/nfse/substituir sem NFS-e emitida → 422 NFSE_NOT_ISSUED",
    substituirSemEmissaoRes.status === 422 && substituirSemEmissaoRes.body?.error?.code === "NFSE_NOT_ISSUED",
    substituirSemEmissaoRes.body
  );

  // Achado A28 da auditoria de 30 ago 2026: o guard NFSE_ALREADY_ISSUED
  // só bloqueia emissão REAL (nfseAmbienteEmissao === 'producao') --
  // homologação é só um teste, e emitir de novo é legítimo (permite
  // repetir/trocar pra produção depois). Sem nfseAmbienteEmissao: 'producao'
  // aqui, esta fixture não simula mais "já emitida de verdade" nenhuma,
  // e a chamada passaria batido pelo guard até esbarrar (ou não) num guard
  // mais adiante -- por isso o fixture precisa dos dois campos agora.
  const fakeChaveAcesso = `fake-chave-smoke-test-${Date.now()}`;
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { nfseChaveAcesso: fakeChaveAcesso, nfseAmbienteEmissao: "producao" },
  });
  const nfseJaEmitidaRes = await api(`/v1/invoices/${invoiceId}/nfse`, { method: "POST" });
  report(
    "POST /invoices/:id/nfse numa fatura que já tem nfseChaveAcesso (produção) → 422 NFSE_ALREADY_ISSUED, sem chamar a SEFIN",
    nfseJaEmitidaRes.status === 422 && nfseJaEmitidaRes.body?.error?.code === "NFSE_ALREADY_ISSUED",
    nfseJaEmitidaRes.body
  );
  // ...e em homologação (achado A28: tratada como teste, não bloqueia) --
  // a próxima checagem alcançada é a de sempre (documento do cliente).
  await prisma.invoice.update({ where: { id: invoiceId }, data: { nfseAmbienteEmissao: "homologacao" } });
  const nfseJaEmitidaHomologacaoRes = await api(`/v1/invoices/${invoiceId}/nfse`, { method: "POST" });
  report(
    "POST /invoices/:id/nfse numa fatura com chave de HOMOLOGAÇÃO → não bloqueia por NFSE_ALREADY_ISSUED (achado A28)",
    nfseJaEmitidaHomologacaoRes.body?.error?.code !== "NFSE_ALREADY_ISSUED",
    nfseJaEmitidaHomologacaoRes.body
  );
  // Só reseta o ambiente aqui -- nfseChaveAcesso continua = fakeChaveAcesso
  // porque os testes de cancelamento logo abaixo dependem dela pra
  // alcançar o guard de NFSE_ALREADY_CANCELED (em vez de NFSE_NOT_ISSUED).
  await prisma.invoice.update({ where: { id: invoiceId }, data: { nfseAmbienteEmissao: "producao" } });

  const cancelarMotivoInvalidoRes = await api(`/v1/invoices/${invoiceId}/nfse/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo: 5, justificativa: "Motivo fora da lista fechada da SEFIN" }),
  });
  report(
    "POST /invoices/:id/nfse/cancelar com motivo fora de {1,2,9} → 400 VALIDATION_ERROR",
    cancelarMotivoInvalidoRes.status === 400,
    cancelarMotivoInvalidoRes.body
  );

  // nfseCanceladaEm simulado direto no banco -- mesmo padrão de
  // asaasPaymentId/nfseChaveAcesso acima, já que cancelar/substituir de
  // verdade exige o certificado real (não configurado neste ambiente).
  await prisma.invoice.update({ where: { id: invoiceId }, data: { nfseCanceladaEm: new Date() } });

  const cancelarJaCanceladaRes = await api(`/v1/invoices/${invoiceId}/nfse/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo: 1, justificativa: "Teste" }),
  });
  report(
    "POST /invoices/:id/nfse/cancelar numa NFS-e já cancelada → 422 NFSE_ALREADY_CANCELED",
    cancelarJaCanceladaRes.status === 422 && cancelarJaCanceladaRes.body?.error?.code === "NFSE_ALREADY_CANCELED",
    cancelarJaCanceladaRes.body
  );

  const substituirJaCanceladaRes = await api(`/v1/invoices/${invoiceId}/nfse/substituir`, {
    method: "POST",
    body: JSON.stringify({ justificativa: "Teste" }),
  });
  report(
    "POST /invoices/:id/nfse/substituir numa NFS-e já cancelada → 422 NFSE_ALREADY_CANCELED",
    substituirJaCanceladaRes.status === 422 && substituirJaCanceladaRes.body?.error?.code === "NFSE_ALREADY_CANCELED",
    substituirJaCanceladaRes.body
  );

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { nfseChaveAcesso: null, nfseCanceladaEm: null },
  });

  const webhookTokenErrado = await fetch(`${baseUrl}/v1/billing/asaas/webhook`, {
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
  const webhookTokenCorretoRes = await fetch(`${baseUrl}/v1/billing/asaas/webhook`, {
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

  const webhookReenviadoRes = await fetch(`${baseUrl}/v1/billing/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": process.env.ASAAS_WEBHOOK_AUTH_TOKEN ?? "" },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: fakeAsaasPaymentId } }),
  });
  report(
    "Reenviar o mesmo evento de pagamento → 200, idempotente (sem erro)",
    webhookReenviadoRes.status === 200,
    await webhookReenviadoRes.json().catch(() => null)
  );

  // Achado da auditoria: "Emission is a manual trigger, not tied to
  // invoice payment". A fatura acima (invoiceId) já tinha nfseNumber
  // gravado antes do webhook confirmar o pagamento -- não há nada
  // pendente pra avisar. Pra testar o caminho onde HÁ algo pendente,
  // cria uma fatura nova, direto via Prisma (setup, não é o que está
  // sendo testado), sem nfseNumber.
  const invoiceSemNfseParaWebhook = await prisma.invoice.create({
    data: {
      projectId,
      amount: 500,
      status: "pendente",
      asaasPaymentId: `pay_smoketest_nfse_${Date.now()}`,
    },
  });
  const webhookNfseReadyRes = await fetch(`${baseUrl}/v1/billing/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": process.env.ASAAS_WEBHOOK_AUTH_TOKEN ?? "" },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: invoiceSemNfseParaWebhook.asaasPaymentId } }),
  });
  report(
    "POST /billing/asaas/webhook numa fatura sem NFS-e → 200",
    webhookNfseReadyRes.status === 200,
    await webhookNfseReadyRes.json().catch(() => null)
  );

  const nfseReadyNotificationsRes = await api("/v1/notifications");
  report(
    "Pagamento confirmado sem NFS-e gera Notification tipo 'nfse_ready' (sino + e-mail)",
    nfseReadyNotificationsRes.body?.data?.notifications?.some(
      (n: any) => n.type === "nfse_ready" && n.projectId === projectId
    ),
    nfseReadyNotificationsRes.body?.data?.notifications?.map((n: any) => n.type)
  );

  // Registrar a NFS-e numa fatura já 'paga' (PATCH só com nfseNumber, sem
  // status) não pode regredir pra 'emitida' -- ver invoiceStatusUpdateSchema.
  const registrarNfseNaPagaRes = await api(`/v1/invoices/${invoiceSemNfseParaWebhook.id}`, {
    method: "PATCH",
    body: JSON.stringify({ nfseNumber: "NFSe-0002" }),
  });
  report(
    "PATCH só com nfseNumber (sem status) numa fatura paga → continua 'paga', nfseNumber gravado",
    registrarNfseNaPagaRes.status === 200 &&
      registrarNfseNaPagaRes.body?.data?.status === "paga" &&
      registrarNfseNaPagaRes.body?.data?.nfseNumber === "NFSe-0002",
    registrarNfseNaPagaRes.body
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
    const res = await fetch(`${baseUrl}${path}`, {
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

  return { projectId, firstPhase, secondPhase, thirdPhase, smokeUser, user2, api2 };
}
