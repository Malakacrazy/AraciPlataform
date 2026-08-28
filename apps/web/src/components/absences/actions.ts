"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createAbsence(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const type = String(formData.get("type") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  if (!userId || !startDate || !endDate) {
    throw new Error("Colaborador e as duas datas são obrigatórios.");
  }

  const res = await apiFetch("absences", {
    method: "POST",
    body: JSON.stringify({
      userId,
      type: type || undefined,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível registrar a ausência.");
  }
  revalidatePath("/team/planning");
}

export async function deleteAbsence(id: string) {
  const res = await apiFetch(`absences/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover a ausência.");
  }
  revalidatePath("/team/planning");
}
