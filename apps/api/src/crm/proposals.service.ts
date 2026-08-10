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

export const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'sent', 'signed', 'expired']),
  sentAt: z.iso.datetime().nullable().optional(),
  signedAt: z.iso.datetime().nullable().optional(),
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
      include: { stages: true },
      orderBy: { sentAt: 'desc' },
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

    return this.prisma.db.proposal.create({
      data: {
        opportunityId: input.opportunityId,
        value: result.value,
        status: 'draft',
        complexityMultiplier: result.complexityMultiplier,
        packageDiscountPercent: result.packageDiscountPercent,
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
  }

  async updateProposalStatus(
    accountId: string,
    id: string,
    input: ProposalStatusUpdate,
  ) {
    await this.getProposal(accountId, id);
    return this.prisma.db.proposal.update({
      where: { id },
      data: {
        status: input.status,
        sentAt:
          input.sentAt === undefined
            ? undefined
            : input.sentAt === null
              ? null
              : new Date(input.sentAt),
        signedAt:
          input.signedAt === undefined
            ? undefined
            : input.signedAt === null
              ? null
              : new Date(input.signedAt),
      },
      include: { stages: true },
    });
  }
}
