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
  await call(`moodboards/${moodboardId}/items`, { method: "POST", body: JSON.stringify({ productId }) }, projectId);
}

export async function removeMoodboardItem(projectId: string, itemId: string) {
  await call(`moodboard-items/${itemId}`, { method: "DELETE" }, projectId);
}

export async function regeneratePresentationLink(projectId: string) {
  await call(`projects/${projectId}/presentation-link`, { method: "POST" }, projectId);
}

export async function revokePresentationLink(projectId: string) {
  await call(`projects/${projectId}/presentation-link`, { method: "DELETE" }, projectId);
}
