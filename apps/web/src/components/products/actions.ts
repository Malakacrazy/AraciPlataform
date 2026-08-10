"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str === "" ? undefined : str;
}

export async function createProduct(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Nome é obrigatório.");
  }
  const isGeneric = formData.get("isGeneric") === "on";
  const priceRaw = emptyToUndefined(formData.get("price"));
  const leadTimeRaw = emptyToUndefined(formData.get("leadTimeDays"));

  const res = await apiFetch("products", {
    method: "POST",
    body: JSON.stringify({
      name,
      supplier: emptyToUndefined(formData.get("supplier")),
      price: priceRaw ? Number(priceRaw) : undefined,
      dimensions: emptyToUndefined(formData.get("dimensions")),
      finish: emptyToUndefined(formData.get("finish")),
      leadTimeDays: leadTimeRaw ? Number(leadTimeRaw) : undefined,
      isGeneric,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível criar o produto.");
  }
  revalidatePath("/products");
}

export async function deleteProduct(id: string) {
  const res = await apiFetch(`products/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover o produto.");
  }
  revalidatePath("/products");
}
