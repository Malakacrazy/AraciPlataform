"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createTimeEntry(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const phaseId = String(formData.get("phaseId") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const hours = String(formData.get("hours") ?? "").trim();
  const activityType = String(formData.get("activityType") ?? "");
  const billable = formData.get("billable") === "on";

  if (!projectId || !date || !hours || !activityType) {
    throw new Error("Projeto, data, horas e tipo de atividade são obrigatórios.");
  }

  const res = await apiFetch("time-entries", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      phaseId: phaseId || undefined,
      date: new Date(date).toISOString(),
      hours: Number(hours),
      billable,
      activityType,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível lançar as horas.");
  }
  revalidatePath("/timesheet");
}

export async function approveTimeEntry(id: string) {
  const res = await apiFetch(`time-entries/${id}/approve`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível aprovar o lançamento.");
  }
  revalidatePath("/timesheet");
}
