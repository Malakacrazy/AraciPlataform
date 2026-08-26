"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { PepStage } from "@/lib/types";

export interface CreateProposalInput {
  opportunityId: string;
  roleHours: { role: string; stage: PepStage; hours: number }[];
  complexityScores: {
    tipologia: number;
    programaEscopo: number;
    terreno: number;
    regulatorio: number;
    ambicaoDesign: number;
  };
  contractedStages: PepStage[];
}

export async function createProposal(input: CreateProposalInput) {
  const res = await apiFetch("proposals", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível calcular a proposta.");
  }
  revalidatePath(`/opportunities/${input.opportunityId}`);
}

// Único uso hoje é abandonar um draft/sent manualmente -- "sent" e
// "signed" não passam mais por aqui (ver comentário em
// proposals.service.ts: sent só nasce de um envio real pra ZapSign,
// signed só do webhook confirmando doc_signed de verdade).
export async function expireProposal(id: string, opportunityId: string) {
  const res = await apiFetch(`proposals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "expired" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível expirar a proposta.");
  }
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function sendProposalForSignature(id: string, opportunityId: string) {
  const res = await apiFetch(`proposals/${id}/send-for-signature`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível enviar a proposta para assinatura.");
  }
  revalidatePath(`/opportunities/${opportunityId}`);
}
