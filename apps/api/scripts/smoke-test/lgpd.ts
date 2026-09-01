import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "LGPD: consentimento, exportação e anonimização". Self-contido: cria
// os próprios fixtures (lead, cliente, projeto/fatura de teste) e limpa
// tudo que cria antes de retornar (só o cliente principal do bloco fica
// anonimizado no banco, nunca deletado -- é o próprio comportamento
// sendo testado). Era a penúltima seção do arquivo original, nada depois
// dela dependia de nada que ela cria.
export async function runLgpdChecks({
  api,
  report,
  accountId,
  baseUrl,
}: {
  api: ApiFn;
  report: ReportFn;
  accountId: string;
  // /v1/leads é @Public() -- sem token, então não passa por api() (que
  // sempre manda Authorization). Mesmo BASE_URL do script principal,
  // passado explicitamente em vez de rederivado aqui pra nunca poder
  // divergir da instância que o resto do suite está de fato testando.
  baseUrl: string;
}) {
  const semConsentRes = await fetch(`${baseUrl}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Visitante sem consentimento", email: `sem-consentimento-${Date.now()}@example.com` }),
  });
  report(
    "POST /v1/leads sem consent → 400 VALIDATION_ERROR (achado LGPD: captação sem base legal declarada)",
    semConsentRes.status === 400,
    await semConsentRes.json().catch(() => null)
  );

  const lgpdLeadEmail = `lgpd-${Date.now()}@example.com`;
  const comConsentRes = await fetch(`${baseUrl}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Cliente LGPD (teste)", email: lgpdLeadEmail, consent: true }),
  });
  report("POST /v1/leads com consent:true → 201", comConsentRes.status === 201, await comConsentRes.json().catch(() => null));

  const lgpdClientsRes = await api("/v1/clients");
  const lgpdClient = lgpdClientsRes.body?.data?.find((c: any) => c.email === lgpdLeadEmail);
  report(
    "Client criado pelo formulário público tem consentedAt gravado",
    !!lgpdClient?.consentedAt,
    lgpdClient
  );

  // Gera uma entrada de AuditLog com PII real no diff (document é novo
  // neste PATCH) antes de anonimizar -- é exatamente o que a anonimização
  // precisa redigir, não só os campos atuais do Client.
  await api(`/v1/clients/${lgpdClient?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ phone: "11988887777", document: "12345678900" }),
  });

  const exportRes = await api(`/v1/clients/${lgpdClient?.id}/data-export`);
  report(
    "GET /clients/:id/data-export → 200, traz client/opportunities/projects/activities",
    exportRes.status === 200 &&
      exportRes.body?.data?.client?.id === lgpdClient?.id &&
      Array.isArray(exportRes.body?.data?.opportunities),
    exportRes.body
  );

  // Achado A3 da auditoria de 30 ago 2026: anonymizeClient confiava só no
  // julgamento de quem clicou -- nada impedia anonimizar um cliente com
  // fatura não paga em aberto. Project/Invoice criados direto via Prisma
  // (não existe POST /projects sem passar pela conversão de Opportunity
  // ganha) -- mesmo precedente já usado acima pra fixtures de teste.
  const clienteComFaturaAbertaRes = await api("/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: "Cliente com fatura aberta (teste retenção LGPD)" }),
  });
  const clienteComFaturaAbertaId = clienteComFaturaAbertaRes.body?.data?.id;
  const projetoParaFaturaAberta = await prisma.project.create({
    data: {
      accountId,
      clientId: clienteComFaturaAbertaId,
      name: "Projeto teste retenção LGPD",
      status: "ativo",
      feeModel: "hora_tecnica",
    },
  });
  const faturaAbertaParaTeste = await prisma.invoice.create({
    data: { projectId: projetoParaFaturaAberta.id, amount: 500, status: "pendente" },
  });
  const anonymizeComFaturaAbertaRes = await api(`/v1/clients/${clienteComFaturaAbertaId}/anonymize`, {
    method: "POST",
  });
  report(
    "POST /clients/:id/anonymize com fatura não paga em aberto → 422 CLIENT_HAS_OPEN_INVOICE (achado A3)",
    anonymizeComFaturaAbertaRes.status === 422 &&
      anonymizeComFaturaAbertaRes.body?.error?.code === "CLIENT_HAS_OPEN_INVOICE",
    anonymizeComFaturaAbertaRes.body
  );
  await prisma.invoice.delete({ where: { id: faturaAbertaParaTeste.id } });
  await prisma.project.delete({ where: { id: projetoParaFaturaAberta.id } });
  await api(`/v1/clients/${clienteComFaturaAbertaId}`, { method: "DELETE" });

  const anonymizeRes = await api(`/v1/clients/${lgpdClient?.id}/anonymize`, { method: "POST" });
  report(
    "POST /clients/:id/anonymize → 200, PII zerada e anonymizedAt setado",
    anonymizeRes.status === 200 &&
      anonymizeRes.body?.data?.email === null &&
      anonymizeRes.body?.data?.phone === null &&
      anonymizeRes.body?.data?.document === null &&
      !!anonymizeRes.body?.data?.anonymizedAt,
    anonymizeRes.body
  );

  const anonymizeAgainRes = await api(`/v1/clients/${lgpdClient?.id}/anonymize`, { method: "POST" });
  report(
    "Anonimizar de novo → 422 CLIENT_ALREADY_ANONYMIZED (não repete a operação)",
    anonymizeAgainRes.status === 422 && anonymizeAgainRes.body?.error?.code === "CLIENT_ALREADY_ANONYMIZED",
    anonymizeAgainRes.body
  );

  const lgpdAuditRes = await api(`/v1/audit-log?entityType=Client&entityId=${lgpdClient?.id}`);
  const lgpdAuditEntries = lgpdAuditRes.body?.data?.entries ?? [];
  const auditJson = JSON.stringify(lgpdAuditEntries);
  report(
    "AuditLog do Client anonimizado não contém mais o telefone/documento reais em texto puro",
    !auditJson.includes("11988887777") && !auditJson.includes("12345678900") && !auditJson.includes(lgpdLeadEmail),
    lgpdAuditEntries
  );
  report(
    "...mas o histórico de mudança continua existindo (redigido, não apagado)",
    lgpdAuditEntries.some((e: any) => e.changes?.phone?.to === "[REDIGIDO]"),
    lgpdAuditEntries
  );

  // Cleanup inline -- depois de anonimizado, email vira null e name vira
  // "Cliente anonimizado (...)", então nem o e-mail único gerado acima
  // nem nenhum padrão de nome fixo em cleanup-smoke-residue.ts acham este
  // cliente depois. Precisa apagar a Opportunity antes (FK RESTRICT em
  // Opportunity.clientId, mesmo comportamento já testado em "DELETE
  // /clients/:id com oportunidade vinculada → 409").
  const lgpdOppsRes = await api("/v1/opportunities");
  const lgpdOpps = lgpdOppsRes.body?.data?.filter((o: any) => o.clientId === lgpdClient?.id) ?? [];
  for (const opp of lgpdOpps) {
    await api(`/v1/opportunities/${opp.id}`, { method: "DELETE" });
  }
  await api(`/v1/clients/${lgpdClient?.id}`, { method: "DELETE" });
}
