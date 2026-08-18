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
