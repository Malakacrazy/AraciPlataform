// Precisa ser o primeiro import: @araci/db lê process.env.DATABASE_URL no
// carregamento do módulo (mesma ordem de apps/api/src/main.ts).
import "dotenv/config";
import { SignJWT } from "jose";
import { prisma } from "@araci/db";
import { calcularOverheadPorHora, calcularTarifaHora } from "../src/crm/pricing";
import { runLgpdChecks } from "./smoke-test/lgpd";
import { runGoogleCredentialChecks } from "./smoke-test/google-credential";
import { runAuditLogChecks } from "./smoke-test/audit-log";
import { runNotificationChecks } from "./smoke-test/notifications";
import { runDataRetentionConfigChecks, runNfseAmbienteConfigChecks } from "./smoke-test/account-config";
import { runPermissionChecks } from "./smoke-test/permissions";
import { runDocumentChecklistChecks } from "./smoke-test/document-checklist";
import { runCollaboratorPortalChecks } from "./smoke-test/collaborator-portal";
import { runExpensesAndBiChecks } from "./smoke-test/expenses-and-bi";
import { runPresentationLinkChecks } from "./smoke-test/presentation-link";
import { runClientPortalChecks } from "./smoke-test/client-portal";
import { runProposalVersioningAndLifecycleChecks } from "./smoke-test/proposal-versioning-and-lifecycle";
import { runTasksAndProjectResourcesChecks } from "./smoke-test/tasks-and-project-resources";

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
    // 15m, não 60s: isso é só um token de teste que este script forja
    // direto (não passa pelo mint-por-requisição real de apps/web), e o
    // suite inteiro roda sequencial sob o mesmo token — precisa sobrar
    // tempo pra suite crescer sem os checks do fim começarem a falhar
    // por token expirado no meio da execução.
    .setExpirationTime("15m")
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

  // Achado C-01: antes desta correção, qualquer e-mail num JWT interno
  // válido virava User staff automaticamente (ensureAccountAndUser sem
  // checagem nenhuma). O JWT aqui é forjado direto com mintToken (só
  // precisa do INTERNAL_API_SECRET, que este script já tem) -- é
  // exatamente o caminho que auth.guard.ts precisa barrar sozinho, sem
  // depender do callback signIn de apps/web (defesa em profundidade).
  const intruderToken = await mintToken("intruso@gmail.com");
  const intruderRes = await fetch(`${BASE_URL}/v1/clients`, {
    headers: { Authorization: `Bearer ${intruderToken}` },
  });
  report(
    "JWT interno válido com e-mail fora do domínio/allowlist → 403, não 200 (achado C-01)",
    intruderRes.status === 403,
    await intruderRes.json().catch(() => null)
  );

  // Achado A-05: Client.email agora é @unique, e uma "Fernanda Ribeiro"
  // com e-mail fernanda@example.com já existe permanentemente no banco de
  // dev (KEEP_CLIENT_ID em cleanup-smoke-residue.ts, com asaasCustomerId
  // real -- mantida entre sessões pra verificação do Asaas). Antes da
  // constraint, cada execução deste script criava outra linha com o
  // MESMO e-mail sem conflito nenhum; agora precisa de um e-mail próprio
  // por execução, mesmo padrão já usado abaixo pra fernandaPortalEmail.
  const fernandaEmail = `fernanda-${Date.now()}@example.com`;
  const clientRes = await api("/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: "Fernanda Ribeiro", email: fernandaEmail, source: "indicacao" }),
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

  // Custos fixos do estúdio + tarifa calculada a partir de salário/
  // encargos (achado real: o usuário só conseguia digitar a tarifa/hora
  // já pronta, não os custos/salários que a geram — ver
  // docs/fase-0/roadmap-atualizado.md, item "Custos fixos do estúdio").
  // Account é a conta única compartilhada por todo este ambiente de dev
  // (não uma fixture descartável por run), então o teste NUNCA sobrescreve
  // Account.pricing* — só lê a config atual e reproduz a mesma fórmula
  // (crm/pricing.ts) com esses valores reais, em vez de assumir um
  // cenário fixo que quebraria se alguém tivesse calibrado a config de
  // verdade entre execuções.
  const fixedCostRes = await api("/v1/studio-fixed-costs", {
    method: "POST",
    body: JSON.stringify({ description: "Custo fixo de teste (smoke-test)", monthlyAmount: 500 }),
  });
  report("POST /studio-fixed-costs → 201", fixedCostRes.status === 201, fixedCostRes.body);
  const fixedCostId = fixedCostRes.body?.data?.id;

  const listFixedCostsRes = await api("/v1/studio-fixed-costs");
  report(
    "GET /studio-fixed-costs inclui o custo fixo criado neste run",
    listFixedCostsRes.body?.data?.some((c: any) => c.id === fixedCostId),
    listFixedCostsRes.body
  );

  const accountForPricingRes = await api("/v1/account");
  const accountForPricing = accountForPricingRes.body?.data;
  const totalFixedCosts = (listFixedCostsRes.body?.data ?? []).reduce(
    (sum: number, c: any) => sum + Number(c.monthlyAmount),
    0
  );
  const studioBillableHoursPerMonth =
    accountForPricing.pricingBusinessDaysPerMonth *
    Number(accountForPricing.pricingBillableHoursPerDay) *
    Number(accountForPricing.pricingActiveStaffCount);
  const overheadPorHora = calcularOverheadPorHora({
    totalMonthlyFixedCosts: totalFixedCosts,
    billableHoursPerMonth: studioBillableHoursPerMonth,
  });
  const expectedTarifa = calcularTarifaHora(
    { role: "", grossSalary: 5000, payrollBurdenPercent: 0.5, billableHoursPerMonth: 160 },
    overheadPorHora,
    {
      marginTarget: Number(accountForPricing.pricingMarginPercent),
      taxBurden: Number(accountForPricing.pricingTaxBurdenPercent),
    }
  );

  const calculatedRoleRateRes = await api("/v1/role-rates", {
    method: "POST",
    body: JSON.stringify({
      role: "Papel de teste (smoke-test)",
      grossSalary: 5000,
      payrollBurdenPercent: 0.5,
      billableHoursPerMonth: 160,
    }),
  });
  report(
    "POST /role-rates com salário+encargos+horas → 201, hourlyRate calculado bate com a fórmula",
    calculatedRoleRateRes.status === 201 &&
      Math.abs(Number(calculatedRoleRateRes.body?.data?.hourlyRate) - expectedTarifa) < 0.01,
    { got: calculatedRoleRateRes.body?.data, expected: expectedTarifa }
  );
  report(
    "grossSalary/payrollBurdenPercent persistidos junto com o hourlyRate calculado",
    Number(calculatedRoleRateRes.body?.data?.grossSalary) === 5000 &&
      Number(calculatedRoleRateRes.body?.data?.payrollBurdenPercent) === 0.5,
    calculatedRoleRateRes.body
  );

  // Reenviar o MESMO papel agora com hourlyRate direto -- confirma que o
  // modo "digitar direto" limpa os campos de compensação antigos
  // (RoleRatesService.upsertRoleRate), senão a UI mostraria "calculada"
  // pra uma tarifa que na verdade foi sobrescrita à mão.
  const overrideRoleRateRes = await api("/v1/role-rates", {
    method: "POST",
    body: JSON.stringify({ role: "Papel de teste (smoke-test)", hourlyRate: 42 }),
  });
  report(
    "Reenviar o mesmo papel com hourlyRate direto limpa os campos de compensação antigos",
    Number(overrideRoleRateRes.body?.data?.hourlyRate) === 42 && overrideRoleRateRes.body?.data?.grossSalary === null,
    overrideRoleRateRes.body
  );

  const badRoleRateRes = await api("/v1/role-rates", {
    method: "POST",
    body: JSON.stringify({ role: "Papel incompleto (smoke-test)", grossSalary: 5000 }),
  });
  report(
    "POST /role-rates só com grossSalary (sem encargos/horas, sem hourlyRate) → 400 VALIDATION_ERROR",
    badRoleRateRes.status === 400,
    badRoleRateRes.body
  );

  const deleteFixedCostRes = await api(`/v1/studio-fixed-costs/${fixedCostId}`, { method: "DELETE" });
  report("DELETE /studio-fixed-costs/:id → 204", deleteFixedCostRes.status === 204, deleteFixedCostRes.body);

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

  // Achado da auditoria: calcularProposta só sabe calcular hora_tecnica --
  // antes desta guarda, uma oportunidade valor_m2 calculava horas×tarifa
  // do mesmo jeito, em silêncio, apresentado como resultado real.
  const valorM2OppRes = await api("/v1/opportunities", {
    method: "POST",
    body: JSON.stringify({ clientId, title: "Reforma cobrada por m² (teste)", stage: "novo_lead", feeModel: "valor_m2" }),
  });
  const valorM2OppId = valorM2OppRes.body?.data?.id;
  const valorM2ProposalRes = await api("/v1/proposals", {
    method: "POST",
    body: JSON.stringify({
      opportunityId: valorM2OppId,
      roleHours: [{ role: "Arquiteto Líder (RT)", stage: "CAPTACAO_ALINHAMENTO", hours: 10 }],
      complexityScores: { tipologia: 3, programaEscopo: 3, terreno: 3, regulatorio: 3, ambicaoDesign: 3 },
      contractedStages: ["CAPTACAO_ALINHAMENTO"],
    }),
  });
  report(
    "POST /proposals numa oportunidade valor_m2 → 422 FEE_MODEL_NOT_SUPPORTED, não calcula por hora em silêncio",
    valorM2ProposalRes.status === 422 && valorM2ProposalRes.body?.error?.code === "FEE_MODEL_NOT_SUPPORTED",
    valorM2ProposalRes.body
  );
  const value = Number(proposal?.value);
  report(`Valor final ≈ R$ 6484.20 (calculado: ${value})`, Math.abs(value - 6484.2) < 1);

  const stagesRes = await api(`/v1/proposals/${proposal?.id}/stages`);
  report(
    "GET /proposals/:id/stages → 200 com 5 linhas",
    stagesRes.status === 200 && Array.isArray(stagesRes.body?.data) && stagesRes.body.data.length === 5,
    stagesRes.body
  );

  // --- Versionamento e assinatura de proposta, ciclo de vida da
  // Opportunity, captação de leads, fases/gates, horas/faturamento,
  // NFS-e e webhook da Asaas -- extraído pra
  // smoke-test/proposal-versioning-and-lifecycle.ts (revisão de
  // qualidade de código). ---------------------------------------------
  const { projectId, firstPhase, secondPhase, thirdPhase, smokeUser, user2, api2 } =
    await runProposalVersioningAndLifecycleChecks({
      api,
      report,
      baseUrl: BASE_URL,
      mintToken,
      email: EMAIL,
      clientId,
      opportunityId,
      proposalId: proposal?.id,
      valorM2OppId,
      fernandaEmail,
    });

  // --- Tarefas, chaves de API, membros/alocações/ausências de projeto,
  // produtos/variantes FF&E, checkout do carrinho e quadro tldraw --
  // extraído pra smoke-test/tasks-and-project-resources.ts (revisão de
  // qualidade de código). -------------------------------------------
  const { product1Id, spec1Id } = await runTasksAndProjectResourcesChecks({
    api,
    api2,
    report,
    baseUrl: BASE_URL,
    projectId,
    firstPhase,
    secondPhase,
    user2,
  });

  // --- Link de apresentação -- extraído pra
  // smoke-test/presentation-link.ts (revisão de qualidade de código).
  // -------------------------------------------------------------------
  await runPresentationLinkChecks({ api, report, baseUrl: BASE_URL, projectId, product1Id, spec1Id });

  // --- Portal do cliente: magic link + sessão, logout, pré-venda --------
  // Extraído pra smoke-test/client-portal.ts (revisão de qualidade de
  // código). ---------------------------------------------------------
  await runClientPortalChecks({ api, report, baseUrl: BASE_URL, clientId, projectId });

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
  const calendarLinkId = calendarLinkRes.body?.data?.id;

  // Lacuna da matriz (gestão documental por projeto, "versionamento") --
  // sem ninguém conectado ao Drive ainda neste run (só acontece bem mais
  // adiante), então só o caminho de falha é testável aqui, mesmo padrão
  // de sempre pra tudo que depende de credencial real do Drive.
  const revisionsSemConexaoRes = await api(`/v1/office-links/${driveLinkId}/revisions`);
  report(
    "GET /office-links/:id/revisions sem ninguém conectado ao Drive → 422 GOOGLE_DRIVE_NOT_CONNECTED",
    revisionsSemConexaoRes.status === 422 && revisionsSemConexaoRes.body?.error?.code === "GOOGLE_DRIVE_NOT_CONNECTED",
    revisionsSemConexaoRes.body
  );

  const revisionsProviderErradoRes = await api(`/v1/office-links/${calendarLinkId}/revisions`);
  report(
    "GET /office-links/:id/revisions de um vínculo CALENDAR (sem revisão nenhuma) → 404",
    revisionsProviderErradoRes.status === 404,
    revisionsProviderErradoRes.body
  );

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

  // Lacuna da matriz (gestão documental por projeto, "taxonomia") -------
  const updateLinkTaxonomyRes = await api(`/v1/office-links/${driveLinkId}`, {
    method: "PATCH",
    body: JSON.stringify({ documentType: "planta", phaseId: firstPhase.id, visibleToClient: true }),
  });
  report(
    "PATCH /office-links/:id → 200, grava tipo de documento/fase/visibilidade",
    updateLinkTaxonomyRes.status === 200 &&
      updateLinkTaxonomyRes.body?.data?.documentType === "planta" &&
      updateLinkTaxonomyRes.body?.data?.phaseId === firstPhase.id &&
      updateLinkTaxonomyRes.body?.data?.visibleToClient === true,
    updateLinkTaxonomyRes.body
  );

  const updateLinkPhaseOutroProjetoRes = await api(`/v1/office-links/${clientLinkRes.body?.data?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ phaseId: firstPhase.id }),
  });
  report(
    "PATCH /office-links/:id ligando fase num vínculo de CLIENT (sem fase nenhuma) → 422",
    updateLinkPhaseOutroProjetoRes.status === 422 &&
      updateLinkPhaseOutroProjetoRes.body?.error?.code === "OFFICE_LINK_PHASE_NOT_APPLICABLE",
    updateLinkPhaseOutroProjetoRes.body
  );

  // Lacuna da matriz (gestão documental por projeto, "Drive real") ------
  // Sem credencial de sincronização conectada neste ambiente de dev (achado
  // real: nenhum admin rodou o fluxo OAuth de /api/google/authorize com
  // escopo drive.file) -- as duas guardas abaixo são exercitadas de
  // verdade, sem precisar de fake nenhum aqui (o "porta fake do Drive" só
  // entra em cena no unit test, ver google-drive.service.spec.ts).
  const driveFoldersRes = await api(`/v1/projects/${projectId}/drive-folders`, { method: "POST" });
  report(
    "POST /projects/:id/drive-folders sem ninguém conectado ao Drive → 422 GOOGLE_DRIVE_NOT_CONNECTED",
    driveFoldersRes.status === 422 && driveFoldersRes.body?.error?.code === "GOOGLE_DRIVE_NOT_CONNECTED",
    driveFoldersRes.body
  );

  const checkBrokenLinksRes = await api("/v1/office-links/check-broken-links", { method: "POST" });
  report(
    "POST /office-links/check-broken-links sem ninguém conectado ao Drive → 422 GOOGLE_DRIVE_NOT_CONNECTED",
    checkBrokenLinksRes.status === 422 && checkBrokenLinksRes.body?.error?.code === "GOOGLE_DRIVE_NOT_CONNECTED",
    checkBrokenLinksRes.body
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
  // Achado A-02: Activity é o mesmo padrão polimórfico do OfficeLink (sem
  // FK real), então tinha o mesmo risco de nota órfã e inacessível.
  await api(`/v1/clients/${throwawayClientId}/activities`, {
    method: "POST",
    body: JSON.stringify({ body: "Nota do cliente descartável" }),
  });

  const orphanCountBefore = await prisma.officeLink.count({ where: { entityId: throwawayClientId } });
  report("Setup: OfficeLink criado para o cliente descartável antes do delete", orphanCountBefore === 1, orphanCountBefore);
  const orphanActivityCountBefore = await prisma.activity.count({ where: { entityId: throwawayClientId } });
  report("Setup: Activity criada para o cliente descartável antes do delete", orphanActivityCountBefore === 1, orphanActivityCountBefore);

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
  const orphanActivityCountAfter = await prisma.activity.count({ where: { entityId: throwawayClientId } });
  report(
    "Excluir o cliente limpa a Activity junto — zero notas órfãs (achado A-02)",
    orphanActivityCountAfter === 0,
    orphanActivityCountAfter
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

  // --- Retenção/expurgo de dados (LGPD) -- prazo é config, não decisão do
  // código (ver DataRetentionCron). Extraído pra
  // smoke-test/account-config.ts (revisão de qualidade de código). -----
  await runDataRetentionConfigChecks({ api, report });

  // --- Ambiente da NFS-e (config, não env var -- ver Account.nfseAmbiente) --
  await runNfseAmbienteConfigChecks({ api, report });

  // --- Despesas (lado de saída do caixa, achado da auditoria) + painéis
  // de /v1/bi/* -- extraído pra smoke-test/expenses-and-bi.ts (revisão de
  // qualidade de código). -------------------------------------------------
  await runExpensesAndBiChecks({ api, report, projectIdFirst: projectId, user2Id: user2.id });

  // --- Consultores externos (lacuna da matriz, "o item mais delicado do
  // plano inteiro") -- extraído pra smoke-test/collaborator-portal.ts
  // (revisão de qualidade de código). -------------------------------------
  await runCollaboratorPortalChecks({ api, report, baseUrl: BASE_URL, projectId });

  // --- Checklist de documentos obrigatórios (lacuna da matriz, "amarrado
  // ao gate do PEP") -- extraído pra smoke-test/document-checklist.ts
  // (revisão de qualidade de código). Reaproveita thirdPhase (ainda não
  // aprovada até este ponto do run) só pra esta checagem -- nada depois
  // dependia disso continuar assim, e este projeto inteiro é descartado
  // no fim do run mesmo. -----------------------------------------------
  await runDocumentChecklistChecks({
    api,
    report,
    projectId,
    thirdPhaseId: thirdPhase.id,
    thirdPhaseStage: thirdPhase.stage,
  });

  // --- Permissões: Admin vs Staff -------------------------------------
  // Extraído pra smoke-test/permissions.ts (revisão de qualidade de
  // código). Devolve apiAsStaff/staffUserId porque as seções seguintes
  // (notificações, log de auditoria) precisam da MESMA identidade staff.
  const { apiAsStaff, staffUserId } = await runPermissionChecks({
    api,
    report,
    mintToken,
    baseUrl: BASE_URL,
    smokeUserId: smokeUser!.id,
    clientId,
    projectId,
    firstPhaseId: firstPhase.id,
    thirdPhaseId: thirdPhase.id,
  });

  // --- Notificações in-app (sino da Nav) --------------------------------
  // Extraído pra smoke-test/notifications.ts (revisão de qualidade de
  // código). adminAccountId/adminUserId vêm de smokeUser (o mesmo admin
  // cujo token api() usa), não de um novo GET /me -- já testado acima
  // ("GET /me como admin"), reler aqui só duplicaria a chamada.
  await runNotificationChecks({
    api,
    apiAsStaff,
    report,
    adminAccountId: smokeUser!.accountId,
    adminUserId: smokeUser!.id,
    projectId,
  });

  // --- Log de auditoria (quem mudou o quê) ------------------------------
  // Extraído pra smoke-test/audit-log.ts (revisão de qualidade de código).
  await runAuditLogChecks({ api, report, mintToken, baseUrl: BASE_URL, email: EMAIL, clientId, staffUserId });

  // --- LGPD: consentimento, exportação e anonimização -------------------
  // Extraído pra smoke-test/lgpd.ts (revisão de qualidade de código).
  await runLgpdChecks({ api, report, accountId: smokeUser!.accountId, baseUrl: BASE_URL });

  // Fundação de sincronização Google (ver GoogleCredential no schema) --
  // self-service, sem :id na rota (sempre a credencial da PRÓPRIA
  // sessão), então testável de ponta a ponta sem precisar de nenhuma
  // credencial real do Google: refreshToken/scope aqui são valores
  // fictícios só pra exercitar guardar/consultar/desconectar. A troca
  // code→token de verdade acontece em apps/web (fora do alcance deste
  // smoke suite, que bate só em apps/api). Extraído pra
  // smoke-test/google-credential.ts (revisão de qualidade de código).
  await runGoogleCredentialChecks({ api, report, userId: smokeUser!.id });

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
