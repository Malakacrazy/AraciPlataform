"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createAllocation(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const hoursPerWeekRaw = String(formData.get("hoursPerWeek") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  if (!userId || !projectId || !hoursPerWeekRaw || !startDate || !endDate) {
    throw new Error("Colaborador, projeto, horas/semana e as duas datas são obrigatórios.");
  }

  const res = await apiFetch("allocations", {
    method: "POST",
    body: JSON.stringify({
      userId,
      projectId,
      hoursPerWeek: Number(hoursPerWeekRaw),
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível criar a alocação.");
  }
  revalidatePath("/team/planning");
}

export async function deleteAllocation(id: string) {
  const res = await apiFetch(`allocations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover a alocação.");
  }
  revalidatePath("/team/planning");
}
