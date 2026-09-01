"use client";

import { useState } from "react";
import type { OfficeLink, DriveRevision } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/pep-stages";
import { deleteOfficeLink, updateOfficeLink, listOfficeLinkRevisions } from "./actions";
import { DriveLinkActions } from "./drive-link-actions";
import { CalendarLinkActions } from "./calendar-link-actions";
import { GmailLinkActions } from "./gmail-link-actions";

// Achado A43 da auditoria de 30 ago 2026: mesmo com o esquema restrito a
// http(s) na API (officeLinkInputSchema), esta é a segunda camada --
// vínculos gravados antes da correção continuam no banco, e renderizar
// url cru em href sem checagem nenhuma é o defeito incondicional que o
// achado aponta (não depende de bypassar a API pra existir).
function safeHref(url: string): string | undefined {
  return /^https?:\/\//i.test(url) ? url : undefined;
}

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
  // Lacuna da matriz ("checklist de documentos obrigatórios") -- sugestões
  // pro <datalist> do campo de tipo de documento, reduzindo divergência
  // de digitação contra o que RequiredDocumentTypesService espera bater
  // exatamente. Continua sendo texto livre -- isto só ajuda a acertar.
  documentTypeSuggestions?: string[];
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

// null pra Google Doc/Sheet/Slide nativo (sem bytes, ver DriveRevision).
function formatBytes(size: string | null): string {
  if (!size) return "";
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Revisão de qualidade de código: este componente tinha 690 linhas
// misturando Drive/Calendar/Gmail num arquivo só. As três ações de
// "vincular novo item" (uma por provider) foram extraídas pra
// drive-link-actions.tsx/calendar-link-actions.tsx/gmail-link-actions.tsx
// -- cada uma cuida do próprio estado (loading, formulário, lista) e
// reporta erro pra cá via onError, que ainda é onde o banner de erro é
// exibido. O que fica aqui é só o que é sobre a LISTA de vínculos já
// existentes (comum aos três providers) e o painel de versões (só faz
// sentido pra Drive, mas está preso à renderização da lista, não a um
// fluxo de "adicionar novo").
export function OfficeLinksSection({
  entityType,
  entityId,
  links,
  userEmail,
  contactEmail,
  phases,
  documentTypeSuggestions,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Lacuna da matriz (gestão documental por projeto, "versionamento") --
  // revisionsByLinkId dobra como cache (não recarrega ao reabrir o
  // mesmo painel) e como "já tentou carregar" (chave presente, mesmo
  // que a lista venha vazia).
  const [revisionsOpenId, setRevisionsOpenId] = useState<string | null>(null);
  const [revisionsByLinkId, setRevisionsByLinkId] = useState<Record<string, DriveRevision[]>>({});
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);

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

  async function handleToggleRevisions(id: string) {
    if (revisionsOpenId === id) {
      setRevisionsOpenId(null);
      return;
    }
    setRevisionsOpenId(id);
    if (revisionsByLinkId[id]) return; // já carregado, só reabrir o painel
    setError(null);
    setIsLoadingRevisions(true);
    try {
      const revisions = await listOfficeLinkRevisions(id);
      setRevisionsByLinkId((prev) => ({ ...prev, [id]: revisions }));
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar as versões."));
      setRevisionsOpenId(null);
    } finally {
      setIsLoadingRevisions(false);
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
      {documentTypeSuggestions && documentTypeSuggestions.length > 0 && (
        <datalist id="document-type-suggestions">
          {documentTypeSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Office (Drive/Calendar/Gmail)</h2>

      {links.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum vínculo ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.id} className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                {safeHref(link.url) ? (
                  <a
                    href={safeHref(link.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    <span className="mr-2 text-xs uppercase text-zinc-500 dark:text-zinc-400">{link.provider}</span>
                    {link.title}
                  </a>
                ) : (
                  <span className="truncate text-zinc-900 dark:text-zinc-50">
                    <span className="mr-2 text-xs uppercase text-zinc-500 dark:text-zinc-400">{link.provider}</span>
                    {link.title}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  {link.brokenAt && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                      quebrado
                    </span>
                  )}
                  {link.provider === "DRIVE" && (
                    <button
                      type="button"
                      onClick={() => handleToggleRevisions(link.id)}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      {revisionsOpenId !== link.id
                        ? "Ver versões"
                        : isLoadingRevisions
                          ? "Carregando…"
                          : "Fechar"}
                    </button>
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
                      list="document-type-suggestions"
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
              {revisionsOpenId === link.id && (
                <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-900">
                  {isLoadingRevisions && !revisionsByLinkId[link.id] ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Carregando versões…</p>
                  ) : (revisionsByLinkId[link.id] ?? []).length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Nenhum histórico de versão disponível pra este arquivo.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {revisionsByLinkId[link.id].map((revision) => (
                        <li key={revision.id} className="flex items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                          <span>
                            {new Date(revision.modifiedTime).toLocaleString("pt-BR")}
                            {revision.lastModifyingUserName && ` · ${revision.lastModifyingUserName}`}
                            {revision.keepForever && " · fixada"}
                          </span>
                          {revision.size && <span className="font-mono">{formatBytes(revision.size)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <DriveLinkActions
          entityType={entityType}
          entityId={entityId}
          userEmail={userEmail}
          hasPhases={!!phases}
          onError={setError}
        />
        <CalendarLinkActions entityType={entityType} entityId={entityId} userEmail={userEmail} onError={setError} />
        <GmailLinkActions
          entityType={entityType}
          entityId={entityId}
          userEmail={userEmail}
          contactEmail={contactEmail}
          onError={setError}
        />
      </div>
    </section>
  );
}
