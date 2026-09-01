import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Consultores externos" ("o item mais delicado do plano inteiro" --
// portal só-leitura totalmente separado do resto da API, ver
// collaborator-portal/). Self-contido: cria o próprio consultor/convite/
// sessão e limpa tudo no fim (tabelas novas que cleanup-smoke-residue.ts
// ainda não sabe limpar sozinho, mesmo motivo do bloco de LGPD).
export async function runCollaboratorPortalChecks({
  api,
  report,
  baseUrl,
  projectId,
}: {
  api: ApiFn;
  report: ReportFn;
  baseUrl: string;
  projectId: string;
}) {
  const collaboratorEmail = `smoke-collaborator-${Date.now()}@example.com`;
  const inviteCollabRes = await api(`/v1/projects/${projectId}/collaborators`, {
    method: "POST",
    body: JSON.stringify({ email: collaboratorEmail, name: "Consultor Externo (smoke-test)" }),
  });
  report(
    "POST /projects/:id/collaborators → 201, convida um consultor externo novo",
    inviteCollabRes.status === 201 && inviteCollabRes.body?.data?.collaborator?.email === collaboratorEmail,
    inviteCollabRes.body
  );
  const collaboratorId = inviteCollabRes.body?.data?.collaborator?.id;

  const inviteCollabAgainRes = await api(`/v1/projects/${projectId}/collaborators`, {
    method: "POST",
    body: JSON.stringify({ email: collaboratorEmail, name: "Nome diferente (não deveria sobrescrever)" }),
  });
  report(
    "Convidar de novo pro MESMO projeto → 201 idempotente, mesmo collaboratorId, não duplica",
    inviteCollabAgainRes.status === 201 && inviteCollabAgainRes.body?.data?.collaborator?.id === collaboratorId,
    inviteCollabAgainRes.body
  );

  const listCollabRes = await api(`/v1/projects/${projectId}/collaborators`);
  report(
    "GET /projects/:id/collaborators → inclui o convite, sem duplicar (achado: idempotência acima)",
    listCollabRes.status === 200 && listCollabRes.body?.data?.length === 1,
    listCollabRes.body
  );

  const requestCollabLinkRes = await api("/v1/collaborator-portal/request-link", {
    method: "POST",
    body: JSON.stringify({ email: collaboratorEmail }),
  });
  report(
    "POST /collaborator-portal/request-link → 200 (mensagem genérica)",
    requestCollabLinkRes.status === 200,
    requestCollabLinkRes.body
  );

  const requestCollabLinkUnknownRes = await api("/v1/collaborator-portal/request-link", {
    method: "POST",
    body: JSON.stringify({ email: "ninguem-convidado@example.com" }),
  });
  report(
    "... com e-mail nunca convidado → mesma resposta 200 (sem enumeração)",
    requestCollabLinkUnknownRes.status === 200 &&
      requestCollabLinkUnknownRes.body?.data?.message === requestCollabLinkRes.body?.data?.message,
    requestCollabLinkUnknownRes.body
  );

  const collabMagicLink = await prisma.collaboratorMagicLink.findFirst({
    where: { collaborator: { email: collaboratorEmail } },
    orderBy: { createdAt: "desc" },
  });
  report("Magic link do consultor foi persistido no banco", !!collabMagicLink, collabMagicLink);

  const consumeCollabRes = await api("/v1/collaborator-portal/consume", {
    method: "POST",
    body: JSON.stringify({ token: collabMagicLink?.token }),
  });
  report(
    "POST /collaborator-portal/consume → 200, devolve sessionToken",
    consumeCollabRes.status === 200 && !!consumeCollabRes.body?.data?.sessionToken,
    consumeCollabRes.body
  );
  const collaboratorSessionToken = consumeCollabRes.body?.data?.sessionToken;

  const consumeCollabAgainRes = await api("/v1/collaborator-portal/consume", {
    method: "POST",
    body: JSON.stringify({ token: collabMagicLink?.token }),
  });
  report("Reusar o mesmo magic link → 401 (uso único)", consumeCollabAgainRes.status === 401, consumeCollabAgainRes.body);

  const collabProjectsNoAuthRes = await fetch(`${baseUrl}/v1/collaborator-portal/projects`);
  report(
    "GET /collaborator-portal/projects sem X-Collaborator-Session → 401",
    collabProjectsNoAuthRes.status === 401
  );

  const collabProjectsRes = await fetch(`${baseUrl}/v1/collaborator-portal/projects`, {
    headers: { "X-Collaborator-Session": collaboratorSessionToken },
  });
  const collabProjectsBody = await collabProjectsRes.json().catch(() => null);
  report(
    "GET /collaborator-portal/projects → inclui só o projeto convidado (nenhum outro)",
    collabProjectsRes.status === 200 &&
      collabProjectsBody?.data?.projects?.length === 1 &&
      collabProjectsBody?.data?.projects?.[0]?.id === projectId,
    collabProjectsBody
  );

  const collabProjectDetailRes = await fetch(`${baseUrl}/v1/collaborator-portal/projects/${projectId}`, {
    headers: { "X-Collaborator-Session": collaboratorSessionToken },
  });
  const collabProjectDetailBody = await collabProjectDetailRes.json().catch(() => null);
  report(
    "GET /collaborator-portal/projects/:id → 200, traz fases com tarefas",
    collabProjectDetailRes.status === 200 && Array.isArray(collabProjectDetailBody?.data?.phases),
    collabProjectDetailBody
  );
  report(
    "Projeção do consultor não vaza budget de fase nem nada financeiro",
    collabProjectDetailBody?.data?.phases?.every((p: any) => p.budget === undefined),
    collabProjectDetailBody?.data?.phases
  );

  const collabWrongProjectRes = await fetch(`${baseUrl}/v1/collaborator-portal/projects/does-not-exist`, {
    headers: { "X-Collaborator-Session": collaboratorSessionToken },
  });
  report(
    "GET /collaborator-portal/projects/:id sem convite pra esse projeto → 403 (sessão continua válida, não é 401)",
    collabWrongProjectRes.status === 403,
    await collabWrongProjectRes.json().catch(() => null)
  );

  const revokeCollabRes = await api(`/v1/projects/${projectId}/collaborators/${collaboratorId}`, { method: "DELETE" });
  report("DELETE /projects/:id/collaborators/:collaboratorId → 204", revokeCollabRes.status === 204, revokeCollabRes.body);

  const collabProjectsAfterRevokeRes = await fetch(`${baseUrl}/v1/collaborator-portal/projects`, {
    headers: { "X-Collaborator-Session": collaboratorSessionToken },
  });
  const collabProjectsAfterRevokeBody = await collabProjectsAfterRevokeRes.json().catch(() => null);
  report(
    "Depois de revogado, GET /collaborator-portal/projects não traz mais o projeto (mesma sessão, ainda válida)",
    collabProjectsAfterRevokeBody?.data?.projects?.length === 0,
    collabProjectsAfterRevokeBody
  );

  const collabProjectDetailAfterRevokeRes = await fetch(`${baseUrl}/v1/collaborator-portal/projects/${projectId}`, {
    headers: { "X-Collaborator-Session": collaboratorSessionToken },
  });
  report(
    "Depois de revogado, GET /collaborator-portal/projects/:id direto → 403",
    collabProjectDetailAfterRevokeRes.status === 403,
    await collabProjectDetailAfterRevokeRes.json().catch(() => null)
  );

  // Cleanup inline -- tabelas novas, cleanup-smoke-residue.ts ainda não
  // sabe delas (mesmo motivo já documentado pro bloco de LGPD).
  await prisma.collaboratorSession.deleteMany({ where: { collaborator: { email: collaboratorEmail } } });
  await prisma.collaboratorMagicLink.deleteMany({ where: { collaborator: { email: collaboratorEmail } } });
  await prisma.collaboratorProjectAccess.deleteMany({ where: { collaborator: { email: collaboratorEmail } } });
  await prisma.externalCollaborator.deleteMany({ where: { email: collaboratorEmail } });
}
