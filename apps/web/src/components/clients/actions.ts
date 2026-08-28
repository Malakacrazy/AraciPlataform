"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createClient(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Nome é obrigatório.");
  }

  const input = {
    name,
    document: emptyToUndefined(formData.get("document")),
    email: emptyToUndefined(formData.get("email")),
    phone: emptyToUndefined(formData.get("phone")),
    source: emptyToUndefined(formData.get("source")),
  };

  const res = await apiFetch("clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível criar o cliente.");
  }
  revalidatePath("/clients");
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str === "" ? undefined : str;
}

// Lacuna da matriz (LGPD, "anonimização preservando o registro fiscal,
// em vez de exclusão física") -- não é DELETE, ver ClientsService.anonymizeClient.
export async function anonymizeClient(id: string) {
  const res = await apiFetch(`clients/${id}/anonymize`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível anonimizar o cliente.");
  }
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}
