"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

type EntityType = "PROJECT" | "CLIENT" | "OPPORTUNITY";

const ENTITY_PATH: Record<EntityType, string> = {
  PROJECT: "projects",
  CLIENT: "clients",
  OPPORTUNITY: "opportunities",
};

const PAGE_PATH: Record<EntityType, (id: string) => string> = {
  PROJECT: (id) => `/projects/${id}`,
  CLIENT: (id) => `/clients/${id}`,
  OPPORTUNITY: (id) => `/opportunities/${id}`,
};

async function call(path: string, init: RequestInit, entityType: EntityType, entityId: string) {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível completar a ação.");
  }
  revalidatePath(PAGE_PATH[entityType](entityId));
}

export async function addActivity(entityType: EntityType, entityId: string, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    throw new Error("Escreva algo antes de adicionar a nota.");
  }
  await call(
    `${ENTITY_PATH[entityType]}/${entityId}/activities`,
    { method: "POST", body: JSON.stringify({ body }) },
    entityType,
    entityId,
  );
}

export async function deleteActivity(entityType: EntityType, entityId: string, activityId: string) {
  await call(`activities/${activityId}`, { method: "DELETE" }, entityType, entityId);
}
