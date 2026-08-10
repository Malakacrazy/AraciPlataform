"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function updateUser(userId: string, formData: FormData) {
  const role = String(formData.get("role") ?? "").trim();
  const specialty = String(formData.get("specialty") ?? "").trim();
  const costPerHourRaw = String(formData.get("costPerHour") ?? "").trim();

  const input: Record<string, unknown> = {};
  if (role) input.role = role;
  if (specialty) input.specialty = specialty;
  if (costPerHourRaw) input.costPerHour = Number(costPerHourRaw);

  const res = await apiFetch(`users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível atualizar o colaborador.");
  }
  revalidatePath("/team");
}
