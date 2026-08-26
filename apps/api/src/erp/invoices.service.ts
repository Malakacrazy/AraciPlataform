import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';
import { RoleRatesService } from './role-rates.service';

// amount é opcional aqui porque projeto hora_tecnica não aceita um valor
// digitado — ver createInvoiceForPhase: pra esse feeModel o valor é
// sempre calculado a partir de TimeEntry aprovada, nunca do body.
export const createInvoiceSchema = z.object({
  amount: z.number().positive().optional(),
  dueDate: z.iso.datetime().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// status é opcional -- ver comentário em updateInvoiceStatus. Registrar
// nfseNumber numa fatura que a Asaas já marcou 'paga' via webhook não
// pode regredir o status pra 'emitida': a fatura continua 'paga', só o
// número da NFS-e é que estava faltando.
export const invoiceStatusUpdateSchema = z.object({
  status: z.enum(['pendente', 'emitida', 'paga']).optional(),
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
    private readonly roleRatesService: RoleRatesService,
  ) {}

  listInvoices(accountId: string, projectId?: string) {
    return this.prisma.db.invoice.findMany({
      where: { project: { accountId }, ...(projectId ? { projectId } : {}) },
      include: { lines: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getInvoice(accountId: string, id: string) {
    const invoice = await this.prisma.db.invoice.findFirst({
      where: { id, project: { accountId } },
      include: { lines: true },
    });
    if (!invoice) {
      throw new NotFoundError('Fatura');
    }
    return invoice;
  }

  // Forma de medição do PEP: "por estágio concluído e aprovado" — não dá
  // pra gerar fatura de um estágio cujo gate ainda não foi aprovado
  // (ProjectPhase.approvedAt). Isso torna a regra de negócio impossível de
  // contornar via API, não só uma convenção de UI. Também não dá pra
  // faturar o mesmo estágio duas vezes — antes disso só a tela impedia
  // (escondia o botão "Faturar" quando já tinha fatura); virou regra da
  // API porque faturamento automático por hora precisa desse invariante
  // pra não contar a mesma TimeEntry aprovada duas vezes.
  async createInvoiceForPhase(
    accountId: string,
    projectId: string,
    phaseId: string,
    input: CreateInvoiceInput,
  ) {
    const project = await this.projectsService.getProject(accountId, projectId);
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
    const existingInvoice = await this.prisma.db.invoice.findFirst({
      where: { phaseId },
    });
    if (existingInvoice) {
      throw new ApiError(
        'PHASE_ALREADY_INVOICED',
        'Este estágio já tem uma fatura — o PEP fatura uma vez por estágio aprovado.',
        422,
      );
    }

    if (project.feeModel === 'hora_tecnica') {
      if (input.amount !== undefined) {
        throw new ApiError(
          'AMOUNT_NOT_ALLOWED',
          'Projetos hora_técnica são faturados automaticamente a partir das horas aprovadas apontadas neste estágio — não envie um valor.',
          422,
        );
      }
      return this.createHourlyInvoice(accountId, projectId, phase.id, input.dueDate);
    }

    if (input.amount === undefined) {
      throw new ApiError('AMOUNT_REQUIRED', 'Informe o valor da fatura.', 422);
    }

    return this.prisma.db.invoice.create({
      data: {
        projectId,
        phaseId,
        amount: input.amount,
        status: 'pendente',
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
      include: { lines: true },
    });
  }

  // Uma linha por papel com horas apontadas neste estágio (TimeEntry
  // billable e aprovada), precificada pela RoleRate atual do papel —
  // mesmo motor de tarifa/papel que o Proposal usa em ./pricing.ts, só
  // que aqui com hora de verdade em vez de hora estimada. Não existe
  // "hora ainda não faturada" como campo — o invariante de uma fatura por
  // estágio (ver createInvoiceForPhase) já garante que uma TimeEntry
  // aprovada nunca é contada duas vezes.
  private async createHourlyInvoice(
    accountId: string,
    projectId: string,
    phaseId: string,
    dueDateIso: string | undefined,
  ) {
    const entries = await this.prisma.db.timeEntry.findMany({
      where: { phaseId, billable: true, approvedAt: { not: null } },
      include: { user: { select: { role: true } } },
    });
    if (entries.length === 0) {
      throw new ApiError(
        'NO_APPROVED_HOURS',
        'Nenhuma hora aprovada e faturável apontada neste estágio ainda — não há o que faturar.',
        422,
      );
    }

    const hoursByRole = new Map<string, number>();
    for (const entry of entries) {
      const role = entry.user.role;
      hoursByRole.set(role, (hoursByRole.get(role) ?? 0) + Number(entry.hours));
    }

    const roleRates = await this.roleRatesService.listRoleRates(accountId);
    const rateByRole = new Map(
      roleRates.map((r) => [r.role, Number(r.hourlyRate)]),
    );

    const lines: { role: string; hours: number; hourlyRate: number; amount: number }[] = [];
    for (const [role, hours] of hoursByRole) {
      const hourlyRate = rateByRole.get(role);
      if (hourlyRate === undefined) {
        throw new ApiError(
          'ROLE_RATE_MISSING',
          `Nenhuma tarifa cadastrada para o papel "${role}" — cadastre em /role-rates antes de faturar este estágio.`,
          422,
        );
      }
      lines.push({ role, hours, hourlyRate, amount: hours * hourlyRate });
    }

    const amount = lines.reduce((sum, l) => sum + l.amount, 0);

    return this.prisma.db.invoice.create({
      data: {
        projectId,
        phaseId,
        amount,
        status: 'pendente',
        dueDate: dueDateIso ? new Date(dueDateIso) : undefined,
        lines: { create: lines },
      },
      include: { lines: true },
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
