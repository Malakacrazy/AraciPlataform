"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function updateTaxRegime(formData: FormData) {
  const taxRegime = String(formData.get("taxRegime") ?? "");
  if (taxRegime !== "MEI" && taxRegime !== "ME") {
    throw new Error("Regime inválido.");
  }

  const res = await apiFetch("account", {
    method: "PATCH",
    body: JSON.stringify({ taxRegime }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível atualizar o regime tributário.");
  }
  revalidatePath("/financeiro");
}

// Lacuna da matriz (LGPD, "automação de retenção/expurgo") -- string
// vazia limpa o prazo (volta pra null = desligado), mesmo espírito de
// campo opcional que "projectId" já usa em createExpense abaixo.
export async function updateDataRetention(formData: FormData) {
  const raw = String(formData.get("dataRetentionMonths") ?? "").trim();
  const dataRetentionMonths = raw ? Number(raw) : null;
  if (raw && (!Number.isInteger(dataRetentionMonths) || (dataRetentionMonths as number) < 1)) {
    throw new Error("Prazo precisa ser um número inteiro de meses, maior que zero.");
  }

  const res = await apiFetch("account", {
    method: "PATCH",
    body: JSON.stringify({ dataRetentionMonths }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível atualizar o prazo de retenção.");
  }
  revalidatePath("/financeiro");
}

// Lacuna da matriz (NFS-e dentro do fluxo real) -- "producao" é decisão
// explícita de quem administra a conta (ver Account.nfseAmbiente no
// schema para o porquê), não uma env var.
export async function updateNfseAmbiente(formData: FormData) {
  const nfseAmbiente = String(formData.get("nfseAmbiente") ?? "");
  if (nfseAmbiente !== "homologacao" && nfseAmbiente !== "producao") {
    throw new Error("Ambiente inválido.");
  }

  const res = await apiFetch("account", {
    method: "PATCH",
    body: JSON.stringify({ nfseAmbiente }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível atualizar o ambiente da NFS-e.");
  }
  revalidatePath("/financeiro");
}

// Lacuna da matriz (Reforma Tributária/IBS-CBS) -- só disclosure na NFS-e
// (ver Account.cbsIbsEffectiveRatePercent no schema), mas configurável
// aqui pra o estúdio atualizar ano a ano sem depender de deploy. Input em
// pontos percentuais (0,70 = 0,70%), convertido pra fração antes do PATCH
// (mesmo padrão de pricingTaxBurdenPercent).
export async function updateCbsIbsRate(formData: FormData) {
  const raw = String(formData.get("cbsIbsEffectiveRatePercent") ?? "").trim();
  const pontosPercentuais = Number(raw.replace(",", "."));
  if (!raw || !Number.isFinite(pontosPercentuais) || pontosPercentuais < 0 || pontosPercentuais > 50) {
    throw new Error("Alíquota precisa ser um número entre 0 e 50 (pontos percentuais).");
  }

  const res = await apiFetch("account", {
    method: "PATCH",
    body: JSON.stringify({ cbsIbsEffectiveRatePercent: pontosPercentuais / 100 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível atualizar a alíquota de CBS/IBS.");
  }
  revalidatePath("/financeiro");
}

// O resultado (fatorR + anexo recomendado) é persistido pelo backend na
// própria Account -- não precisa devolver nada aqui, revalidar a página
// já mostra o valor atualizado (mesmo padrão de upsertRoleRate).
export async function simulateFatorR(formData: FormData) {
  const folhaPagamento12mRaw = String(formData.get("folhaPagamento12m") ?? "").trim();
  const receitaBruta12mRaw = String(formData.get("receitaBruta12m") ?? "").trim();
  if (!folhaPagamento12mRaw || !receitaBruta12mRaw) {
    throw new Error("Folha de pagamento e receita bruta são obrigatórias.");
  }

  const res = await apiFetch("fiscal/fator-r/simulate", {
    method: "POST",
    body: JSON.stringify({
      folhaPagamento12m: Number(folhaPagamento12mRaw),
      receitaBruta12m: Number(receitaBruta12mRaw),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível simular o Fator R.");
  }
  revalidatePath("/financeiro");
}

export async function createExpense(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  if (!description || !category || !amountRaw) {
    throw new Error("Descrição, categoria e valor são obrigatórios.");
  }

  const res = await apiFetch("expenses", {
    method: "POST",
    body: JSON.stringify({
      description,
      category,
      amount: Number(amountRaw),
      ...(projectId ? { projectId } : {}),
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível registrar a despesa.");
  }
  revalidatePath("/financeiro");
}

export async function markExpensePaid(id: string) {
  const res = await apiFetch(`expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paga", paidAt: new Date().toISOString() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível marcar a despesa como paga.");
  }
  revalidatePath("/financeiro");
}

export async function deleteExpense(id: string) {
  const res = await apiFetch(`expenses/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover a despesa.");
  }
  revalidatePath("/financeiro");
}
