"use server";

import { apiFetch, apiGet } from "@/lib/api";
import type { NotificationsResponse } from "@/lib/types";

// Chamadas pelo NotificationBell (client component) via useEffect/interval
// -- não por fetch direto no navegador contra o proxy BFF, mesmo padrão já
// usado no resto do app (mutação sempre por server action).
export async function getNotifications(): Promise<NotificationsResponse> {
  return apiGet<NotificationsResponse>("notifications");
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await apiFetch(`notifications/${id}/read`, { method: "PATCH" });
  if (!res.ok) {
    throw new Error("Não foi possível marcar a notificação como lida.");
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await apiFetch("notifications/read-all", { method: "POST" });
  if (!res.ok) {
    throw new Error("Não foi possível marcar as notificações como lidas.");
  }
}
