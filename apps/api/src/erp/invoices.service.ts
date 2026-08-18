import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';

export const createInvoiceSchema = z.object({
  amount: z.number().positive(),
  dueDate: z.iso.datetime().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const invoiceStatusUpdateSchema = z.object({
  status: z.enum(['pendente', 'emitida', 'paga']),
  nfseNumber: z.string().optional(),
  issuedAt: z.iso.datetime().nullable().optional(),
  paidAt: z.iso.datetime().nullable().optional(),
  // Reforma Tributária (IBS/CBS) — campos de preparo, ainda sem uso na
  // emissão real (ver schema.prisma, model Invoice). Aceitos aqui pra
  // permitir preenchimento manual quando a consultoria contábil definir
  // os valores, sem esperar um fluxo dedicado.
  cstIbs: z.string().optional(),
  cstCbs: z.string().optional(),
  cClassTrib: z.string().optional(),
});

export type InvoiceStatusUpdate = z.infer<typeof invoiceStatusUpdateSchema>;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  listInvoices(accountId: string, projectId?: string) {
    return this.prisma.db.invoice.findMany({
      where: { project: { accountId }, ...(projectId ? { projectId } : {}) },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getInvoice(accountId: string, id: string) {
    const invoice = await this.prisma.db.invoice.findFirst({
      where: { id, project: { accountId } },
    });
    if (!invoice) {
      throw new NotFoundError('Fatura');
    }
    return invoice;
  }

  // Forma de medição do PEP: "por estágio concluído e aprovado" — não dá
  // pra gerar fatura de um estágio cujo gate ainda não foi aprovado
  // (ProjectPhase.approvedAt). Isso torna a regra de negócio impossível de
  // contornar via API, não só uma convenção de UI.
  async createInvoiceForPhase(
    accountId: string,
    projectId: string,
    phaseId: string,
    input: CreateInvoiceInput,
  ) {
    await this.projectsService.getProject(accountId, projectId);
    const phase = await this.prisma.db.projectPhase.findFirst({
      where: { id: phaseId, projectId },
    });
    if (!phase) {
      throw new NotFoundError('Fase do projeto');
    }
    if (!phase.approvedAt) {
      throw new ApiError(
        'PHASE_NOT_APPROVED',
        'Este estágio ainda não teve o gate aprovado — o PEP fatura por estágio concluído e aprovado, não antes.',
        422,
      );
    }

    return this.prisma.db.invoice.create({
      data: {
        projectId,
        phaseId,
        amount: input.amount,
        status: 'pendente',
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
    });
  }

  async updateInvoiceStatus(
    accountId: string,
    id: string,
    input: InvoiceStatusUpdate,
  ) {
    await this.getInvoice(accountId, id);
    return this.prisma.db.invoice.update({
      where: { id },
      data: {
        status: input.status,
        nfseNumber: input.nfseNumber,
        cstIbs: input.cstIbs,
        cstCbs: input.cstCbs,
        cClassTrib: input.cClassTrib,
        issuedAt:
          input.issuedAt === undefined
            ? undefined
            : input.issuedAt === null
              ? null
              : new Date(input.issuedAt),
        paidAt:
          input.paidAt === undefined
            ? undefined
            : input.paidAt === null
              ? null
              : new Date(input.paidAt),
      },
    });
  }
}
