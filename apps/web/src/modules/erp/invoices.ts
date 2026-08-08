import { z } from "zod";
import { prisma } from "@araci/db";
import { ApiError, NotFoundError } from "@/lib/api";
import { getProject } from "./projects";

export const createInvoiceSchema = z.object({
  amount: z.number().positive(),
  dueDate: z.iso.datetime().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const invoiceStatusUpdateSchema = z.object({
  status: z.enum(["pendente", "emitida", "paga"]),
  nfseNumber: z.string().optional(),
  issuedAt: z.iso.datetime().nullable().optional(),
  paidAt: z.iso.datetime().nullable().optional(),
});

export type InvoiceStatusUpdate = z.infer<typeof invoiceStatusUpdateSchema>;

export function listInvoices(accountId: string, projectId?: string) {
  return prisma.invoice.findMany({
    where: { project: { accountId }, ...(projectId ? { projectId } : {}) },
    orderBy: { dueDate: "asc" },
  });
}

export async function getInvoice(accountId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id, project: { accountId } } });
  if (!invoice) {
    throw new NotFoundError("Fatura");
  }
  return invoice;
}

// Forma de medição do PEP: "por estágio concluído e aprovado" — não dá
// pra gerar fatura de um estágio cujo gate ainda não foi aprovado
// (ProjectPhase.approvedAt). Isso torna a regra de negócio impossível de
// contornar via API, não só uma convenção de UI.
export async function createInvoiceForPhase(
  accountId: string,
  projectId: string,
  phaseId: string,
  input: CreateInvoiceInput
) {
  await getProject(accountId, projectId);
  const phase = await prisma.projectPhase.findFirst({ where: { id: phaseId, projectId } });
  if (!phase) {
    throw new NotFoundError("Fase do projeto");
  }
  if (!phase.approvedAt) {
    throw new ApiError(
      "PHASE_NOT_APPROVED",
      "Este estágio ainda não teve o gate aprovado — o PEP fatura por estágio concluído e aprovado, não antes.",
      422
    );
  }

  return prisma.invoice.create({
    data: {
      projectId,
      phaseId,
      amount: input.amount,
      status: "pendente",
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    },
  });
}

export async function updateInvoiceStatus(accountId: string, id: string, input: InvoiceStatusUpdate) {
  await getInvoice(accountId, id);
  return prisma.invoice.update({
    where: { id },
    data: {
      status: input.status,
      nfseNumber: input.nfseNumber,
      issuedAt: input.issuedAt === undefined ? undefined : input.issuedAt === null ? null : new Date(input.issuedAt),
      paidAt: input.paidAt === undefined ? undefined : input.paidAt === null ? null : new Date(input.paidAt),
    },
  });
}
