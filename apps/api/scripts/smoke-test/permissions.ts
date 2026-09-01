import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Permissões: Admin vs Staff". Deixada pro final de propósito no
// arquivo original (comentário abaixo preservado): se um bug deixasse um
// DELETE staff passar de verdade, isso derrubaria clientId/projectId que
// todo o resto do script já usou e já verificou -- rodando por último,
// uma falha aqui nunca invalida retroativamente o que já passou. Devolve
// apiAsStaff/staffUserId porque as seções de notificações e log de
// auditoria (já extraídas) precisam da MESMA identidade staff criada
// aqui, não de uma nova.
export async function runPermissionChecks({
  api,
  report,
  mintToken,
  baseUrl,
  smokeUserId,
  clientId,
  projectId,
  firstPhaseId,
  thirdPhaseId,
}: {
  api: ApiFn;
  report: ReportFn;
  mintToken: (email: string) => Promise<string>;
  baseUrl: string;
  smokeUserId: string;
  clientId: string;
  projectId: string;
  firstPhaseId: string;
  thirdPhaseId: string;
}): Promise<{ apiAsStaff: ApiFn; staffUserId: string }> {
  // Deixado pro final de propósito: se um bug deixasse um DELETE staff
  // passar de verdade, isso derrubaria clientId/projectId que todo o
  // resto do script acima já usou e já verificou -- rodando por último,
  // uma falha aqui nunca invalida retroativamente o que já passou.
  const staffEmail = `smoke-test-staff-${Date.now()}@studioaraci.com.br`;
  const staffToken = await mintToken(staffEmail);
  async function apiAsStaff(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
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

  const staffRequiredDocRes = await apiAsStaff("/v1/required-document-types", {
    method: "POST",
    body: JSON.stringify({ stage: "BRIEFING", documentType: "x" }),
  });
  report(
    "POST /required-document-types como staff → 403 FORBIDDEN (exigência de documento é decisão de admin)",
    staffRequiredDocRes.status === 403,
    staffRequiredDocRes.body
  );

  const staffRoleRatesRes = await apiAsStaff("/v1/role-rates");
  report(
    "GET /role-rates como staff → 403 FORBIDDEN",
    staffRoleRatesRes.status === 403 && staffRoleRatesRes.body?.error?.code === "FORBIDDEN",
    staffRoleRatesRes.body
  );

  const staffInvoicesRes = await apiAsStaff("/v1/invoices");
  report("GET /invoices como staff → 403 FORBIDDEN", staffInvoicesRes.status === 403, staffInvoicesRes.body);

  // Achado A5 da auditoria de 30 ago 2026: qualquer staff editava/apagava
  // o lançamento de horas de QUALQUER colega (só o tenant era checado) e
  // conseguia se autoaprovar. Testado aqui contra uma entrada do ADMIN
  // (dono != staff) e uma entrada do PRÓPRIO staff, pra provar os dois
  // lados da regra: bloqueia o lançamento alheio, permite o próprio.
  const adminTimeEntryParaTesteRes = await api("/v1/time-entries", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      phaseId: firstPhaseId,
      date: new Date().toISOString(),
      hours: 1,
      activityType: "administrativo",
    }),
  });
  const adminTimeEntryParaTesteId = adminTimeEntryParaTesteRes.body?.data?.id;

  const staffEditaLancamentoAlheioRes = await apiAsStaff(`/v1/time-entries/${adminTimeEntryParaTesteId}`, {
    method: "PATCH",
    body: JSON.stringify({ hours: 99 }),
  });
  report(
    "PATCH /time-entries/:id de OUTRA pessoa como staff → 403 FORBIDDEN (achado A5)",
    staffEditaLancamentoAlheioRes.status === 403,
    staffEditaLancamentoAlheioRes.body
  );

  const staffApagaLancamentoAlheioRes = await apiAsStaff(`/v1/time-entries/${adminTimeEntryParaTesteId}`, {
    method: "DELETE",
  });
  report(
    "DELETE /time-entries/:id de OUTRA pessoa como staff → 403 FORBIDDEN, não apaga (achado A5)",
    staffApagaLancamentoAlheioRes.status === 403,
    staffApagaLancamentoAlheioRes.body
  );

  const staffProprioLancamentoRes = await apiAsStaff("/v1/time-entries", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      phaseId: firstPhaseId,
      date: new Date().toISOString(),
      hours: 2,
      activityType: "administrativo",
    }),
  });
  const staffProprioLancamentoId = staffProprioLancamentoRes.body?.data?.id;

  const staffEditaProprioLancamentoRes = await apiAsStaff(`/v1/time-entries/${staffProprioLancamentoId}`, {
    method: "PATCH",
    body: JSON.stringify({ hours: 3 }),
  });
  report(
    "PATCH no PRÓPRIO lançamento como staff → 200 (achado A5 só bloqueia lançamento alheio)",
    staffEditaProprioLancamentoRes.status === 200 && Number(staffEditaProprioLancamentoRes.body?.data?.hours) === 3,
    staffEditaProprioLancamentoRes.body
  );

  const staffAprovaProprioLancamentoRes = await apiAsStaff(`/v1/time-entries/${staffProprioLancamentoId}/approve`, {
    method: "POST",
  });
  report(
    "POST /time-entries/:id/approve como staff → 403 FORBIDDEN (achado A5: aprovação é admin-only, mesmo a própria)",
    staffAprovaProprioLancamentoRes.status === 403,
    staffAprovaProprioLancamentoRes.body
  );

  const staffApagaProprioLancamentoRes = await apiAsStaff(`/v1/time-entries/${staffProprioLancamentoId}`, {
    method: "DELETE",
  });
  report(
    "DELETE no PRÓPRIO lançamento como staff → 204",
    staffApagaProprioLancamentoRes.status === 204,
    staffApagaProprioLancamentoRes.body
  );

  // Achado A20 da auditoria de 30 ago 2026: qualquer staff reescrevia o
  // cadastro de QUALQUER colega, inclusive `role` (chave de precificação
  // da fatura por hora). Testado contra o registro do ADMIN (dono != staff).
  const staffEditaCadastroAlheioRes = await apiAsStaff(`/v1/users/${smokeUserId}`, {
    method: "PATCH",
    body: JSON.stringify({ specialty: "Forjado pelo staff" }),
  });
  report(
    "PATCH /users/:id de OUTRA pessoa como staff → 403 FORBIDDEN (achado A20)",
    staffEditaCadastroAlheioRes.status === 403,
    staffEditaCadastroAlheioRes.body
  );

  const staffEditaProprioRoleRes = await apiAsStaff(`/v1/users/${staffUserId}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "Sócio", specialty: "Renderista" }),
  });
  report(
    "PATCH no PRÓPRIO cadastro como staff → 200, mas `role` é ignorado silenciosamente (achado A20: role é admin-only)",
    staffEditaProprioRoleRes.status === 200 &&
      staffEditaProprioRoleRes.body?.data?.specialty === "Renderista" &&
      staffEditaProprioRoleRes.body?.data?.role !== "Sócio",
    staffEditaProprioRoleRes.body
  );

  // Achado A21: /v1/bi/executivo virou admin-only, mas capacidade/ffe
  // continuam abertos -- gate por rota, não pela classe inteira (a
  // própria auditoria avisa que gatear a classe quebraria /dashboard/capacidade).
  const staffBiExecutivoRes = await apiAsStaff("/v1/bi/executivo");
  report(
    "GET /bi/executivo como staff → 403 FORBIDDEN (achado A21)",
    staffBiExecutivoRes.status === 403,
    staffBiExecutivoRes.body
  );
  const staffBiCapacidadeRes = await apiAsStaff("/v1/bi/capacidade");
  report(
    "GET /bi/capacidade como staff → 200 (achado A21 não gateia isto -- staff usa /dashboard/capacidade)",
    staffBiCapacidadeRes.status === 200,
    staffBiCapacidadeRes.body
  );

  // Achado A22: budget virou admin-only (strip silencioso, mesmo padrão
  // de costPerHour) e travado depois do gate aprovado. thirdPhase nunca
  // foi aprovada neste run -- serve pra provar o strip sem esbarrar no
  // lock; firstPhase já está aprovada -- serve pra provar o lock.
  const staffBudgetRes = await apiAsStaff(`/v1/projects/${projectId}/phases/${thirdPhaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ budget: 999999 }),
  });
  report(
    "PATCH budget de fase como staff → 200, mas budget é ignorado silenciosamente (achado A22)",
    staffBudgetRes.status === 200 && Number(staffBudgetRes.body?.data?.budget) !== 999999,
    staffBudgetRes.body
  );
  const adminBudgetAposAprovacaoRes = await api(`/v1/projects/${projectId}/phases/${firstPhaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ budget: 1 }),
  });
  report(
    "PATCH budget como ADMIN num estágio já aprovado → 422 PHASE_BUDGET_LOCKED (achado A22)",
    adminBudgetAposAprovacaoRes.status === 422 && adminBudgetAposAprovacaoRes.body?.error?.code === "PHASE_BUDGET_LOCKED",
    adminBudgetAposAprovacaoRes.body
  );

  // Achado A23: admin agora consegue revogar a chave de API de OUTRA
  // pessoa (antes só o próprio dono conseguia, mesmo um admin não tinha
  // como desligar a chave de um colega pela API).
  // Precisa ser única por run -- um valor fixo colide (P2002) com a linha
  // órfã que uma run anterior tenha deixado pra trás caso tenha crashado
  // antes de chegar na própria limpeza (mesmo padrão de fakeChaveAcesso acima).
  await prisma.user.update({ where: { id: staffUserId }, data: { apiKeyHash: `chave-fake-so-pra-testar-revogacao-${Date.now()}` } });
  const revokeApiKeyDeOutroComoStaffRes = await apiAsStaff(`/v1/users/${smokeUserId}/api-key`, { method: "DELETE" });
  report(
    "DELETE /users/:id/api-key como staff → 403 FORBIDDEN (achado A23: revogar chave alheia é admin-only)",
    revokeApiKeyDeOutroComoStaffRes.status === 403,
    revokeApiKeyDeOutroComoStaffRes.body
  );
  const revokeApiKeyDeOutroComoAdminRes = await api(`/v1/users/${staffUserId}/api-key`, { method: "DELETE" });
  report(
    "DELETE /users/:id/api-key como admin → 204 (achado A23: admin agora consegue revogar chave alheia)",
    revokeApiKeyDeOutroComoAdminRes.status === 204,
    revokeApiKeyDeOutroComoAdminRes.body
  );
  const staffApiKeyHashDepoisRes = await prisma.user.findUnique({ where: { id: staffUserId }, select: { apiKeyHash: true } });
  report(
    "...e a chave do staff foi mesmo revogada no banco",
    staffApiKeyHashDepoisRes?.apiKeyHash === null,
    staffApiKeyHashDepoisRes
  );

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

  const staffInviteCollabRes = await apiAsStaff(`/v1/projects/${projectId}/collaborators`, {
    method: "POST",
    body: JSON.stringify({ email: "outro-consultor@example.com", name: "x" }),
  });
  report(
    "POST /projects/:id/collaborators como staff → 403 FORBIDDEN (convidar consultor é decisão de admin)",
    staffInviteCollabRes.status === 403,
    staffInviteCollabRes.body
  );

  const permissoesMoodboardRes = await api(`/v1/projects/${projectId}/moodboards`, {
    method: "POST",
    body: JSON.stringify({ name: "Prancha (teste de permissão)" }),
  });
  const permissoesMoodboardId = permissoesMoodboardRes.body?.data?.id;
  const staffInviteGuestRes = await apiAsStaff(`/v1/moodboards/${permissoesMoodboardId}/guests`, {
    method: "POST",
    body: JSON.stringify({ email: "outro-convidado@example.com", name: "x" }),
  });
  report(
    "POST /moodboards/:id/guests como staff → 403 FORBIDDEN (convidar pro quadro é decisão de admin)",
    staffInviteGuestRes.status === 403,
    staffInviteGuestRes.body
  );
  await api(`/v1/moodboards/${permissoesMoodboardId}`, { method: "DELETE" });

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

  return { apiAsStaff, staffUserId };
}
