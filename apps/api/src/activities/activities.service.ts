import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { ClientsService } from '../crm/clients.service';
import { OpportunitiesService } from '../crm/opportunities.service';

export const activityInputSchema = z.object({
  body: z.string().min(1).max(4000),
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
      data: { accountId, authorId, entityType, entityId, body: input.body },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
  }

  async deleteActivity(accountId: string, id: string) {
    const activity = await this.prisma.db.activity.findFirst({ where: { id, accountId } });
    if (!activity) {
      throw new NotFoundError('Nota');
    }
    await this.prisma.db.activity.delete({ where: { id } });
  }
}
