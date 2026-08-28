"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

// Nova audiência convidada só pra um quadro específico (ver
// WhiteboardGuestsService) -- @AdminOnly() do lado da API, mesmo
// raciocínio de convidar consultor externo.
export async function inviteWhiteboardGuest(projectId: string, moodboardId: string, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!email || !name) {
    throw new Error("Nome e e-mail são obrigatórios.");
  }
  const res = await apiFetch(`moodboards/${moodboardId}/guests`, {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível convidar.");
  }
  revalidatePath(`/projects/${projectId}/ffe`);
}

export async function revokeWhiteboardGuest(projectId: string, moodboardId: string, guestId: string) {
  const res = await apiFetch(`moodboards/${moodboardId}/guests/${guestId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível revogar o acesso.");
  }
  revalidatePath(`/projects/${projectId}/ffe`);
}
