"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

async function call(path: string, init: RequestInit, projectId: string) {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível completar a ação.");
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

export async function approveGate(projectId: string, phaseId: string, formData: FormData) {
  const approvalChannel = String(formData.get("approvalChannel") ?? "");
  if (!approvalChannel) {
    throw new Error("Selecione o canal de aprovação.");
  }
  await call(
    `projects/${projectId}/phases/${phaseId}/approve`,
    { method: "POST", body: JSON.stringify({ approvalChannel }) },
    projectId,
  );
}

export async function createInvoice(projectId: string, phaseId: string, formData: FormData) {
  const amount = String(formData.get("amount") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  if (!amount) {
    throw new Error("Informe o valor da fatura.");
  }
  await call(
    `projects/${projectId}/phases/${phaseId}/invoice`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: Number(amount),
        // dueDate é opcional na API, mas obrigatória pra cobrar via Asaas
        // (ver billing/billing.service.ts) -- sem isso aqui, toda fatura
        // criada pela tela nasceria impossível de cobrar.
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
    },
    projectId,
  );
}

// Dispara a criação da cobrança (Boleto + Pix) na Asaas pra esta fatura
// -- ver billing/billing.service.ts#chargeInvoice. Preferimos deixar o
// erro (ex.: ASAAS_NOT_CONFIGURED, sem data de vencimento) subir como
// está, mesmo padrão das outras ações desta tela.
export async function chargeInvoice(projectId: string, invoiceId: string) {
  await call(`invoices/${invoiceId}/charge`, { method: "POST" }, projectId);
}

export async function markInvoiceIssued(projectId: string, invoiceId: string, formData: FormData) {
  const nfseNumber = String(formData.get("nfseNumber") ?? "").trim();
  await call(
    `invoices/${invoiceId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "emitida", nfseNumber: nfseNumber || undefined, issuedAt: new Date().toISOString() }),
    },
    projectId,
  );
}

export async function addMember(projectId: string, formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const roleOnProject = String(formData.get("roleOnProject") ?? "").trim();
  if (!userId) {
    throw new Error("Selecione um colaborador.");
  }
  await call(
    `projects/${projectId}/members`,
    { method: "POST", body: JSON.stringify({ userId, roleOnProject: roleOnProject || undefined }) },
    projectId,
  );
}

export async function removeMember(projectId: string, userId: string) {
  await call(`projects/${projectId}/members/${userId}`, { method: "DELETE" }, projectId);
}

export async function updatePhaseDates(projectId: string, phaseId: string, formData: FormData) {
  const startDate = String(formData.get("startDate") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const budget = String(formData.get("budget") ?? "").trim();

  await call(
    `projects/${projectId}/phases/${phaseId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        budget: budget ? Number(budget) : undefined,
      }),
    },
    projectId,
  );
}
