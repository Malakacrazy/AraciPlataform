import { z } from "zod";
import { prisma } from "@araci/db";
import { ApiError, NotFoundError } from "@/lib/api";
import { getProject } from "./projects";

export const timeEntryInputSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().min(1).optional(),
  date: z.iso.datetime(),
  hours: z.number().positive(),
  billable: z.boolean().optional(),
  activityType: z.enum(["projeto", "administrativo", "comercial"]),
});

export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>;

export function listTimeEntries(accountId: string, filters: { projectId?: string; userId?: string } = {}) {
  return prisma.timeEntry.findMany({
    where: {
      project: { accountId },
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    },
    orderBy: { date: "desc" },
  });
}

async function getTimeEntry(accountId: string, id: string) {
  const entry = await prisma.timeEntry.findFirst({ where: { id, project: { accountId } } });
  if (!entry) {
    throw new NotFoundError("Lançamento de horas");
  }
  return entry;
}

// Quem lança a hora é sempre o usuário autenticado (userId vem da sessão,
// não do corpo da requisição) — não existe "lançar hora em nome de
// outra pessoa" nesta API.
export async function createTimeEntry(accountId: string, userId: string, input: TimeEntryInput) {
  await getProject(accountId, input.projectId);
  if (input.phaseId) {
    const phase = await prisma.projectPhase.findFirst({
      where: { id: input.phaseId, projectId: input.projectId },
    });
    if (!phase) {
      throw new NotFoundError("Fase do projeto");
    }
  }

  return prisma.timeEntry.create({
    data: {
      userId,
      projectId: input.projectId,
      phaseId: input.phaseId,
      date: new Date(input.date),
      hours: input.hours,
      billable: input.billable ?? true,
      activityType: input.activityType,
    },
  });
}

function assertNotApproved(entry: { approvedAt: Date | null }) {
  if (entry.approvedAt) {
    throw new ApiError(
      "TIME_ENTRY_APPROVED",
      "Este lançamento já foi aprovado pelo gestor e não pode mais ser alterado.",
      422
    );
  }
}

export async function updateTimeEntry(accountId: string, id: string, input: Partial<TimeEntryInput>) {
  const entry = await getTimeEntry(accountId, id);
  assertNotApproved(entry);
  return prisma.timeEntry.update({
    where: { id },
    data: { ...input, date: input.date ? new Date(input.date) : undefined },
  });
}

export async function deleteTimeEntry(accountId: string, id: string) {
  const entry = await getTimeEntry(accountId, id);
  assertNotApproved(entry);
  await prisma.timeEntry.delete({ where: { id } });
}

// Aprovação de horas por gestor ou responsável antes do fechamento do
// período (plano original, seção ERP Arquitetura). approverUserId é quem
// está aprovando (o usuário autenticado fazendo a chamada), não quem
// lançou a hora.
export async function approveTimeEntry(accountId: string, id: string, approverUserId: string) {
  await getTimeEntry(accountId, id);
  return prisma.timeEntry.update({
    where: { id },
    data: { approvedAt: new Date(), approvedById: approverUserId },
  });
}
