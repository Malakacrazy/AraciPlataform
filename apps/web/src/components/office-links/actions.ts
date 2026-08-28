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

// Lacuna da matriz (gestão documental por projeto, "taxonomia") --
// documentType/phaseId aceitam "" pra limpar o campo (ver
// officeLinkUpdateSchema, .nullable()); omitir a chave em vez disso não
// mexe no valor atual.
export interface UpdateOfficeLinkInput {
  documentType?: string | null;
  phaseId?: string | null;
  visibleToClient?: boolean;
}

export async function updateOfficeLink(
  id: string,
  entityType: EntityType,
  entityId: string,
  input: UpdateOfficeLinkInput,
) {
  const res = await apiFetch(`office-links/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível atualizar o vínculo.");
  }
  revalidatePath(ownerPath(entityType, entityId));
}

// Lacuna da matriz (gestão documental por projeto, "árvore de pastas") --
// ver GoogleDriveService.ensureProjectFolderTree (idempotente: clicar de
// novo só cria o que falta).
export async function provisionDriveFolders(projectId: string) {
  const res = await apiFetch(`projects/${projectId}/drive-folders`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível provisionar as pastas no Drive.");
  }
  revalidatePath(`/projects/${projectId}`);
}

// Lacuna da matriz (gestão documental por projeto, "vínculos quebrados")
// -- escopo é a CONTA inteira (uma credencial verifica tudo, ver
// GoogleDriveService.checkBrokenLinksForAccount), não só este projeto;
// revalidar só a página atual é suficiente pra refletir o resultado de
// quem clicou.
export async function checkBrokenLinks(entityType: EntityType, entityId: string) {
  const res = await apiFetch(`office-links/check-broken-links`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível verificar os vínculos.");
  }
  revalidatePath(ownerPath(entityType, entityId));
}
