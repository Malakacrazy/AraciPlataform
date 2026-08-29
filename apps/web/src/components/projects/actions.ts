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

// amount fica de fora do body quando vazio (não manda `amount: undefined`
// -- JSON.stringify já omite) -- projeto hora_tecnica não tem esse campo
// na tela (ver cronograma-views.tsx) e a API rejeita se vier preenchido
// pra esse feeModel, calculando o valor a partir de horas aprovadas.
export async function createInvoice(projectId: string, phaseId: string, formData: FormData) {
  const amount = String(formData.get("amount") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  await call(
    `projects/${projectId}/phases/${phaseId}/invoice`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: amount ? Number(amount) : undefined,
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

// Lacuna da matriz (NFS-e dentro do fluxo real) -- ver
// NfseService.emitirParaFatura. Mesmo padrão de chargeInvoice logo acima:
// deixa o erro (ex.: CLIENT_MISSING_DOCUMENT, NFSE_AUTORIZACAO_FAILED)
// subir como está -- o detalhe da rejeição da SEFIN também fica
// persistido em Invoice.nfseRejectionReason, então sobrevive a um
// refresh mesmo que esta chamada específica só mostre a tela de erro.
export async function emitirNfse(projectId: string, invoiceId: string) {
  await call(`invoices/${invoiceId}/nfse`, { method: "POST" }, projectId);
}

// Lacuna da matriz (NFS-e: cancelamento/substituição) -- motivo é um
// código fechado da SEFIN Nacional (1/2/9), lido do <select> como string
// e convertido pra Number antes de mandar (o schema Zod do lado da API
// espera o literal numérico, não a string do form).
export async function cancelarNfse(projectId: string, invoiceId: string, formData: FormData) {
  const motivo = Number(formData.get("motivo"));
  const justificativa = String(formData.get("justificativa") ?? "").trim();
  if (!justificativa) {
    throw new Error("Justificativa é obrigatória para cancelar a NFS-e.");
  }
  await call(
    `invoices/${invoiceId}/nfse/cancelar`,
    { method: "POST", body: JSON.stringify({ motivo, justificativa }) },
    projectId,
  );
}

export async function substituirNfse(projectId: string, invoiceId: string, formData: FormData) {
  const justificativa = String(formData.get("justificativa") ?? "").trim();
  if (!justificativa) {
    throw new Error("Justificativa é obrigatória para substituir a NFS-e.");
  }
  await call(
    `invoices/${invoiceId}/nfse/substituir`,
    { method: "POST", body: JSON.stringify({ justificativa }) },
    projectId,
  );
}

// currentStatus vem da própria tela (não relido aqui) só pra decidir se
// muda o status -- uma fatura que a Asaas já marcou 'paga' via webhook
// (pagamento confirmado antes de alguém emitir a NFS-e) continua 'paga'
// depois de registrar o número; não regride pra 'emitida'.
export async function markInvoiceIssued(
  projectId: string,
  invoiceId: string,
  currentStatus: string,
  formData: FormData,
) {
  const nfseNumber = String(formData.get("nfseNumber") ?? "").trim();
  await call(
    `invoices/${invoiceId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: currentStatus === "paga" ? undefined : "emitida",
        nfseNumber: nfseNumber || undefined,
        issuedAt: new Date().toISOString(),
      }),
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

export async function createTask(projectId: string, phaseId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const dependsOnIds = formData.getAll("dependsOnIds").map(String).filter(Boolean);
  if (!title) {
    throw new Error("Título da tarefa é obrigatório.");
  }
  await call(
    `projects/${projectId}/phases/${phaseId}/tasks`,
    {
      method: "POST",
      body: JSON.stringify({
        title,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        dependsOnIds: dependsOnIds.length > 0 ? dependsOnIds : undefined,
      }),
    },
    projectId,
  );
}

// Ação dedicada, não um PATCH genérico -- a API aplica a regra de
// dependência (não conclui com dependsOn pendente) só nesta rota.
export async function updateTaskStatus(projectId: string, taskId: string, status: string) {
  await call(`tasks/${taskId}/status`, { method: "POST", body: JSON.stringify({ status }) }, projectId);
}

export async function deleteTask(projectId: string, taskId: string) {
  await call(`tasks/${taskId}`, { method: "DELETE" }, projectId);
}
