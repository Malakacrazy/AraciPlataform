"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createRequiredDocumentType(formData: FormData) {
  const stage = String(formData.get("stage") ?? "");
  const documentType = String(formData.get("documentType") ?? "").trim();
  if (!stage || !documentType) {
    throw new Error("Estágio e tipo de documento são obrigatórios.");
  }
  const res = await apiFetch("required-document-types", {
    method: "POST",
    body: JSON.stringify({ stage, documentType }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível cadastrar.");
  }
  revalidatePath("/documentos-obrigatorios");
}

export async function deleteRequiredDocumentType(id: string) {
  const res = await apiFetch(`required-document-types/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover.");
  }
  revalidatePath("/documentos-obrigatorios");
}
