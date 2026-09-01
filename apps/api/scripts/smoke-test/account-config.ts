import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- duas
// seções pequenas e adjacentes, ambas só configuração de /v1/account
// (retenção/expurgo LGPD e ambiente da NFS-e), sem fixture nenhuma além
// de api/report. Cada uma já restaura o valor real do estúdio no fim
// (null / "homologacao") -- não são independentes uma da outra por
// nenhum dado, só compartilham o mesmo recurso.
export async function runDataRetentionConfigChecks({ api, report }: { api: ApiFn; report: ReportFn }) {
  const badRetentionRes = await api("/v1/account", {
    method: "PATCH",
    body: JSON.stringify({ dataRetentionMonths: 0 }),
  });
  report(
    "PATCH /account { dataRetentionMonths: 0 } → 400 VALIDATION_ERROR (mínimo é 1 mês)",
    badRetentionRes.status === 400,
    badRetentionRes.body
  );

  const setRetentionRes = await api("/v1/account", {
    method: "PATCH",
    body: JSON.stringify({ dataRetentionMonths: 24 }),
  });
  report(
    "PATCH /account { dataRetentionMonths: 24 } → 200",
    setRetentionRes.status === 200 && setRetentionRes.body?.data?.dataRetentionMonths === 24,
    setRetentionRes.body
  );

  const clearRetentionRes = await api("/v1/account", {
    method: "PATCH",
    body: JSON.stringify({ dataRetentionMonths: null }),
  });
  report(
    "PATCH /account { dataRetentionMonths: null } → 200 (desliga de novo, valor real do estúdio)",
    clearRetentionRes.status === 200 && clearRetentionRes.body?.data?.dataRetentionMonths === null,
    clearRetentionRes.body
  );
}

export async function runNfseAmbienteConfigChecks({ api, report }: { api: ApiFn; report: ReportFn }) {
  const accountAntesRes = await api("/v1/account");
  const ambienteOriginal = accountAntesRes.body?.data?.nfseAmbiente;
  report(
    "GET /account → nfseAmbiente default é 'homologacao'",
    ambienteOriginal === "homologacao",
    ambienteOriginal
  );

  const setProducaoRes = await api("/v1/account", {
    method: "PATCH",
    body: JSON.stringify({ nfseAmbiente: "producao" }),
  });
  report(
    "PATCH /account { nfseAmbiente: 'producao' } → 200",
    setProducaoRes.status === 200 && setProducaoRes.body?.data?.nfseAmbiente === "producao",
    setProducaoRes.body
  );

  const restoreHomologacaoRes = await api("/v1/account", {
    method: "PATCH",
    body: JSON.stringify({ nfseAmbiente: "homologacao" }),
  });
  report(
    "PATCH /account { nfseAmbiente: 'homologacao' } → 200 (restaura o valor real do estúdio)",
    restoreHomologacaoRes.status === 200 && restoreHomologacaoRes.body?.data?.nfseAmbiente === "homologacao",
    restoreHomologacaoRes.body
  );
}
