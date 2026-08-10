"use client";

import { useState } from "react";
import type { OfficeLink, OfficeLinkProvider } from "@/lib/types";
import { createOfficeLink, deleteOfficeLink } from "./actions";
import {
  DRIVE_SCOPE,
  CALENDAR_SCOPE,
  getGoogleAccessToken,
  openDrivePicker,
  listUpcomingCalendarEvents,
  type CalendarEventSummary,
} from "@/lib/google-client";

type EntityType = "PROJECT" | "CLIENT";

interface Props {
  entityType: EntityType;
  entityId: string;
  links: OfficeLink[];
  userEmail?: string | null;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function OfficeLinksSection({ entityType, entityId, links, userEmail }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isLinkingDrive, setIsLinkingDrive] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[] | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function createLink(provider: OfficeLinkProvider, picked: { externalId: string; url: string; title: string }) {
    await createOfficeLink(entityType, entityId, { provider, ...picked });
  }

  async function handleLinkDrive() {
    setError(null);
    setIsLinkingDrive(true);
    try {
      const token = await getGoogleAccessToken(DRIVE_SCOPE, userEmail ?? undefined);
      const file = await openDrivePicker(token);
      if (!file) return; // usuário cancelou o Picker
      await createLink("DRIVE", file);
    } catch (err) {
      setError(errorMessage(err, "Falha ao vincular arquivo do Drive."));
    } finally {
      setIsLinkingDrive(false);
    }
  }

  async function handleOpenCalendarList() {
    setError(null);
    setIsLoadingEvents(true);
    try {
      const token = await getGoogleAccessToken(CALENDAR_SCOPE, userEmail ?? undefined);
      setCalendarEvents(await listUpcomingCalendarEvents(token));
    } catch (err) {
      setError(errorMessage(err, "Falha ao listar eventos do Calendar."));
    } finally {
      setIsLoadingEvents(false);
    }
  }

  async function handlePickEvent(event: CalendarEventSummary) {
    setError(null);
    try {
      await createLink("CALENDAR", event);
      setCalendarEvents(null);
    } catch (err) {
      setError(errorMessage(err, "Falha ao vincular evento do Calendar."));
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setPendingDeleteId(id);
    try {
      await deleteOfficeLink(id, entityType, entityId);
    } catch (err) {
      setError(errorMessage(err, "Falha ao remover vínculo."));
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Office (Drive/Calendar)</h2>

      {links.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum vínculo ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-zinc-900 hover:underline dark:text-zinc-50"
              >
                <span className="mr-2 text-xs uppercase text-zinc-500 dark:text-zinc-400">{link.provider}</span>
                {link.title}
              </a>
              <button
                type="button"
                onClick={() => handleDelete(link.id)}
                disabled={pendingDeleteId === link.id}
                className="shrink-0 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50 dark:text-zinc-400"
              >
                {pendingDeleteId === link.id ? "Removendo…" : "Remover"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleLinkDrive}
          disabled={isLinkingDrive}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {isLinkingDrive ? "Abrindo o Drive…" : "Vincular do Drive"}
        </button>
        <button
          type="button"
          onClick={handleOpenCalendarList}
          disabled={isLoadingEvents}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          {isLoadingEvents ? "Carregando eventos…" : "Vincular do Calendar"}
        </button>
      </div>

      {calendarEvents !== null && (
        <div className="mt-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          {calendarEvents.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum evento futuro encontrado.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {calendarEvents.map((event) => (
                <li key={event.externalId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-zinc-900 dark:text-zinc-50">{event.title}</span>
                  <button
                    type="button"
                    onClick={() => handlePickEvent(event)}
                    className="shrink-0 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    Vincular
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setCalendarEvents(null)}
            className="mt-2 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
