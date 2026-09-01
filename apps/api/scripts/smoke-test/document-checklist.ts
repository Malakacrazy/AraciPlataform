import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Checklist de documentos obrigatórios". Reaproveita a thirdPhase
// (ainda não aprovada até este ponto do run) só pra esta checagem --
// nada depois dependia dela continuar "não aprovada", e o projeto
// inteiro é descartado no fim do run mesmo.
export async function runDocumentChecklistChecks({
  api,
  report,
  projectId,
  thirdPhaseId,
  thirdPhaseStage,
}: {
  api: ApiFn;
  report: ReportFn;
  projectId: string;
  thirdPhaseId: string;
  thirdPhaseStage: string;
}) {
  const requiredDocTypeName = "aprovacao-conceito-smoke-test";
  const requiredDocRes = await api("/v1/required-document-types", {
    method: "POST",
    body: JSON.stringify({ stage: thirdPhaseStage, documentType: requiredDocTypeName }),
  });
  report(
    "POST /required-document-types → 201, exige documento pro estágio",
    requiredDocRes.status === 201 && requiredDocRes.body?.data?.documentType === requiredDocTypeName,
    requiredDocRes.body
  );
  const requiredDocId = requiredDocRes.body?.data?.id;

  const requiredDocAgainRes = await api("/v1/required-document-types", {
    method: "POST",
    body: JSON.stringify({ stage: thirdPhaseStage, documentType: requiredDocTypeName }),
  });
  report(
    "Cadastrar de novo o MESMO tipo pro MESMO estágio → 409 (não duplica a exigência)",
    requiredDocAgainRes.status === 409,
    requiredDocAgainRes.body
  );

  const checklistBeforeRes = await api(`/v1/projects/${projectId}/phases/${thirdPhaseId}/document-checklist`);
  report(
    "GET .../document-checklist antes de qualquer vínculo → tipo exigido aparece como não satisfeito",
    checklistBeforeRes.status === 200 &&
      checklistBeforeRes.body?.data?.length === 1 &&
      checklistBeforeRes.body?.data?.[0]?.satisfied === false,
    checklistBeforeRes.body
  );

  const approveWithoutDocRes = await api(`/v1/projects/${projectId}/phases/${thirdPhaseId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "email" }),
  });
  report(
    "Aprovar gate sem o documento obrigatório presente → 422 MISSING_REQUIRED_DOCUMENTS",
    approveWithoutDocRes.status === 422 && approveWithoutDocRes.body?.error?.code === "MISSING_REQUIRED_DOCUMENTS",
    approveWithoutDocRes.body
  );

  const satisfyingLinkRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "DRIVE",
      externalId: "smoke-test-required-doc-file",
      url: "https://drive.google.com/file/d/smoke-test-required-doc-file/view",
      title: "Aprovação do conceito (smoke-test)",
    }),
  });
  const satisfyingLinkId = satisfyingLinkRes.body?.data?.id;
  const classifyLinkRes = await api(`/v1/office-links/${satisfyingLinkId}`, {
    method: "PATCH",
    body: JSON.stringify({ documentType: requiredDocTypeName, phaseId: thirdPhaseId }),
  });
  report(
    "Classificar o vínculo com o tipo exigido, ligado à fase → 200",
    classifyLinkRes.status === 200,
    classifyLinkRes.body
  );
  // lastCheckedAt simulado direto no banco (achado A38 da auditoria de 30
  // ago 2026: getDocumentChecklist agora exige isto, não só brokenAt
  // null) -- mesmo padrão de nfseCanceladaEm/nfseChaveAcesso acima, já
  // que confirmar de verdade contra o Drive exigiria um token real do
  // Picker que este ambiente não tem.
  await prisma.officeLink.update({ where: { id: satisfyingLinkId }, data: { lastCheckedAt: new Date() } });

  const checklistAfterRes = await api(`/v1/projects/${projectId}/phases/${thirdPhaseId}/document-checklist`);
  report(
    "Depois de classificar, checklist mostra o tipo satisfeito",
    checklistAfterRes.body?.data?.[0]?.satisfied === true,
    checklistAfterRes.body
  );

  const approveWithDocRes = await api(`/v1/projects/${projectId}/phases/${thirdPhaseId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalChannel: "email" }),
  });
  report(
    "Aprovar o mesmo gate agora, com o documento presente → 200",
    approveWithDocRes.status === 200 && !!approveWithDocRes.body?.data?.approvedAt,
    approveWithDocRes.body
  );

  // Cleanup inline -- RequiredDocumentType é config da CONTA, não do
  // projeto descartável (cleanup-smoke-residue.ts não sabe limpar isto
  // sozinho); deixar sobreviver mudaria o comportamento real do gate pra
  // qualquer projeto futuro de verdade nesse estágio.
  await api(`/v1/required-document-types/${requiredDocId}`, { method: "DELETE" });
}
