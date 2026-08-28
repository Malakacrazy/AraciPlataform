"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

async function patchOpportunity(id: string, body: Record<string, unknown>) {
  const res = await apiFetch(`opportunities/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message ?? "Não foi possível atualizar a oportunidade.");
  }
  revalidatePath("/opportunities");
  revalidatePath("/clients", "layout");
}

export async function createOpportunity(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const feeModel = String(formData.get("feeModel") ?? "");
  const estimatedValueRaw = String(formData.get("estimatedValue") ?? "").trim();

  if (!clientId || !title || !feeModel) {
    throw new Error("Cliente, título e modelo de honorário são obrigatórios.");
  }

  const input = {
    clientId,
    title,
    stage: "novo_lead",
    feeModel,
    estimatedValue: estimatedValueRaw === "" ? undefined : Number(estimatedValueRaw),
  };

  const res = await apiFetch("opportunities", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível criar a oportunidade.");
  }
  revalidatePath("/opportunities");
}

export async function updateStage(id: string, stage: string) {
  await patchOpportunity(id, { stage });
}

export async function markWon(id: string) {
  await patchOpportunity(id, { wonAt: new Date().toISOString() });
}

// Endpoint dedicado (não o PATCH genérico) -- a API exige lostReason,
// ver opportunities.service.ts.
export async function markLost(id: string, lostReason: string) {
  const res = await apiFetch(`opportunities/${id}/mark-lost`, {
    method: "POST",
    body: JSON.stringify({ lostReason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível marcar como perdida.");
  }
  revalidatePath("/opportunities");
  revalidatePath("/clients", "layout");
}

// Achado da auditoria: ganho/perdido era irreversível por qualquer API.
export async function reopen(id: string) {
  const res = await apiFetch(`opportunities/${id}/reopen`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível reabrir a oportunidade.");
  }
  revalidatePath("/opportunities");
  revalidatePath("/clients", "layout");
}
