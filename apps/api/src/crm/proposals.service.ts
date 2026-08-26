import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProjectStageName } from '@araci/db';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { OpportunitiesService } from './opportunities.service';
import { calcularProposta } from './pricing';

const complexityScoresSchema = z.object({
  tipologia: z.number().min(1).max(5),
  programaEscopo: z.number().min(1).max(5),
  terreno: z.number().min(1).max(5),
  regulatorio: z.number().min(1).max(5),
  ambicaoDesign: z.number().min(1).max(5),
});

const roleHoursSchema = z.object({
  role: z.string().min(1),
  stage: z.enum(ProjectStageName),
  hours: z.number().nonnegative(),
});

export const proposalInputSchema = z.object({
  opportunityId: z.string().min(1),
  roleHours: z.array(roleHoursSchema).min(1),
  complexityScores: complexityScoresSchema,
  contractedStages: z.array(z.enum(ProjectStageName)).min(1),
});

export type ProposalInput = z.infer<typeof proposalInputSchema>;

// Só "expired" -- abandonar um draft/sent manualmente (a oportunidade
// esfriou, por exemplo) continua fazendo sentido pra equipe decidir. Não
// existe mais um jeito manual de virar "sent" (isso agora é
// ProposalSigningService.sendForSignature, que de fato cria o documento
// na ZapSign) nem "signed" (só o webhook confirma isso de verdade) -- é
// exatamente o "a click is not a signature" que motivou trocar por um
// provedor de assinatura de verdade.
export const statusUpdateSchema = z.object({
  status: z.literal('expired'),
});

export type ProposalStatusUpdate = z.infer<typeof statusUpdateSchema>;

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  listProposals(accountId: string, opportunityId?: string) {
    return this.prisma.db.proposal.findMany({
      where: {
        opportunity: { client: { accountId } },
        ...(opportunityId ? { opportunityId } : {}),
      },
      include: { stages: true, previousVersion: { select: { version: true } } },
      orderBy: [{ opportunityId: 'asc' }, { version: 'desc' }],
    });
  }

  async getProposal(accountId: string, id: string) {
    const proposal = await this.prisma.db.proposal.findFirst({
      where: { id, opportunity: { client: { accountId } } },
      include: { stages: true },
    });
    if (!proposal) {
      throw new NotFoundError('Proposta');
    }
    return proposal;
  }

  // Roda o motor de precificação (./pricing.ts) contra as RoleRate já
  // cadastradas na conta e persiste o resultado — Proposal + uma
  // ProposalStage por estágio, espelhando a aba 05 da planilha.
  async createProposal(accountId: string, input: ProposalInput) {
    await this.opportunitiesService.getOpportunity(
      accountId,
      input.opportunityId,
    ); // 404 se a oportunidade não é desta conta

    const roleRates = await this.prisma.db.roleRate.findMany({
      where: { accountId },
    });
    if (roleRates.length === 0) {
      throw new ApiError(
        'NO_ROLE_RATES',
        'Nenhuma tarifa de papel cadastrada para esta conta — cadastre em /api/v1/role-rates antes de calcular uma proposta.',
        422,
      );
    }

    const result = calcularProposta({
      roleHours: input.roleHours,
      complexityScores: input.complexityScores,
      contractedStages: input.contractedStages,
      roleRates: roleRates.map((r) => ({
        role: r.role,
        hourlyRate: Number(r.hourlyRate),
      })),
    });

    // Recalcular sempre cria uma proposta nova (as stages não são
    // editáveis depois de criadas) -- version/previousVersionId tornam
    // essa cadeia explícita. A versão anterior ainda assinável
    // (draft/sent) vira "expired" na mesma transação: não faz sentido
    // duas versões da mesma proposta abertas pro cliente assinar ao
    // mesmo tempo. Uma versão já assinada nunca é tocada -- pode ser um
    // aditivo/renegociação que convive com o contrato já aceito.
    const latest = await this.prisma.db.proposal.findFirst({
      where: { opportunityId: input.opportunityId },
      orderBy: { version: 'desc' },
    });

    const shouldExpirePrevious = !!latest && (latest.status === 'draft' || latest.status === 'sent');
    const createOp = this.prisma.db.proposal.create({
      data: {
        opportunityId: input.opportunityId,
        value: result.value,
        status: 'draft',
        complexityMultiplier: result.complexityMultiplier,
        packageDiscountPercent: result.packageDiscountPercent,
        version: (latest?.version ?? 0) + 1,
        previousVersionId: latest?.id,
        stages: {
          create: result.stages.map((s) => ({
            stage: s.stage,
            contracted: s.contracted,
            baseHours: s.baseHours,
            adjustedHours: s.adjustedHours,
            baseCost: s.baseCost,
            adjustedCost: s.adjustedCost,
          })),
        },
      },
      include: { stages: true },
    });

    const results = shouldExpirePrevious
      ? await this.prisma.db.$transaction([
          this.prisma.db.proposal.update({ where: { id: latest!.id }, data: { status: 'expired' } }),
          createOp,
        ])
      : await this.prisma.db.$transaction([createOp]);

    return results[results.length - 1];
  }

  async updateProposalStatus(
    accountId: string,
    id: string,
    input: ProposalStatusUpdate,
  ) {
    await this.getProposal(accountId, id);
    return this.prisma.db.proposal.update({
      where: { id },
      data: { status: input.status },
      include: { stages: true },
    });
  }
}
