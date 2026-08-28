import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { ClientsService } from './clients.service';

export const opportunityInputSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(1), // vira Project.name na conversão automática
  // Estágio do kanban de CRM (novo_lead | qualificacao | proposta_enviada |
  // negociacao | ganho | perdido) — NÃO confundir com ProjectStageName
  // (os 5 estágios do PEP do ERP). São dois conceitos de "estágio"
  // diferentes que só coincidem em nome.
  stage: z.string().min(1),
  feeModel: z.string().min(1), // "hora_tecnica" é o único em uso real hoje
  estimatedValue: z.number().nonnegative().optional(),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

// lostAt não está aqui de propósito -- marcar como perdida só pelo
// endpoint dedicado (POST .../mark-lost), que exige lostReason junto.
// Sem essa separação, um PATCH genérico sempre poderia setar lostAt sem
// motivo nenhum (mesmo raciocínio de approvalChannel em ProjectPhase).
export const opportunityUpdateSchema = opportunityInputSchema.partial().extend({
  wonAt: z.iso.datetime().nullable().optional(),
});

export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;

export const markLostSchema = z.object({
  lostReason: z.string().min(1),
});

export type MarkLostInput = z.infer<typeof markLostSchema>;

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly projectsService: ProjectsService,
  ) {}

  listOpportunities(accountId: string) {
    return this.prisma.db.opportunity.findMany({
      where: { client: { accountId } },
      include: { client: true, project: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOpportunity(accountId: string, id: string) {
    const opportunity = await this.prisma.db.opportunity.findFirst({
      where: { id, client: { accountId } },
      include: { client: true, project: true },
    });
    if (!opportunity) {
      throw new NotFoundError('Oportunidade');
    }
    return opportunity;
  }

  async createOpportunity(accountId: string, input: OpportunityInput) {
    await this.clientsService.getClient(accountId, input.clientId); // 404 se o cliente não é desta conta
    return this.prisma.db.opportunity.create({ data: input });
  }

  // Só atualiza a Opportunity em si. A conversão automática em Project
  // (convertToProject) é disparada pelo controller depois de um update
  // bem-sucedido que sete wonAt — não fica aqui dentro para manter esta
  // função com uma única responsabilidade (update) e testável sem
  // precisar simular a criação de projeto.
  async updateOpportunity(
    accountId: string,
    id: string,
    input: Partial<OpportunityInput> & {
      wonAt?: Date | null;
    },
  ) {
    await this.getOpportunity(accountId, id);
    if (input.clientId) {
      await this.clientsService.getClient(accountId, input.clientId);
    }
    return this.prisma.db.opportunity.update({ where: { id }, data: input });
  }

  // Endpoint dedicado (não o PATCH genérico) -- ver comentário em
  // opportunityUpdateSchema. Uma oportunidade já ganha não pode virar
  // perdida (bloqueado, não silenciosamente ignorado).
  async markLost(accountId: string, id: string, lostReason: string) {
    const opportunity = await this.getOpportunity(accountId, id);
    if (opportunity.wonAt) {
      throw new ApiError(
        'OPPORTUNITY_ALREADY_WON',
        'Esta oportunidade já foi marcada como ganha — não pode virar perdida.',
        422,
      );
    }
    return this.prisma.db.opportunity.update({
      where: { id },
      data: { lostAt: new Date(), lostReason },
    });
  }

  // Achado da auditoria: ganho/perdido era irreversível por qualquer
  // API -- um clique errado (ou o cliente voltando atrás depois de dizer
  // que ia fechar com outro escritório) não tinha volta. lostAt/
  // lostReason nunca tocam `stage` ao marcar perdida (ver markLost
  // acima), então só limpar os dois já basta pra reaparecer na coluna
  // certa do kanban -- sem precisar redigitar o estágio.
  async reopen(accountId: string, id: string) {
    const opportunity = await this.getOpportunity(accountId, id);
    if (opportunity.wonAt) {
      throw new ApiError(
        'OPPORTUNITY_ALREADY_WON',
        'Esta oportunidade já foi marcada como ganha — reabrir não se aplica.',
        422,
      );
    }
    if (!opportunity.lostAt) {
      throw new ApiError(
        'OPPORTUNITY_NOT_LOST',
        'Esta oportunidade não está marcada como perdida.',
        422,
      );
    }
    return this.prisma.db.opportunity.update({
      where: { id },
      data: { lostAt: null, lostReason: null },
    });
  }

  // Usado só pelo job de lembrete de lead parada (ver
  // StalledOpportunitiesCron, em activities/) -- cross-conta de propósito,
  // um cron não tem uma sessão/accountId pra escopar como as rotas HTTP
  // têm.
  listOpenOpportunities() {
    return this.prisma.db.opportunity.findMany({
      where: { wonAt: null, lostAt: null },
      select: { id: true, title: true, createdAt: true, client: { select: { accountId: true } } },
    });
  }

  async deleteOpportunity(accountId: string, id: string) {
    await this.getOpportunity(accountId, id);
    // Mesmo achado A-02 (Activity é polimórfico, sem FK) que já valia pra
    // Client/Project -- ActivityEntityType inclui OPPORTUNITY, então este
    // delete tinha o mesmo risco de deixar nota órfã, só num caminho que
    // a auditoria não citou por nome.
    await this.prisma.db.$transaction([
      this.prisma.db.activity.deleteMany({
        where: { accountId, entityType: 'OPPORTUNITY', entityId: id },
      }),
      this.prisma.db.opportunity.delete({ where: { id } }),
    ]);
  }

  // Fluxo automático #1 (especificacao-tecnica.md): marcar como ganha
  // converte em projeto, sem redigitação. Idempotente — se a oportunidade
  // já tem um Project vinculado, retorna o existente em vez de tentar
  // criar outro (Project.opportunityId é @unique, então uma segunda
  // tentativa quebraria sem essa checagem).
  async convertToProject(accountId: string, opportunityId: string) {
    const opportunity = await this.prisma.db.opportunity.findFirst({
      where: { id: opportunityId, client: { accountId } },
      include: { project: true },
    });
    if (!opportunity) {
      return null;
    }
    if (opportunity.project) {
      return opportunity.project;
    }

    return this.projectsService.createProjectFromOpportunity({
      accountId,
      clientId: opportunity.clientId,
      opportunityId: opportunity.id,
      name: opportunity.title,
      feeModel: opportunity.feeModel,
    });
  }
}
