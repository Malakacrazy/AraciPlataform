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
      category: emptyToUndefined(formData.get("category")),
      // variantOfId vazio ("— nenhum —") vira undefined -- produto nasce
      // top-level; a API exige variantLabel junto quando variantOfId vem
      // preenchido (ver ProductsService.createProduct).
      variantOfId: emptyToUndefined(formData.get("variantOfId")),
      variantLabel: emptyToUndefined(formData.get("variantLabel")),
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

export async function addProductImage(productId: string, formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    throw new Error("URL da imagem é obrigatória.");
  }
  const res = await apiFetch(`products/${productId}/images`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível adicionar a imagem.");
  }
  revalidatePath(`/products/${productId}/tear-sheet`);
}

export async function removeProductImage(productId: string, imageId: string) {
  const res = await apiFetch(`product-images/${imageId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover a imagem.");
  }
  revalidatePath(`/products/${productId}/tear-sheet`);
}
