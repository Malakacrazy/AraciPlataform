"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NotificationsResponse } from "@/lib/types";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "./actions";

const POLL_INTERVAL_MS = 30_000;

// Contraparte visual do e-mail que NotificationsService já manda via Resend
// -- pra quem não está de olho na caixa de entrada. Sem infra de
// tempo-real (websocket/SSE): poll simples a cada 30s, mesmo espírito de
// "menor coisa que resolve" já usado em todo o resto do app (nenhuma outra
// tela daqui tem atualização ao vivo).
export function NotificationBell({ initial }: { initial: NotificationsResponse }) {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        setData(await getNotifications());
      } catch {
        // Falha de poll não é erro visível -- tenta de novo no próximo ciclo.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleNotificationClick(id: string) {
    setData((prev) => ({
      unreadCount: Math.max(0, prev.unreadCount - (prev.notifications.find((n) => n.id === id)?.readAt ? 0 : 1)),
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    }));
    markNotificationRead(id).catch(() => {});
  }

  async function handleMarkAllRead() {
    setData((prev) => ({
      unreadCount: 0,
      notifications: prev.notifications.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    }));
    try {
      await markAllNotificationsRead();
    } catch {
      // Já refletido localmente; próximo poll corrige se o servidor discordar.
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        aria-label="Notificações"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M10 2a5 5 0 0 0-5 5v2.586l-1.707 1.707A1 1 0 0 0 4 13h12a1 1 0 0 0 .707-1.707L15 9.586V7a5 5 0 0 0-5-5Z" />
          <path d="M8.05 16a1.95 1.95 0 0 0 3.9 0h-3.9Z" />
        </svg>
        {data.unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {data.unreadCount > 9 ? "9+" : data.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Notificações</span>
            {data.unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          {data.notifications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma notificação ainda.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {data.notifications.map((n) => {
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{n.title}</span>
                      {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                    </div>
                    {n.body && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{n.body}</p>}
                    <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-500">
                      {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </>
                );
                const href = n.projectId
                  ? `/projects/${n.projectId}`
                  : n.opportunityId
                    ? `/opportunities/${n.opportunityId}`
                    : n.clientId
                      ? `/clients/${n.clientId}`
                      : null;
                return (
                  <li key={n.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => {
                          setOpen(false);
                          handleNotificationClick(n.id);
                        }}
                        className="block px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n.id)}
                        className="block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
