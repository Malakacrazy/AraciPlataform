import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- as três
// seções "Portal do cliente" (magic link + sessão, logout, pré-venda),
// mantidas juntas porque compartilham portalTestEmail/clientSessionToken
// entre si. Precisa rodar só depois do bloco de presentation-link: o
// portal gera um link sob demanda pra quem ainda não tem um (ver
// ClientPortalService.listProjects), e isso contaminaria o teste
// "antes de gerar → data null" de lá se rodasse antes -- achado rodando
// o smoke suite de verdade, não hipotético. clientId/projectId são
// fixtures criadas bem antes, em seções ainda não extraídas.
export async function runClientPortalChecks({
  api,
  report,
  baseUrl,
  clientId,
  projectId,
}: {
  api: ApiFn;
  report: ReportFn;
  baseUrl: string;
  clientId: string;
  projectId: string;
}) {
  // --- Portal do cliente: magic link + sessão ---------------------------
  // Client.email é @unique (achado A-05) -- clientId já nasceu com
  // fernandaEmail, único por execução (ver POST /clients acima), mas o
  // teste do portal quer testar login por e-mail com um valor próprio
  // dele, sem reusar o que o resto do script já espera em clientId.email.
  // Ainda em example.com (RFC 2606), nunca entrega de verdade.
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

  const portalProjectsNoAuthRes = await fetch(`${baseUrl}/v1/client-portal/projects`);
  report(
    "GET /client-portal/projects sem X-Client-Session → 401",
    portalProjectsNoAuthRes.status === 401
  );

  const portalProjectsBadTokenRes = await fetch(`${baseUrl}/v1/client-portal/projects`, {
    headers: { "X-Client-Session": "token-invalido-qualquer-coisa" },
  });
  report(
    "GET /client-portal/projects com token inválido → 401",
    portalProjectsBadTokenRes.status === 401
  );

  const portalProjectsRes = await fetch(`${baseUrl}/v1/client-portal/projects`, {
    headers: { "X-Client-Session": clientSessionToken },
  });
  const portalProjectsBody = await portalProjectsRes.json().catch(() => null);
  const portalProject = portalProjectsBody?.data?.projects?.find((p: any) => p.id === projectId);
  report(
    "GET /client-portal/projects → inclui o projeto do cliente, com link de apresentação gerado sob demanda",
    portalProjectsRes.status === 200 && !!portalProject?.presentationToken,
    portalProjectsBody
  );

  // --- Portal do cliente: logout revoga a sessão NO SERVIDOR -----------
  // Achado de revisão de segurança: "sair" só apagava o cookie, então o
  // token seguia válido por até 7 dias -- quem tivesse copiado ele antes
  // continuava dentro. O que importa testar aqui não é "o endpoint
  // responde 200", é que o token PARA de funcionar depois. Sessão nova e
  // separada de propósito, pra não derrubar `clientSessionToken`, que os
  // testes seguintes ainda usam (e provar, de quebra, que revogar uma
  // sessão não afeta as outras do mesmo cliente).
  await api("/v1/client-portal/request-link", {
    method: "POST",
    body: JSON.stringify({ email: portalTestEmail }),
  });
  const logoutMagicLink = await prisma.clientMagicLink.findFirst({
    where: { clientId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const throwawaySessionRes = await api("/v1/client-portal/consume", {
    method: "POST",
    body: JSON.stringify({ token: logoutMagicLink?.token }),
  });
  const throwawaySession = throwawaySessionRes.body?.data?.sessionToken;

  const beforeLogoutRes = await fetch(`${baseUrl}/v1/client-portal/projects`, {
    headers: { "X-Client-Session": throwawaySession },
  });
  report(
    "Sessão nova do portal funciona antes do logout → 200",
    beforeLogoutRes.status === 200,
    beforeLogoutRes.status
  );

  const logoutRes = await fetch(`${baseUrl}/v1/client-portal/logout`, {
    method: "POST",
    headers: { "X-Client-Session": throwawaySession },
  });
  report("POST /client-portal/logout → 200", logoutRes.status === 200, logoutRes.status);

  const afterLogoutRes = await fetch(`${baseUrl}/v1/client-portal/projects`, {
    headers: { "X-Client-Session": throwawaySession },
  });
  report(
    "Mesmo token DEPOIS do logout → 401 (sessão revogada no servidor, não só o cookie apagado)",
    afterLogoutRes.status === 401,
    afterLogoutRes.status
  );

  const otherSessionStillRes = await fetch(`${baseUrl}/v1/client-portal/projects`, {
    headers: { "X-Client-Session": clientSessionToken },
  });
  report(
    "Revogar uma sessão não derruba as outras sessões do mesmo cliente → 200",
    otherSessionStillRes.status === 200,
    otherSessionStillRes.status
  );

  // --- Portal do cliente: pré-venda (lacuna da matriz) -----------------
  // Opportunity sem Project ainda, com proposta enviada -- precisa ser
  // uma nova (não reaproveitar `opportunityId`, que a esta altura já foi
  // marcado ganho lá em cima e não passaria no filtro `wonAt: null` de
  // listPendingProposals).
  const presaleOppRes = await api("/v1/opportunities", {
    method: "POST",
    body: JSON.stringify({
      clientId,
      title: "Sala comercial (pré-venda portal)",
      stage: "proposta_enviada",
      feeModel: "hora_tecnica",
      estimatedValue: 12000,
    }),
  });
  const presaleOppId = presaleOppRes.body?.data?.id;

  const presaleProposalRes = await api("/v1/proposals", {
    method: "POST",
    body: JSON.stringify({
      opportunityId: presaleOppId,
      roleHours: [{ role: "Arquiteto Líder (RT)", stage: "CAPTACAO_ALINHAMENTO", hours: 10 }],
      complexityScores: { tipologia: 3, programaEscopo: 3, terreno: 3, regulatorio: 3, ambicaoDesign: 3 },
      contractedStages: ["CAPTACAO_ALINHAMENTO"],
    }),
  });
  const presaleProposalId = presaleProposalRes.body?.data?.id;
  // Mesmo atalho já usado acima pra proposalV2 -- não vale disparar a
  // ZapSign de verdade só pra chegar em status "sent".
  await prisma.proposal.update({
    where: { id: presaleProposalId },
    data: { status: "sent", sentAt: new Date(), zapsignSignUrl: "https://app.zapsign.com.br/verificar/fake-sandbox-presale" },
  });

  const pendingNoAuthRes = await fetch(`${baseUrl}/v1/client-portal/pending-proposals`);
  report("GET /client-portal/pending-proposals sem X-Client-Session → 401", pendingNoAuthRes.status === 401);

  const pendingRes = await fetch(`${baseUrl}/v1/client-portal/pending-proposals`, {
    headers: { "X-Client-Session": clientSessionToken },
  });
  const pendingBody = await pendingRes.json().catch(() => null);
  const presalePending = pendingBody?.data?.find((o: any) => o.id === presaleOppId);
  report(
    "GET /client-portal/pending-proposals → inclui a oportunidade com proposta 'sent', sem Project",
    pendingRes.status === 200 && !!presalePending && presalePending.proposal.status === "sent",
    pendingBody
  );
  report(
    "Proposta na lista de pendentes não vaza baseCost/adjustedCost/complexityMultiplier/packageDiscountPercent",
    presalePending?.proposal?.baseCost === undefined &&
      presalePending?.proposal?.adjustedCost === undefined &&
      presalePending?.proposal?.complexityMultiplier === undefined &&
      presalePending?.proposal?.packageDiscountPercent === undefined,
    presalePending?.proposal
  );

  const commentNoAuthRes = await api(`/v1/client-portal/opportunities/${presaleOppId}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment: "Quanto tempo dura a etapa de captação?" }),
  });
  report(
    "POST /client-portal/opportunities/:id/comment sem X-Client-Session → 401",
    commentNoAuthRes.status === 401,
    commentNoAuthRes.body
  );

  const commentWrongOppRes = await fetch(`${baseUrl}/v1/client-portal/opportunities/nonexistent-opportunity-id/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client-Session": clientSessionToken },
    body: JSON.stringify({ comment: "Não deveria funcionar" }),
  });
  report(
    "POST .../comment numa Opportunity que não é do cliente da sessão (ou inexistente) → 401",
    commentWrongOppRes.status === 401,
    await commentWrongOppRes.json().catch(() => null)
  );

  const commentRes = await fetch(`${baseUrl}/v1/client-portal/opportunities/${presaleOppId}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client-Session": clientSessionToken },
    body: JSON.stringify({ comment: "Quanto tempo dura a etapa de captação?" }),
  });
  report("POST /client-portal/opportunities/:id/comment → 200", commentRes.status === 200, await commentRes.json().catch(() => null));

  const afterCommentOppRes = await api(`/v1/opportunities/${presaleOppId}`);
  report(
    "Comentário do prospecto aparece no lado staff (Opportunity.prospectComment)",
    afterCommentOppRes.body?.data?.prospectComment === "Quanto tempo dura a etapa de captação?",
    afterCommentOppRes.body
  );

  const declineNoAuthRes = await api(`/v1/client-portal/opportunities/${presaleOppId}/decline`, { method: "POST" });
  report("POST /client-portal/opportunities/:id/decline sem X-Client-Session → 401", declineNoAuthRes.status === 401, declineNoAuthRes.body);

  const declineRes = await fetch(`${baseUrl}/v1/client-portal/opportunities/${presaleOppId}/decline`, {
    method: "POST",
    headers: { "X-Client-Session": clientSessionToken },
  });
  report("POST /client-portal/opportunities/:id/decline → 200", declineRes.status === 200, await declineRes.json().catch(() => null));

  const afterDeclineOppRes = await api(`/v1/opportunities/${presaleOppId}`);
  report(
    "Recusar no portal → mesma trilha de mark-lost (lostAt/lostReason preenchidos)",
    !!afterDeclineOppRes.body?.data?.lostAt &&
      afterDeclineOppRes.body?.data?.lostReason === "Recusado pelo prospecto no portal",
    afterDeclineOppRes.body
  );

  const pendingAfterDeclineRes = await fetch(`${baseUrl}/v1/client-portal/pending-proposals`, {
    headers: { "X-Client-Session": clientSessionToken },
  });
  const pendingAfterDeclineBody = await pendingAfterDeclineRes.json().catch(() => null);
  report(
    "Depois de recusada, some da lista de pendentes (lostAt agora preenchido)",
    !pendingAfterDeclineBody?.data?.some((o: any) => o.id === presaleOppId),
    pendingAfterDeclineBody
  );

  // Cleanup inline -- Proposal/ProposalStage têm FK RESTRICT em
  // Opportunity (sem onDelete: Cascade, ver schema.prisma), então apagar
  // a Opportunity direto pela API (que só limpa Activity, ver
  // OpportunitiesService.deleteOpportunity) quebraria aqui.
  await prisma.proposalStage.deleteMany({ where: { proposalId: presaleProposalId } });
  await prisma.proposal.delete({ where: { id: presaleProposalId } });
  await api(`/v1/opportunities/${presaleOppId}`, { method: "DELETE" });
}
