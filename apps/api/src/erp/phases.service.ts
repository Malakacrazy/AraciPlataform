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

// Datas/orçamento por fase — só isso, não estágio/ordem/contratado
// (estrutural, definido na criação a partir do PEP). Sem esses campos
// editáveis não há dado real para as visões de Gantt/Calendário.
export const updatePhaseSchema = z.object({
  startDate: z.iso.datetime().nullable().optional(),
  dueDate: z.iso.datetime().nullable().optional(),
  budget: z.number().nonnegative().nullable().optional(),
});

export type UpdatePhaseInput = z.infer<typeof updatePhaseSchema>;

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

  private async getPhase(
    accountId: string,
    projectId: string,
    phaseId: string,
  ) {
    await this.projectsService.getProject(accountId, projectId);
    const phase = await this.prisma.db.projectPhase.findFirst({
      where: { id: phaseId, projectId },
    });
    if (!phase) {
      throw new NotFoundError('Fase do projeto');
    }
    return phase;
  }

  // Lacuna da matriz ("checklist de documentos obrigatórios por fase,
  // amarrado ao gate do PEP") -- lista o que é exigido pra este STAGE
  // (configurado por RequiredDocumentTypesService, nunca por padrão) e
  // marca cada um como satisfeito ou não. "Satisfeito" exige as três
  // coisas: OfficeLink com aquele documentType exato, ligado a ESTA fase
  // (phaseId), e não quebrado (brokenAt null -- ver GoogleDriveService)
  // -- um vínculo apodrecido no Drive não conta como documento entregue.
  // Usado tanto pra mostrar o checklist antes de tentar aprovar quanto
  // internamente por approvePhaseGate, pra não duplicar a lógica.
  async getDocumentChecklist(accountId: string, projectId: string, phaseId: string) {
    const phase = await this.getPhase(accountId, projectId, phaseId);
    const required = await this.prisma.db.requiredDocumentType.findMany({
      where: { accountId, stage: phase.stage },
      orderBy: { documentType: 'asc' },
    });
    if (required.length === 0) {
      return [];
    }

    // Achado A38 da auditoria de 30 ago 2026: sem provider/lastCheckedAt
    // aqui, um vínculo de Calendar/Gmail contava como documento entregue,
    // e um vínculo recém-criado (brokenAt null porque nunca foi
    // verificado, não porque foi confirmado saudável) já satisfazia o
    // checklist -- qualquer staff podia inventar um OfficeLink com
    // documentType batendo e enganar o gate. accountId também entra aqui
    // por defesa em profundidade de tenant (phaseId sozinho já escopa via
    // getPhase acima, mas o índice usado é [phaseId, brokenAt]).
    const links = await this.prisma.db.officeLink.findMany({
      where: {
        accountId,
        phaseId,
        provider: 'DRIVE',
        brokenAt: null,
        lastCheckedAt: { not: null },
        documentType: { not: null },
      },
      select: { documentType: true },
    });
    const present = new Set(links.map((l) => l.documentType));

    return required.map((r) => ({
      documentType: r.documentType,
      satisfied: present.has(r.documentType),
    }));
  }

  // Aprova o gate de uma fase — só depois disso o estágio pode ser
  // faturado (Invoice.phaseId) e, no PEP, o próximo estágio pode começar
  // (§3.2: "Não se inicia o estágio seguinte sem aprovação formal do
  // anterior"). Simplificação conhecida: o PEP distingue gates formais
  // (Etapas 2-4) de critérios de aceite mais simples nas Etapas 0-1
  // (agendamento, assinatura de contrato); aqui todas as 5 fases usam o
  // mesmo mecanismo de aprovação por uniformidade do schema — revisar se
  // isso incomodar o fluxo real do estúdio.
  async approvePhaseGate(
    accountId: string,
    projectId: string,
    phaseId: string,
    input: ApproveGateInput,
  ) {
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

    const checklist = await this.getDocumentChecklist(accountId, projectId, phaseId);
    const missing = checklist.filter((item) => !item.satisfied);
    if (missing.length > 0) {
      throw new ApiError(
        'MISSING_REQUIRED_DOCUMENTS',
        `Faltam documentos obrigatórios pra aprovar este gate: ${missing.map((m) => m.documentType).join(', ')}.`,
        422,
      );
    }

    return this.prisma.db.projectPhase.update({
      where: { id: phaseId },
      data: { approvedAt: new Date(), approvalChannel: input.approvalChannel },
    });
  }

  // Achado A22 da auditoria de 30 ago 2026: budget é a única superfície de
  // dinheiro/configuração do módulo que não era admin-only (compare com
  // ExpensesController/InvoicesController/RoleRatesController, e o
  // próprio approve() acima), e podia ser reescrito a qualquer momento --
  // inclusive depois do gate aprovado ou da fase já ter fatura, quando o
  // orçado deveria estar travado como base contratual.
  async updatePhase(
    accountId: string,
    projectId: string,
    phaseId: string,
    input: UpdatePhaseInput,
  ) {
    const phase = await this.getPhase(accountId, projectId, phaseId);
    if (input.budget !== undefined) {
      if (phase.approvedAt) {
        throw new ApiError(
          'PHASE_BUDGET_LOCKED',
          'O gate deste estágio já foi aprovado -- o orçado não pode mais ser alterado.',
          422,
        );
      }
      const invoiced = await this.prisma.db.invoice.findFirst({ where: { phaseId } });
      if (invoiced) {
        throw new ApiError(
          'PHASE_BUDGET_LOCKED',
          'Este estágio já tem fatura -- o orçado não pode mais ser alterado.',
          422,
        );
      }
    }
    return this.prisma.db.projectPhase.update({
      where: { id: phaseId },
      data: {
        startDate:
          input.startDate === undefined
            ? undefined
            : input.startDate === null
              ? null
              : new Date(input.startDate),
        dueDate:
          input.dueDate === undefined
            ? undefined
            : input.dueDate === null
              ? null
              : new Date(input.dueDate),
        budget: input.budget,
      },
    });
  }
}
