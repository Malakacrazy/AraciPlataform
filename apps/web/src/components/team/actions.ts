"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function updateUser(userId: string, formData: FormData) {
  const role = String(formData.get("role") ?? "").trim();
  const specialty = String(formData.get("specialty") ?? "").trim();
  const costPerHourRaw = String(formData.get("costPerHour") ?? "").trim();
  const weeklyCapacityHoursRaw = String(formData.get("weeklyCapacityHours") ?? "").trim();
  // Ausente quando quem está vendo não é admin (campo nem existe no
  // form) ou quando é o próprio select desabilitado da própria linha
  // (não dá pra se autorrebaixar/promover) -- ambos os casos devem só
  // não mudar nada, não virar erro.
  const accessLevel = String(formData.get("accessLevel") ?? "").trim();

  const input: Record<string, unknown> = {};
  if (role) input.role = role;
  if (specialty) input.specialty = specialty;
  if (costPerHourRaw) input.costPerHour = Number(costPerHourRaw);
  if (weeklyCapacityHoursRaw) input.weeklyCapacityHours = Number(weeklyCapacityHoursRaw);
  if (accessLevel) input.accessLevel = accessLevel;

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

// Devolve a chave em texto puro -- só existe nesta resposta, o backend só
// guarda o hash (ver apps/api/src/erp/users.service.ts#generateApiKey).
// Usada pela extensão Captura para autenticar POST /v1/products direto do
// navegador do colaborador, sem depender da sessão web.
export async function generateApiKey(userId: string): Promise<string> {
  const res = await apiFetch(`users/${userId}/api-key`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível gerar a chave de API.");
  }
  const body = await res.json();
  revalidatePath("/team");
  return body.data.apiKey as string;
}

export async function revokeApiKey(userId: string): Promise<void> {
  const res = await apiFetch(`users/${userId}/api-key`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover a chave de API.");
  }
  revalidatePath("/team");
}
