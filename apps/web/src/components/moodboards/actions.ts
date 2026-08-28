"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { MoodboardComment } from "@/lib/types";

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

// Sem revalidatePath de propósito, diferente de call() acima -- chamada
// com debounce a cada pausa no desenho (ver CollaborativeBoard); recarregar
// a página inteira a cada poucos segundos enquanto alguém desenha seria
// disruptivo, e o canvas em si já reflete o estado local sem precisar de
// round-trip pro servidor pra se atualizar.
export async function saveMoodboardSnapshot(moodboardId: string, snapshot: unknown) {
  const res = await apiFetch(`moodboards/${moodboardId}/snapshot`, {
    method: "PATCH",
    body: JSON.stringify({ snapshot }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível salvar o quadro.");
  }
}

export async function addMoodboardComment(moodboardId: string, body: string): Promise<MoodboardComment> {
  const res = await apiFetch(`moodboards/${moodboardId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  const resBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(resBody?.error?.message ?? "Não foi possível enviar o comentário.");
  }
  return resBody.data;
}

export async function regeneratePresentationLink(projectId: string) {
  await call(`projects/${projectId}/presentation-link`, { method: "POST" }, projectId);
}

export async function revokePresentationLink(projectId: string) {
  await call(`projects/${projectId}/presentation-link`, { method: "DELETE" }, projectId);
}
