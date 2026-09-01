"use client";

import { useState } from "react";
import type { OfficeLinkProvider } from "@/lib/types";
import { createOfficeLink } from "./actions";
import {
  CALENDAR_SCOPE,
  getGoogleAccessToken,
  listUpcomingCalendarEvents,
  createCalendarEvent,
  type CalendarEventSummary,
} from "@/lib/google-client";

// Extraído de office-links-section.tsx numa revisão de qualidade de
// código -- ver drive-link-actions.tsx pro contexto completo da divisão.
type EntityType = "PROJECT" | "CLIENT";

interface Props {
  entityType: EntityType;
  entityId: string;
  userEmail?: string | null;
  onError: (message: string | null) => void;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CalendarLinkActions({ entityType, entityId, userEmail, onError }: Props) {
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[] | null>(null);

  const [showEventForm, setShowEventForm] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [eventEnd, setEventEnd] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [eventDescription, setEventDescription] = useState("");

  async function createLink(provider: OfficeLinkProvider, picked: { externalId: string; url: string; title: string }) {
    await createOfficeLink(entityType, entityId, { provider, ...picked });
  }

  async function handleOpenCalendarList() {
    onError(null);
    setIsLoadingEvents(true);
    try {
      const token = await getGoogleAccessToken(CALENDAR_SCOPE, userEmail ?? undefined);
      setCalendarEvents(await listUpcomingCalendarEvents(token));
    } catch (err) {
      onError(errorMessage(err, "Falha ao listar eventos do Calendar."));
    } finally {
      setIsLoadingEvents(false);
    }
  }

  async function handlePickEvent(event: CalendarEventSummary) {
    onError(null);
    try {
      await createLink("CALENDAR", event);
      setCalendarEvents(null);
    } catch (err) {
      onError(errorMessage(err, "Falha ao vincular evento do Calendar."));
    }
  }

  // Diferente de handlePickEvent acima: aqui o evento ainda não existe,
  // é criado de verdade (events.insert) antes de virar um OfficeLink.
  async function handleCreateEvent() {
    onError(null);
    setIsCreatingEvent(true);
    try {
      const token = await getGoogleAccessToken(CALENDAR_SCOPE, userEmail ?? undefined);
      const created = await createCalendarEvent(token, {
        title: eventTitle,
        description: eventDescription || undefined,
        startIso: eventStart,
        endIso: eventEnd,
      });
      await createLink("CALENDAR", created);
      setShowEventForm(false);
      setEventTitle("");
      setEventDescription("");
    } catch (err) {
      onError(errorMessage(err, "Falha ao criar evento no Calendar."));
    } finally {
      setIsCreatingEvent(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpenCalendarList}
        disabled={isLoadingEvents}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
      >
        {isLoadingEvents ? "Carregando eventos…" : "Vincular do Calendar"}
      </button>
      <button
        type="button"
        onClick={() => setShowEventForm((v) => !v)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
      >
        Criar evento
      </button>

      {showEventForm && (
        <div className="mt-3 flex w-full flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <input
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder="Título do evento"
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              Início
              <input
                type="datetime-local"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              Fim
              <input
                type="datetime-local"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
                className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>
          </div>
          <textarea
            value={eventDescription}
            onChange={(e) => setEventDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreateEvent}
              disabled={isCreatingEvent || !eventTitle.trim()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {isCreatingEvent ? "Criando…" : "Criar e vincular"}
            </button>
            <button
              type="button"
              onClick={() => setShowEventForm(false)}
              className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {calendarEvents !== null && (
        <div className="mt-3 w-full rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
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
    </>
  );
}
