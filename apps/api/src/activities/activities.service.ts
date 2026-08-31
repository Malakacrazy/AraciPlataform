import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { ClientsService } from '../crm/clients.service';
import { OpportunitiesService } from '../crm/opportunities.service';

export const activityInputSchema = z.object({
  body: z.string().min(1).max(4000),
  // Achado A63 da auditoria de 30 ago 2026 -- opt-in explícito, default
  // false quando omitido (nunca sai do estúdio a menos que quem escreve
  // marque). Só faz sentido de verdade pra nota de PROJETO (só projeto
  // tem CollaboratorProjectAccess), mas aceito no schema geral pra não
  // duplicar -- Client/Opportunity simplesmente nunca leem este campo.
  visibleToCollaborator: z.boolean().optional(),
});

export type ActivityInput = z.infer<typeof activityInputSchema>;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly clientsService: ClientsService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  async listForProject(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.list(accountId, 'PROJECT', projectId);
  }

  async createForProject(accountId: string, authorId: string, projectId: string, input: ActivityInput) {
    await this.projectsService.getProject(accountId, projectId);
    return this.create(accountId, authorId, 'PROJECT', projectId, input);
  }

  async listForClient(accountId: string, clientId: string) {
    await this.clientsService.getClient(accountId, clientId);
    return this.list(accountId, 'CLIENT', clientId);
  }

  async createForClient(accountId: string, authorId: string, clientId: string, input: ActivityInput) {
    await this.clientsService.getClient(accountId, clientId);
    return this.create(accountId, authorId, 'CLIENT', clientId, input);
  }

  async listForOpportunity(accountId: string, opportunityId: string) {
    await this.opportunitiesService.getOpportunity(accountId, opportunityId);
    return this.list(accountId, 'OPPORTUNITY', opportunityId);
  }

  async createForOpportunity(
    accountId: string,
    authorId: string,
    opportunityId: string,
    input: ActivityInput,
  ) {
    await this.opportunitiesService.getOpportunity(accountId, opportunityId);
    return this.create(accountId, authorId, 'OPPORTUNITY', opportunityId, input);
  }

  private list(accountId: string, entityType: 'PROJECT' | 'CLIENT' | 'OPPORTUNITY', entityId: string) {
    return this.prisma.db.activity.findMany({
      where: { accountId, entityType, entityId },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private create(
    accountId: string,
    authorId: string,
    entityType: 'PROJECT' | 'CLIENT' | 'OPPORTUNITY',
    entityId: string,
    input: ActivityInput,
  ) {
    return this.prisma.db.activity.create({
      data: {
        accountId,
        authorId,
        entityType,
        entityId,
        body: input.body,
        visibleToCollaborator: input.visibleToCollaborator ?? false,
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
  }

  // Usado só por StalledOpportunitiesCron -- sweep entre TODAS as contas
  // de propósito, então não passa por getOpportunity/escopo de conta como
  // o resto da classe. Uma consulta só pra todas as oportunidades
  // candidatas, não uma por oportunidade (achado "Médio" da auditoria: o
  // cron chamava listForOpportunity -- que já revalida a oportunidade
  // via getOpportunity -- dentro de um for...of, virando 2 idas ao banco
  // por oportunidade só nesta etapa).
  async getLastActivityAtByOpportunityIds(opportunityIds: string[]): Promise<Map<string, Date>> {
    if (opportunityIds.length === 0) return new Map();
    const rows = await this.prisma.db.activity.findMany({
      where: { entityType: 'OPPORTUNITY', entityId: { in: opportunityIds } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, createdAt: true },
    });
    const lastActivityAt = new Map<string, Date>();
    for (const row of rows) {
      // Ordenado desc -- a primeira ocorrência de cada entityId já é a
      // mais recente, sem precisar de groupBy/agregação.
      if (!lastActivityAt.has(row.entityId)) {
        lastActivityAt.set(row.entityId, row.createdAt);
      }
    }
    return lastActivityAt;
  }

  // Mesmo espírito de getLastActivityAtByOpportunityIds, só que pra
  // entityType CLIENT -- usado pelo DataRetentionCron como um dos sinais
  // de "última atividade" (junto de Opportunity/Project do próprio
  // cliente, ver ClientsService.listRetentionCandidateClients).
  async getLastActivityAtByClientIds(clientIds: string[]): Promise<Map<string, Date>> {
    if (clientIds.length === 0) return new Map();
    const rows = await this.prisma.db.activity.findMany({
      where: { entityType: 'CLIENT', entityId: { in: clientIds } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, createdAt: true },
    });
    const lastActivityAt = new Map<string, Date>();
    for (const row of rows) {
      if (!lastActivityAt.has(row.entityId)) {
        lastActivityAt.set(row.entityId, row.createdAt);
      }
    }
    return lastActivityAt;
  }

  // Mesmo espírito de getLastActivityAtByClientIds, só que pra entityType
  // PROJECT -- achado A3 da auditoria de 30 ago 2026: o cron de retenção
  // LGPD só olhava Activity de entityType CLIENT, mas é na timeline do
  // PROJETO (não do cliente) que a equipe registra o dia a dia real do
  // trabalho.
  async getLastActivityAtByProjectIds(projectIds: string[]): Promise<Map<string, Date>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.db.activity.findMany({
      where: { entityType: 'PROJECT', entityId: { in: projectIds } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, createdAt: true },
    });
    const lastActivityAt = new Map<string, Date>();
    for (const row of rows) {
      if (!lastActivityAt.has(row.entityId)) {
        lastActivityAt.set(row.entityId, row.createdAt);
      }
    }
    return lastActivityAt;
  }

  async deleteActivity(accountId: string, id: string) {
    const activity = await this.prisma.db.activity.findFirst({ where: { id, accountId } });
    if (!activity) {
      throw new NotFoundError('Nota');
    }
    await this.prisma.db.activity.delete({ where: { id } });
  }
}
