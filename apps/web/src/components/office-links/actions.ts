"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { OfficeLinkProvider } from "@/lib/types";

export interface CreateOfficeLinkInput {
  provider: OfficeLinkProvider;
  externalId: string;
  url: string;
  title: string;
}

type EntityType = "PROJECT" | "CLIENT";

function ownerPath(entityType: EntityType, entityId: string) {
  return entityType === "PROJECT" ? `/projects/${entityId}` : `/clients/${entityId}`;
}

export async function createOfficeLink(entityType: EntityType, entityId: string, input: CreateOfficeLinkInput) {
  const res = await apiFetch(`${ownerPath(entityType, entityId).slice(1)}/office-links`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível criar o vínculo.");
  }
  revalidatePath(ownerPath(entityType, entityId));
}

export async function deleteOfficeLink(id: string, entityType: EntityType, entityId: string) {
  const res = await apiFetch(`office-links/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover o vínculo.");
  }
  revalidatePath(ownerPath(entityType, entityId));
}
