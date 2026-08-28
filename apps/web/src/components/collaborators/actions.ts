"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

// Lacuna da matriz ("colaboração com consultores externos") -- convidar/
// revogar é @AdminOnly() do lado da API (ver ProjectCollaboratorsController),
// então um staff comum vendo esta tela recebe 403 do backend, não algo
// que a UI precisa esconder por conta própria.
export async function inviteCollaborator(projectId: string, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!email || !name) {
    throw new Error("Nome e e-mail são obrigatórios.");
  }
  const res = await apiFetch(`projects/${projectId}/collaborators`, {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível convidar o consultor.");
  }
  revalidatePath(`/projects/${projectId}`);
}

export async function revokeCollaborator(projectId: string, collaboratorId: string) {
  const res = await apiFetch(`projects/${projectId}/collaborators/${collaboratorId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível revogar o acesso.");
  }
  revalidatePath(`/projects/${projectId}`);
}
