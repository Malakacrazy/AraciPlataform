import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { round2 } from '../common/money';
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
  // contornar via API, não só uma convenção de UI.
  //
  // Achados A1/A2 da auditoria de 30 ago 2026
  // (auditoria-2026-08-30-detalhada.md): o guard antigo era só
  // check-then-act (findFirst sem transação nem lock) E era "uma fatura
  // por fase" — as duas coisas juntas quebravam de dois jeitos opostos.
  // (1) Corrida de verdade: duplo clique/retry cria duas faturas
  // idênticas antes de qualquer uma ser persistida. (2) Horas aprovadas
  // DEPOIS do primeiro faturamento do estágio (aprovação e faturamento
  // são ações independentes) ficavam permanentemente não faturáveis,
  // porque um segundo POST pro mesmo phaseId sempre batia em
  // PHASE_ALREADY_INVOICED, mesmo cobrindo TimeEntry diferentes.
  //
  // Resolvido com dois invariantes diferentes, não um só:
  // - pg_advisory_xact_lock por phaseId serializa qualquer criação de
  //   fatura pro MESMO estágio (fecha a corrida, os dois fee models).
  // - Pra hora_tecnica, "uma fatura por fase" deixou de ser a regra —
  //   virou "uma TimeEntry nunca é faturada duas vezes"
  //   (TimeEntry.invoiceId, ver createHourlyInvoice), o que permite
  //   faturas complementares no mesmo estágio. Pra fee model fixo
  //   (orçamento fechado por fase), "uma fatura por fase" continua
  //   sendo a regra certa — não existe "hora adicional" pra justificar
  //   uma segunda fatura ali.
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

    return this.prisma.db.$transaction(async (tx) => {
      // hashtext() é determinístico por string -- duas chamadas pro MESMO
      // phaseId brigam pelo mesmo lock; liberado sozinho no fim da
      // transação (commit ou rollback), nunca precisa de unlock manual.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phaseId}))`;

      if (project.feeModel === 'hora_tecnica') {
        if (input.amount !== undefined) {
          throw new ApiError(
            'AMOUNT_NOT_ALLOWED',
            'Projetos hora_técnica são faturados automaticamente a partir das horas aprovadas apontadas neste estágio — não envie um valor.',
            422,
          );
        }

        // Definida aqui dentro (não como método da classe) de propósito:
        // o tipo do client de transação de um Prisma Client ESTENDIDO
        // (this.prisma.db.$extends(...), ver PrismaService) não bate com
        // Prisma.TransactionClient (o tipo base, não estendido) -- inferir
        // via closure evita ter que escrever esse tipo à mão.
        //
        // Uma linha por (papel, tarifa) com horas apontadas neste
        // estágio (TimeEntry billable, aprovada e AINDA NÃO consumida por
        // outra fatura -- `invoiceId: null`, achado A2). Escopada por
        // phaseId E projectId (achado A8: um updateTimeEntry que move o
        // lançamento de projeto sem corrigir o phaseId antigo não deveria
        // contar aqui, mesmo que o filtro por phaseId sozinho batesse).
        // Preço: usa TimeEntry.approvedHourlyRate quando existe
        // (congelada no momento da aprovação, achado A7) -- entradas
        // aprovadas ANTES desta migração não têm esse valor gravado,
        // então caem no fallback da RoleRate atual.
        const entries = await tx.timeEntry.findMany({
          where: { phaseId, projectId, billable: true, approvedAt: { not: null }, invoiceId: null },
          include: { user: { select: { role: true } } },
        });
        if (entries.length === 0) {
          throw new ApiError(
            'NO_APPROVED_HOURS',
            'Nenhuma hora aprovada e faturável apontada neste estágio ainda — não há o que faturar.',
            422,
          );
        }

        const roleRates = await this.roleRatesService.listRoleRates(accountId);
        const rateByRole = new Map(roleRates.map((r) => [r.role, Number(r.hourlyRate)]));

        // Agrupado por (papel, tarifa) — não só por papel. Com a tarifa
        // congelada por lançamento (A7), duas entradas do MESMO papel
        // podem legitimamente ter tarifas diferentes (a RoleRate mudou
        // entre uma aprovação e outra); uma única linha por papel
        // mostraria um hourlyRate que não bate com o amount de parte das
        // horas.
        type LineAccumulator = { role: string; hourlyRate: number; hours: number; amount: number };
        const byRoleAndRate = new Map<string, LineAccumulator>();
        for (const entry of entries) {
          const role = entry.user.role;
          const hourlyRate =
            entry.approvedHourlyRate !== null ? Number(entry.approvedHourlyRate) : rateByRole.get(role);
          if (hourlyRate === undefined) {
            throw new ApiError(
              'ROLE_RATE_MISSING',
              `Nenhuma tarifa cadastrada para o papel "${role}" — cadastre em /role-rates antes de faturar este estágio.`,
              422,
            );
          }
          const hours = Number(entry.hours);
          const key = `${role}:${hourlyRate}`;
          const acc = byRoleAndRate.get(key) ?? { role, hourlyRate, hours: 0, amount: 0 };
          acc.hours += hours;
          // round2 por lançamento, não só no total (achado A4) -- soma de
          // valores já arredondados evita o mesmo acúmulo de ponto
          // flutuante que a auditoria encontrou entre RoleRate e Invoice.
          acc.amount += round2(hours * hourlyRate);
          byRoleAndRate.set(key, acc);
        }

        const lines = [...byRoleAndRate.values()].map((l) => ({
          role: l.role,
          hours: l.hours,
          hourlyRate: l.hourlyRate,
          amount: round2(l.amount),
        }));
        const amount = round2(lines.reduce((sum, l) => sum + l.amount, 0));

        const invoice = await tx.invoice.create({
          data: {
            projectId,
            phaseId,
            amount,
            status: 'pendente',
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            lines: { create: lines },
          },
          include: { lines: true },
        });

        // Claim atômico: se outra transação concorrente já tivesse
        // consumido alguma dessas TimeEntry (não deveria, o advisory
        // lock por phaseId já serializa isso, mas o filtro
        // invoiceId:null é a segunda linha de defesa), o count aqui
        // viria menor que entries.length e a exceção desfaz a fatura
        // recém-criada junto (mesma transação).
        const claim = await tx.timeEntry.updateMany({
          where: { id: { in: entries.map((e) => e.id) }, invoiceId: null },
          data: { invoiceId: invoice.id },
        });
        if (claim.count !== entries.length) {
          throw new ApiError(
            'CONCURRENT_INVOICE_CONFLICT',
            'Outra fatura consumiu parte destas horas ao mesmo tempo — tente novamente.',
            409,
          );
        }

        return invoice;
      }

      const existingInvoice = await tx.invoice.findFirst({ where: { phaseId } });
      if (existingInvoice) {
        throw new ApiError(
          'PHASE_ALREADY_INVOICED',
          'Este estágio já tem uma fatura — o PEP fatura uma vez por estágio aprovado.',
          422,
        );
      }

      if (input.amount === undefined) {
        throw new ApiError('AMOUNT_REQUIRED', 'Informe o valor da fatura.', 422);
      }

      return tx.invoice.create({
        data: {
          projectId,
          phaseId,
          amount: input.amount,
          status: 'pendente',
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        },
        include: { lines: true },
      });
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
