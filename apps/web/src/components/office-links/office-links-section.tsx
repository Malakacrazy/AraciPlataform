"use client";

import { useState } from "react";
import type { OfficeLink, OfficeLinkProvider } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/pep-stages";
import { createOfficeLink, deleteOfficeLink, updateOfficeLink, provisionDriveFolders, checkBrokenLinks } from "./actions";
import {
  DRIVE_SCOPE,
  CALENDAR_SCOPE,
  GMAIL_SCOPE,
  GMAIL_SEND_SCOPE,
  getGoogleAccessToken,
  openDrivePicker,
  listUpcomingCalendarEvents,
  createCalendarEvent,
  listRecentGmailMessages,
  sendGmailMessage,
  type CalendarEventSummary,
  type GmailMessageSummary,
} from "@/lib/google-client";

type EntityType = "PROJECT" | "CLIENT";

interface Props {
  entityType: EntityType;
  entityId: string;
  links: OfficeLink[];
  userEmail?: string | null;
  // E-mail do cliente deste projeto (ou do próprio cliente, quando
  // entityType é CLIENT) -- só pra pré-preencher o "Para" do formulário
  // de compor e-mail. Sem isso o campo nasce vazio, nada quebra.
  contactEmail?: string | null;
  // Só vem preenchido quando entityType é PROJECT -- Client não tem fase
  // do PEP, então nem o botão de provisionar pastas nem o seletor de fase
  // na taxonomia aparecem sem isso.
  phases?: { id: string; stage: string }[];
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OfficeLinksSection({ entityType, entityId, links, userEmail, contactEmail, phases }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isLinkingDrive, setIsLinkingDrive] = useState(false);
  const [isProvisioningFolders, setIsProvisioningFolders] = useState(false);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[] | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[] | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [showComposeForm, setShowComposeForm] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composeTo, setComposeTo] = useState(contactEmail ?? "");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const [showEventForm, setShowEventForm] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [eventEnd, setEventEnd] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [eventDescription, setEventDescription] = useState("");

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

  async function handleOpenGmailList() {
    setError(null);
    setIsLoadingMessages(true);
    try {
      const token = await getGoogleAccessToken(GMAIL_SCOPE, userEmail ?? undefined);
      setGmailMessages(await listRecentGmailMessages(token));
    } catch (err) {
      setError(errorMessage(err, "Falha ao listar mensagens do Gmail."));
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handlePickMessage(message: GmailMessageSummary) {
    setError(null);
    try {
      await createLink("GMAIL", message);
      setGmailMessages(null);
    } catch (err) {
      setError(errorMessage(err, "Falha ao vincular mensagem do Gmail."));
    }
  }

  // Diferente de handlePickMessage acima: aqui a mensagem ainda não
  // existe, é enviada de verdade (users.messages.send) antes de virar um
  // OfficeLink -- por isso o escopo é GMAIL_SEND_SCOPE, não GMAIL_SCOPE.
  async function handleSendCompose() {
    setError(null);
    setIsSending(true);
    try {
      const token = await getGoogleAccessToken(GMAIL_SEND_SCOPE, userEmail ?? undefined);
      const sent = await sendGmailMessage(token, { to: composeTo, subject: composeSubject, body: composeBody });
      await createLink("GMAIL", sent);
      setShowComposeForm(false);
      setComposeSubject("");
      setComposeBody("");
    } catch (err) {
      setError(errorMessage(err, "Falha ao enviar e-mail pelo Gmail."));
    } finally {
      setIsSending(false);
    }
  }

  // Diferente de handlePickEvent acima: aqui o evento ainda não existe,
  // é criado de verdade (events.insert) antes de virar um OfficeLink.
  async function handleCreateEvent() {
    setError(null);
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
      setError(errorMessage(err, "Falha ao criar evento no Calendar."));
    } finally {
      setIsCreatingEvent(false);
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

  // Lacuna da matriz (gestão documental por projeto, "árvore de pastas")
  // -- só existe pra PROJECT (Client não tem fase do PEP nenhuma).
  async function handleProvisionFolders() {
    setError(null);
    setIsProvisioningFolders(true);
    try {
      await provisionDriveFolders(entityId);
    } catch (err) {
      setError(errorMessage(err, "Falha ao provisionar pastas no Drive."));
    } finally {
      setIsProvisioningFolders(false);
    }
  }

  // Lacuna da matriz (gestão documental por projeto, "vínculos
  // quebrados") -- verifica a CONTA inteira (ver comentário em
  // checkBrokenLinks), não só este projeto/cliente.
  async function handleCheckLinks() {
    setError(null);
    setIsCheckingLinks(true);
    try {
      await checkBrokenLinks(entityType, entityId);
    } catch (err) {
      setError(errorMessage(err, "Falha ao verificar vínculos."));
    } finally {
      setIsCheckingLinks(false);
    }
  }

  async function handleSaveEdit(id: string, formData: FormData) {
    setError(null);
    setIsSavingEdit(true);
    try {
      const documentType = String(formData.get("documentType") ?? "").trim();
      const phaseId = String(formData.get("phaseId") ?? "").trim();
      await updateOfficeLink(id, entityType, entityId, {
        documentType: documentType || null,
        phaseId: phaseId || null,
        visibleToClient: formData.get("visibleToClient") === "on",
      });
      setEditingId(null);
    } catch (err) {
      setError(errorMessage(err, "Falha ao salvar a taxonomia do vínculo."));
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Office (Drive/Calendar/Gmail)</h2>

      {links.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum vínculo ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.id} className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  <span className="mr-2 text-xs uppercase text-zinc-500 dark:text-zinc-400">{link.provider}</span>
                  {link.title}
                </a>
                <div className="flex shrink-0 items-center gap-2">
                  {link.brokenAt && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                      quebrado
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingId((v) => (v === link.id ? null : link.id))}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    {editingId === link.id ? "Fechar" : "Classificar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(link.id)}
                    disabled={pendingDeleteId === link.id}
                    className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50 dark:text-zinc-400"
                  >
                    {pendingDeleteId === link.id ? "Removendo…" : "Remover"}
                  </button>
                </div>
              </div>
              {(link.documentType || link.phaseId) && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {link.documentType}
                  {link.documentType && link.phaseId && " · "}
                  {link.phaseId && (STAGE_LABELS[phases?.find((p) => p.id === link.phaseId)?.stage ?? ""] ?? "fase removida")}
                  {link.visibleToClient && " · visível ao cliente"}
                </p>
              )}
              {editingId === link.id && (
                <form
                  action={(formData) => handleSaveEdit(link.id, formData)}
                  className="mt-2 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-900"
                >
                  <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Tipo de documento
                    <input
                      name="documentType"
                      defaultValue={link.documentType ?? ""}
                      placeholder="contrato, ART, memorial…"
                      className="w-40 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                    />
                  </label>
                  {phases && phases.length > 0 && (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Fase do PEP
                      <select
                        name="phaseId"
                        defaultValue={link.phaseId ?? ""}
                        className="w-44 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                      >
                        <option value="">— nenhuma —</option>
                        {phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {STAGE_LABELS[phase.stage] ?? phase.stage}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <input type="checkbox" name="visibleToClient" defaultChecked={link.visibleToClient} />
                    Visível ao cliente
                  </label>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                  >
                    {isSavingEdit ? "Salvando…" : "Salvar"}
                  </button>
                </form>
              )}
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
        {phases && (
          <button
            type="button"
            onClick={handleProvisionFolders}
            disabled={isProvisioningFolders}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            {isProvisioningFolders ? "Provisionando…" : "Provisionar pastas no Drive"}
          </button>
        )}
        <button
          type="button"
          onClick={handleCheckLinks}
          disabled={isCheckingLinks}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          {isCheckingLinks ? "Verificando…" : "Verificar vínculos"}
        </button>
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
          onClick={handleOpenGmailList}
          disabled={isLoadingMessages}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          {isLoadingMessages ? "Carregando mensagens…" : "Vincular do Gmail"}
        </button>
        <button
          type="button"
          onClick={() => setShowEventForm((v) => !v)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        >
          Criar evento
        </button>
        <button
          type="button"
          onClick={() => setShowComposeForm((v) => !v)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        >
          Compor e-mail
        </button>
      </div>

      {showEventForm && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
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

      {showComposeForm && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <input
            type="email"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
            placeholder="Para"
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <input
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
            placeholder="Assunto"
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <textarea
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            placeholder="Mensagem"
            rows={4}
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSendCompose}
              disabled={isSending || !composeTo.trim() || !composeSubject.trim()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {isSending ? "Enviando…" : "Enviar e vincular"}
            </button>
            <button
              type="button"
              onClick={() => setShowComposeForm(false)}
              className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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

      {gmailMessages !== null && (
        <div className="mt-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          {gmailMessages.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma mensagem encontrada.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {gmailMessages.map((message) => (
                <li key={message.externalId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-zinc-900 dark:text-zinc-50" title={message.snippet}>
                    {message.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePickMessage(message)}
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
            onClick={() => setGmailMessages(null)}
            className="mt-2 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
