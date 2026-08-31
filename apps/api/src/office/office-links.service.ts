import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OfficeLinkProvider } from '@araci/db';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { ClientsService } from '../crm/clients.service';
import { GoogleDriveService } from './google-drive.service';

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
  // Achado A43 da auditoria de 30 ago 2026: z.url() sozinho só valida que
  // `new URL(...)` não lança -- não restringe protocolo, então
  // "javascript:..." passava. office-links-section.tsx renderiza isto
  // cru em href; só http(s) é um destino legítimo de link do Drive/
  // Calendar/Gmail.
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().min(1).max(300),
  // Achado A38: token EFÊMERO do Picker do navegador (drive.file, só
  // desta chamada) -- nunca gravado no OfficeLink, só usado aqui pra
  // confirmar que o arquivo existe de verdade antes de marcar
  // lastCheckedAt (ver createForProject/createForClient). Ausente para
  // provider CALENDAR/GMAIL (o Picker não existe pra eles) e pra
  // qualquer chamador antigo que ainda não manda -- nesse caso o vínculo
  // nasce igual a antes, só sem satisfazer o checklist até a checagem
  // periódica confirmar.
  driveAccessToken: z.string().optional(),
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
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async listForProject(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.officeLink.findMany({
      where: { accountId, entityType: 'PROJECT', entityId: projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Achado A38 da auditoria de 30 ago 2026: verifica o arquivo de verdade
  // antes de marcar lastCheckedAt (condição que o checklist de documentos
  // obrigatórios exige, ver phases.service.ts). Achado A33: linkedByUserId
  // é quem de fato escolheu o arquivo -- resolveDriveAccessToken passa a
  // preferir a credencial desta pessoa em vez de sortear qualquer admin.
  private async prepareCreateData(userId: string, input: OfficeLinkInput) {
    const { driveAccessToken, ...rest } = input;
    let lastCheckedAt: Date | null = null;
    if (rest.provider === 'DRIVE' && driveAccessToken) {
      const exists = await this.googleDriveService.verifyFileAccessible(driveAccessToken, rest.externalId);
      if (exists) lastCheckedAt = new Date();
    }
    return { ...rest, linkedByUserId: userId, lastCheckedAt };
  }

  async createForProject(
    accountId: string,
    userId: string,
    projectId: string,
    input: OfficeLinkInput,
  ) {
    await this.projectsService.getProject(accountId, projectId);
    const data = await this.prepareCreateData(userId, input);
    return this.prisma.db.officeLink.create({
      data: { ...data, accountId, entityType: 'PROJECT', entityId: projectId },
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
    userId: string,
    clientId: string,
    input: OfficeLinkInput,
  ) {
    await this.clientsService.getClient(accountId, clientId);
    const data = await this.prepareCreateData(userId, input);
    return this.prisma.db.officeLink.create({
      data: { ...data, accountId, entityType: 'CLIENT', entityId: clientId },
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
