"use client";

import { useState } from "react";
import type { PresentationLink } from "@/lib/types";
import { regeneratePresentationLink, revokePresentationLink } from "./actions";

export function PresentationLinkPanel({
  projectId,
  link,
}: {
  projectId: string;
  link: PresentationLink | null;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = link && typeof window !== "undefined" ? `${window.location.origin}/present/${link.token}` : null;

  async function run(action: () => Promise<void>) {
    setError(null);
    setIsSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar o link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {url}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => run(() => regeneratePresentationLink(projectId))}
            className="text-xs text-zinc-500 hover:underline disabled:opacity-50 dark:text-zinc-400"
          >
            Gerar novo (revoga o atual)
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => run(() => revokePresentationLink(projectId))}
            className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50 dark:text-zinc-400"
          >
            Revogar
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => run(() => regeneratePresentationLink(projectId))}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Gerar link de apresentação
        </button>
      )}
    </div>
  );
}
