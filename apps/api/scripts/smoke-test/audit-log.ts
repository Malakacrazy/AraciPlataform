import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Log de auditoria". Não insere nada direto via prisma como outras
// seções -- o objetivo é validar que a extensão do Prisma
// (audit/prisma-audit-extension.ts) gravou sozinha, a partir de ações
// reais já feitas pelo resto do script (o POST /clients lá no topo, a
// promoção de staff pra admin), sem nenhum service ter chamado nada
// explicitamente -- por isso depende de IDs criados bem antes
// (clientId, staffUserId), passados como parâmetro em vez de recriados
// aqui.
export async function runAuditLogChecks({
  api,
  report,
  mintToken,
  baseUrl,
  email,
  clientId,
  staffUserId,
}: {
  api: ApiFn;
  report: ReportFn;
  mintToken: (email: string) => Promise<string>;
  baseUrl: string;
  email: string;
  clientId: string;
  staffUserId: string;
}) {
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
    promoteEntry?.actorEmail === email &&
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
  const auditAsStaffRes = await fetch(`${baseUrl}/v1/audit-log`, {
    headers: { Authorization: `Bearer ${secondStaffToken}` },
  });
  const auditAsStaffBody = await auditAsStaffRes.json().catch(() => null);
  report("GET /audit-log como staff → 403 FORBIDDEN", auditAsStaffRes.status === 403, auditAsStaffBody);
}
