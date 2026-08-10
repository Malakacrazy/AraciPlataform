"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

async function call(path: string, init: RequestInit, projectId: string) {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível completar a ação.");
  }
  revalidatePath(`/projects/${projectId}/ffe`);
}

export async function createArea(projectId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Nome do ambiente é obrigatório.");
  }
  await call(`projects/${projectId}/areas`, { method: "POST", body: JSON.stringify({ name }) }, projectId);
}

export async function deleteArea(projectId: string, areaId: string) {
  await call(`areas/${areaId}`, { method: "DELETE" }, projectId);
}

export async function createSpecification(projectId: string, areaId: string, formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    throw new Error("Selecione um produto.");
  }
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
  const markupRaw = String(formData.get("markupPercent") ?? "").trim();

  await call(
    `areas/${areaId}/specifications`,
    {
      method: "POST",
      body: JSON.stringify({
        productId,
        quantity: quantityRaw ? Number(quantityRaw) : undefined,
        unitPrice: unitPriceRaw ? Number(unitPriceRaw) : undefined,
        markupPercent: markupRaw ? Number(markupRaw) / 100 : undefined,
      }),
    },
    projectId,
  );
}

export async function deleteSpecification(projectId: string, specId: string) {
  await call(`specifications/${specId}`, { method: "DELETE" }, projectId);
}

export async function checkoutCart(projectId: string, specificationIds: string[]) {
  await call(
    `projects/${projectId}/ffe-checkout`,
    { method: "POST", body: JSON.stringify({ specificationIds }) },
    projectId,
  );
}
