"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function upsertRoleRate(formData: FormData) {
  const role = String(formData.get("role") ?? "").trim();
  const hourlyRateRaw = String(formData.get("hourlyRate") ?? "").trim();
  if (!role || !hourlyRateRaw) {
    throw new Error("Papel e tarifa/hora são obrigatórios.");
  }

  const res = await apiFetch("role-rates", {
    method: "POST",
    body: JSON.stringify({ role, hourlyRate: Number(hourlyRateRaw) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível salvar a tarifa.");
  }
  revalidatePath("/role-rates");
}

export async function deleteRoleRate(id: string) {
  const res = await apiFetch(`role-rates/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover a tarifa.");
  }
  revalidatePath("/role-rates");
}
