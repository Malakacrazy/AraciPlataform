import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OfficeLinkProvider } from '@araci/db';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { ClientsService } from '../crm/clients.service';

// externalId/url/title chegam já resolvidos pelo frontend (achado de uma
// auditoria externa: um comentário antigo aqui dizia que isso ainda era
// colado à mão, sem chamada real ao Google -- estava errado desde que
// office-links-section.tsx passou a usar o Picker de verdade pro Drive,
// events.insert/list pro Calendar e messages.send/list pro Gmail, ver
// lib/google-client.ts). Este service nunca fala com o Google
// diretamente: só grava o vínculo já resolvido -- quem provisiona pasta
// no Drive de servidor pra servidor é GoogleDriveService, que usa a
// credencial de sincronização (GoogleCredential), não o Picker.
export const officeLinkInputSchema = z.object({
  provider: z.enum(OfficeLinkProvider),
  externalId: z.string().min(1),
  url: z.url(),
  title: z.string().min(1).max(300),
});

export type OfficeLinkInput = z.infer<typeof officeLinkInputSchema>;

// Lacuna da matriz (gestão documental por projeto, "taxonomia") -- os
// três campos são independentes e todos opcionais: dá pra marcar só o
// tipo de documento sem escolher fase, por exemplo. phaseId vazio
// ("") limpa o vínculo com a fase (diferente de omitir o campo, que não
// mexe no valor atual) -- mesmo padrão de outros PATCH parciais no
// projeto (ex.: InvoiceStatusUpdate.issuedAt).
export const officeLinkUpdateSchema = z.object({
  documentType: z.string().max(60).nullable().optional(),
  phaseId: z.string().nullable().optional(),
  visibleToClient: z.boolean().optional(),
});

export type OfficeLinkUpdateInput = z.infer<typeof officeLinkUpdateSchema>;

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

  // Lacuna da matriz (gestão documental por projeto, "taxonomia") -- só
  // permite ligar a uma fase que é do MESMO projeto do vínculo (não faz
  // sentido nenhum, e não bate no índice de accountId, uma fase de outro
  // projeto). Vínculo de Client (entityType CLIENT) nunca tem phaseId --
  // Client não tem fase, então phaseId chegando aqui pra esse tipo é
  // rejeitado, não silenciosamente ignorado.
  async updateOfficeLink(accountId: string, id: string, input: OfficeLinkUpdateInput) {
    const link = await this.getOfficeLink(accountId, id);

    if (input.phaseId) {
      if (link.entityType !== 'PROJECT') {
        throw new ApiError(
          'OFFICE_LINK_PHASE_NOT_APPLICABLE',
          'Só um vínculo de projeto pode ser ligado a uma fase do PEP.',
          422,
        );
      }
      const phase = await this.prisma.db.projectPhase.findFirst({
        where: { id: input.phaseId, projectId: link.entityId },
      });
      if (!phase) {
        throw new NotFoundError('Fase do projeto');
      }
    }

    return this.prisma.db.officeLink.update({
      where: { id },
      data: {
        documentType: input.documentType,
        // "" (limpa o vínculo, ver doc do schema acima) precisa virar
        // null antes do Prisma -- achado real de revisão: phaseId é FK de
        // verdade pra ProjectPhase.id, e "" nunca bate com nenhuma linha,
        // então ia direto pra uma violação de FK em vez de desvincular.
        phaseId: input.phaseId === '' ? null : input.phaseId,
        visibleToClient: input.visibleToClient,
      },
    });
  }
}
