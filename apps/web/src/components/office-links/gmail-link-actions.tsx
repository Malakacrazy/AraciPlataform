"use client";

import { useState } from "react";
import type { OfficeLinkProvider } from "@/lib/types";
import { createOfficeLink } from "./actions";
import {
  GMAIL_SCOPE,
  GMAIL_SEND_SCOPE,
  getGoogleAccessToken,
  listRecentGmailMessages,
  sendGmailMessage,
  type GmailMessageSummary,
} from "@/lib/google-client";

// Extraído de office-links-section.tsx numa revisão de qualidade de
// código -- ver drive-link-actions.tsx pro contexto completo da divisão.
type EntityType = "PROJECT" | "CLIENT";

interface Props {
  entityType: EntityType;
  entityId: string;
  userEmail?: string | null;
  // E-mail do cliente deste projeto (ou do próprio cliente, quando
  // entityType é CLIENT) -- só pra pré-preencher o "Para" do formulário
  // de compor e-mail. Sem isso o campo nasce vazio, nada quebra.
  contactEmail?: string | null;
  onError: (message: string | null) => void;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function GmailLinkActions({ entityType, entityId, userEmail, contactEmail, onError }: Props) {
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[] | null>(null);

  const [showComposeForm, setShowComposeForm] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composeTo, setComposeTo] = useState(contactEmail ?? "");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  async function createLink(provider: OfficeLinkProvider, picked: { externalId: string; url: string; title: string }) {
    await createOfficeLink(entityType, entityId, { provider, ...picked });
  }

  async function handleOpenGmailList() {
    onError(null);
    setIsLoadingMessages(true);
    try {
      const token = await getGoogleAccessToken(GMAIL_SCOPE, userEmail ?? undefined);
      setGmailMessages(await listRecentGmailMessages(token));
    } catch (err) {
      onError(errorMessage(err, "Falha ao listar mensagens do Gmail."));
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handlePickMessage(message: GmailMessageSummary) {
    onError(null);
    try {
      await createLink("GMAIL", message);
      setGmailMessages(null);
    } catch (err) {
      onError(errorMessage(err, "Falha ao vincular mensagem do Gmail."));
    }
  }

  // Diferente de handlePickMessage acima: aqui a mensagem ainda não
  // existe, é enviada de verdade (users.messages.send) antes de virar um
  // OfficeLink -- por isso o escopo é GMAIL_SEND_SCOPE, não GMAIL_SCOPE.
  async function handleSendCompose() {
    onError(null);
    setIsSending(true);
    try {
      const token = await getGoogleAccessToken(GMAIL_SEND_SCOPE, userEmail ?? undefined);
      const sent = await sendGmailMessage(token, { to: composeTo, subject: composeSubject, body: composeBody });
      await createLink("GMAIL", sent);
      setShowComposeForm(false);
      setComposeSubject("");
      setComposeBody("");
    } catch (err) {
      onError(errorMessage(err, "Falha ao enviar e-mail pelo Gmail."));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
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
        onClick={() => setShowComposeForm((v) => !v)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
      >
        Compor e-mail
      </button>

      {showComposeForm && (
        <div className="mt-3 flex w-full flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
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

      {gmailMessages !== null && (
        <div className="mt-3 w-full rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
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
    </>
  );
}
