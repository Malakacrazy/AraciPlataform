"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

async function call(path: string, init: RequestInit, projectId: string) {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível completar a ação.");
  }
  revalidatePath(`/projects/${projectId}/ffe`);
}

export async function createMoodboard(projectId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Nome da prancha é obrigatório.");
  }
  await call(`projects/${projectId}/moodboards`, { method: "POST", body: JSON.stringify({ name }) }, projectId);
}

export async function deleteMoodboard(projectId: string, moodboardId: string) {
  await call(`moodboards/${moodboardId}`, { method: "DELETE" }, projectId);
}

export async function addMoodboardItem(projectId: string, moodboardId: string, formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    throw new Error("Selecione um produto.");
  }
  await call(
    `moodboards/${moodboardId}/items`,
    { method: "POST", body: JSON.stringify({ kind: "product", productId }) },
    projectId,
  );
}

export async function addSwatchItem(projectId: string, moodboardId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const colorHex = String(formData.get("colorHex") ?? "").trim();
  if (!label || !colorHex) {
    throw new Error("Nome e cor da amostra são obrigatórios.");
  }
  await call(
    `moodboards/${moodboardId}/items`,
    { method: "POST", body: JSON.stringify({ kind: "swatch", label, colorHex }) },
    projectId,
  );
}

export async function removeMoodboardItem(projectId: string, itemId: string) {
  await call(`moodboard-items/${itemId}`, { method: "DELETE" }, projectId);
}

// Chamada direto de um handler de arrastar/redimensionar num componente
// client (não de um <form action>) -- por isso recebe um objeto, não
// FormData. O canvas já reflete a posição nova otimisticamente; isto só
// persiste no fim do gesto (pointerup), não a cada pixel de movimento.
export async function updateMoodboardItemLayout(
  projectId: string,
  itemId: string,
  layout: { x?: number; y?: number; width?: number; bringToFront?: boolean },
) {
  await call(`moodboard-items/${itemId}`, { method: "PATCH", body: JSON.stringify(layout) }, projectId);
}

export async function regeneratePresentationLink(projectId: string) {
  await call(`projects/${projectId}/presentation-link`, { method: "POST" }, projectId);
}

export async function revokePresentationLink(projectId: string) {
  await call(`projects/${projectId}/presentation-link`, { method: "DELETE" }, projectId);
}
