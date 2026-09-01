"use client";

import { useState } from "react";
import type { OfficeLinkProvider } from "@/lib/types";
import { createOfficeLink, provisionDriveFolders, checkBrokenLinks } from "./actions";
import { DRIVE_SCOPE, getGoogleAccessToken, openDrivePicker } from "@/lib/google-client";

// Extraído de office-links-section.tsx numa revisão de qualidade de
// código (era um componente só de 690 linhas misturando Drive/Calendar/
// Gmail) -- as três ações daqui (vincular arquivo, provisionar pastas,
// verificar vínculos quebrados) são as únicas que fazem sentido só pra
// Drive: pastas e "vínculo quebrado" são conceitos que não existem pra
// Calendar/Gmail (checkBrokenLinksForAccount filtra provider: 'DRIVE').
type EntityType = "PROJECT" | "CLIENT";

interface Props {
  entityType: EntityType;
  entityId: string;
  userEmail?: string | null;
  // Só vem preenchido quando entityType é PROJECT -- Client não tem fase
  // do PEP, então o botão de provisionar pastas não aparece sem isso.
  hasPhases: boolean;
  onError: (message: string | null) => void;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function DriveLinkActions({ entityType, entityId, userEmail, hasPhases, onError }: Props) {
  const [isLinkingDrive, setIsLinkingDrive] = useState(false);
  const [isProvisioningFolders, setIsProvisioningFolders] = useState(false);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);

  async function createLink(provider: OfficeLinkProvider, picked: { externalId: string; url: string; title: string }, driveAccessToken?: string) {
    await createOfficeLink(entityType, entityId, { provider, ...picked, driveAccessToken });
  }

  async function handleLinkDrive() {
    onError(null);
    setIsLinkingDrive(true);
    try {
      const token = await getGoogleAccessToken(DRIVE_SCOPE, userEmail ?? undefined);
      const file = await openDrivePicker(token);
      if (!file) return; // usuário cancelou o Picker
      // Achado A38 da auditoria de 30 ago 2026: repassa o mesmo token do
      // Picker pro servidor confirmar o arquivo antes de contar pro
      // checklist de documentos obrigatórios (ver office-links.service.ts).
      await createLink("DRIVE", file, token);
    } catch (err) {
      onError(errorMessage(err, "Falha ao vincular arquivo do Drive."));
    } finally {
      setIsLinkingDrive(false);
    }
  }

  // Lacuna da matriz (gestão documental por projeto, "árvore de pastas")
  // -- só existe pra PROJECT (Client não tem fase do PEP nenhuma).
  async function handleProvisionFolders() {
    onError(null);
    setIsProvisioningFolders(true);
    try {
      await provisionDriveFolders(entityId);
    } catch (err) {
      onError(errorMessage(err, "Falha ao provisionar pastas no Drive."));
    } finally {
      setIsProvisioningFolders(false);
    }
  }

  // Lacuna da matriz (gestão documental por projeto, "vínculos
  // quebrados") -- verifica a CONTA inteira (ver comentário em
  // checkBrokenLinks), não só este projeto/cliente.
  async function handleCheckLinks() {
    onError(null);
    setIsCheckingLinks(true);
    try {
      await checkBrokenLinks(entityType, entityId);
    } catch (err) {
      onError(errorMessage(err, "Falha ao verificar vínculos."));
    } finally {
      setIsCheckingLinks(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleLinkDrive}
        disabled={isLinkingDrive}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {isLinkingDrive ? "Abrindo o Drive…" : "Vincular do Drive"}
      </button>
      {hasPhases && (
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
    </>
  );
}
