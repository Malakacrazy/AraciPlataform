import { z } from "zod";
import { prisma } from "@araci/db";
import { ApiError, NotFoundError } from "@/lib/api";
import { getProject } from "./projects";

// WhatsApp não é uma aprovação de gate válida (PEP_Interior.md §3.2:
// "Aprovação por escrito — e-mail registrado serve; WhatsApp não serve").
// Restringir o canal a um enum, não string livre, é o que torna essa
// regra impossível de contornar por acidente pela API.
export const approveGateSchema = z.object({
  approvalChannel: z.enum(["email", "reuniao_presencial"]),
});

export type ApproveGateInput = z.infer<typeof approveGateSchema>;

export async function listPhases(accountId: string, projectId: string) {
  await getProject(accountId, projectId); // 404 se o projeto não é desta conta
  return prisma.projectPhase.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
}

async function getPhase(accountId: string, projectId: string, phaseId: string) {
  await getProject(accountId, projectId);
  const phase = await prisma.projectPhase.findFirst({ where: { id: phaseId, projectId } });
  if (!phase) {
    throw new NotFoundError("Fase do projeto");
  }
  return phase;
}

// Aprova o gate de uma fase — só depois disso o estágio pode ser
// faturado (Invoice.phaseId) e, no PEP, o próximo estágio pode começar
// (§3.2: "Não se inicia o estágio seguinte sem aprovação formal do
// anterior"). Simplificação conhecida: o PEP distingue gates formais
// (Etapas 2-4) de critérios de aceite mais simples nas Etapas 0-1
// (agendamento, assinatura de contrato); aqui todas as 5 fases usam o
// mesmo mecanismo de aprovação por uniformidade do schema — revisar se
// isso incomodar o fluxo real do estúdio.
export async function approvePhaseGate(
  accountId: string,
  projectId: string,
  phaseId: string,
  input: ApproveGateInput
) {
  const phase = await getPhase(accountId, projectId, phaseId);

  if (!phase.contracted) {
    throw new ApiError(
      "STAGE_NOT_CONTRACTED",
      "Este estágio não foi contratado neste projeto — não há gate para aprovar.",
      422
    );
  }

  const priorPhases = await prisma.projectPhase.findMany({
    where: { projectId, contracted: true, order: { lt: phase.order } },
  });
  const unapprovedPrior = priorPhases.find((p) => !p.approvedAt);
  if (unapprovedPrior) {
    throw new ApiError(
      "GATE_OUT_OF_ORDER",
      `O estágio "${unapprovedPrior.stage}" (ordem ${unapprovedPrior.order}) ainda não foi aprovado — os gates são sequenciais.`,
      422
    );
  }

  return prisma.projectPhase.update({
    where: { id: phaseId },
    data: { approvedAt: new Date(), approvalChannel: input.approvalChannel },
  });
}
