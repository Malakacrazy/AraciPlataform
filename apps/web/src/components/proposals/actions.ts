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

export async function updateProposalStatus(id: string, opportunityId: string, status: string) {
  const res = await apiFetch(`proposals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(status === "sent" ? { sentAt: new Date().toISOString() } : {}) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível atualizar o status da proposta.");
  }
  revalidatePath(`/opportunities/${opportunityId}`);
}
