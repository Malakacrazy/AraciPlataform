import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OfficeLinkProvider } from '@araci/db';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { ClientsService } from '../crm/clients.service';

// externalId/url/title vêm do cliente (por enquanto colados manualmente na
// UI) — não há chamada à API real do Google aqui ainda, porque não há
// credenciais OAuth reais (GOOGLE_CLIENT_ID/SECRET vazios em
// apps/web/src/lib/auth.ts). Quando a Fase de escopo incremental (Drive/
// Calendar Picker) chegar, apps/web extrai esses três campos da resposta
// do Google e chama este mesmo endpoint — o formato não muda.
export const officeLinkInputSchema = z.object({
  provider: z.enum(OfficeLinkProvider),
  externalId: z.string().min(1),
  url: z.url(),
  title: z.string().min(1).max(300),
});

export type OfficeLinkInput = z.infer<typeof officeLinkInputSchema>;

@Injectable()
export class OfficeLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly clientsService: ClientsService,
  ) {}

  async listForProject(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.officeLink.findMany({
      where: { accountId, entityType: 'PROJECT', entityId: projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createForProject(
    accountId: string,
    projectId: string,
    input: OfficeLinkInput,
  ) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.officeLink.create({
      data: { ...input, accountId, entityType: 'PROJECT', entityId: projectId },
    });
  }

  async listForClient(accountId: string, clientId: string) {
    await this.clientsService.getClient(accountId, clientId);
    return this.prisma.db.officeLink.findMany({
      where: { accountId, entityType: 'CLIENT', entityId: clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createForClient(
    accountId: string,
    clientId: string,
    input: OfficeLinkInput,
  ) {
    await this.clientsService.getClient(accountId, clientId);
    return this.prisma.db.officeLink.create({
      data: { ...input, accountId, entityType: 'CLIENT', entityId: clientId },
    });
  }

  async getOfficeLink(accountId: string, id: string) {
    const link = await this.prisma.db.officeLink.findFirst({
      where: { id, accountId },
    });
    if (!link) {
      throw new NotFoundError('Vínculo do Office');
    }
    return link;
  }

  async deleteOfficeLink(accountId: string, id: string) {
    await this.getOfficeLink(accountId, id);
    await this.prisma.db.officeLink.delete({ where: { id } });
  }
}
