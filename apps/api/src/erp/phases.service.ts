import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';

// WhatsApp não é uma aprovação de gate válida (PEP_Interior.md §3.2:
// "Aprovação por escrito — e-mail registrado serve; WhatsApp não serve").
// Restringir o canal a um enum, não string livre, é o que torna essa
// regra impossível de contornar por acidente pela API.
export const approveGateSchema = z.object({
  approvalChannel: z.enum(['email', 'reuniao_presencial']),
});

export type ApproveGateInput = z.infer<typeof approveGateSchema>;

@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async listPhases(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId); // 404 se o projeto não é desta conta
    return this.prisma.db.projectPhase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  private async getPhase(accountId: string, projectId: string, phaseId: string) {
    await this.projectsService.getProject(accountId, projectId);
    const phase = await this.prisma.db.projectPhase.findFirst({ where: { id: phaseId, projectId } });
    if (!phase) {
      throw new NotFoundError('Fase do projeto');
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
  async approvePhaseGate(accountId: string, projectId: string, phaseId: string, input: ApproveGateInput) {
    const phase = await this.getPhase(accountId, projectId, phaseId);

    if (!phase.contracted) {
      throw new ApiError(
        'STAGE_NOT_CONTRACTED',
        'Este estágio não foi contratado neste projeto — não há gate para aprovar.',
        422,
      );
    }

    const priorPhases = await this.prisma.db.projectPhase.findMany({
      where: { projectId, contracted: true, order: { lt: phase.order } },
    });
    const unapprovedPrior = priorPhases.find((p) => !p.approvedAt);
    if (unapprovedPrior) {
      throw new ApiError(
        'GATE_OUT_OF_ORDER',
        `O estágio "${unapprovedPrior.stage}" (ordem ${unapprovedPrior.order}) ainda não foi aprovado — os gates são sequenciais.`,
        422,
      );
    }

    return this.prisma.db.projectPhase.update({
      where: { id: phaseId },
      data: { approvedAt: new Date(), approvalChannel: input.approvalChannel },
    });
  }
}
