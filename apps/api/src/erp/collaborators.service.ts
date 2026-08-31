import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';
import { NotificationsService } from '../notifications/notifications.service';

export const inviteCollaboratorSchema = z.object({
  email: z.email(),
  name: z.string().min(1, 'Nome é obrigatório.'),
});

export type InviteCollaboratorInput = z.infer<typeof inviteCollaboratorSchema>;

// Lacuna da matriz ("colaboração com consultores externos") -- ver
// comentário em schema.prisma (model ExternalCollaborator) pro raciocínio
// completo. @AdminOnly() no controller: dar a um terceiro acesso — ainda
// que só-leitura — a um projeto é uma decisão de negócio, não uma tarefa
// operacional de staff comum.
@Injectable()
export class CollaboratorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listForProject(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.collaboratorProjectAccess.findMany({
      where: { projectId },
      include: { collaborator: { select: { id: true, name: true, email: true } } },
      orderBy: { invitedAt: 'desc' },
    });
  }

  // E-mail sempre em minúsculas (mesmo achado A-05 já corrigido pra
  // Client.email) -- ExternalCollaborator.email também é @unique.
  // Convidar de novo pra um projeto que já tem acesso é idempotente (não
  // duplica, não é erro) -- @@unique([collaboratorId, projectId]) só
  // dispararia um 500 sem essa checagem antes.
  async invite(accountId: string, projectId: string, input: InviteCollaboratorInput) {
    const project = await this.projectsService.getProject(accountId, projectId);
    const email = input.email.toLowerCase();

    const existing = await this.prisma.db.externalCollaborator.findUnique({ where: { email } });
    if (existing && existing.accountId !== accountId) {
      // E-mail já é consultor de outro estúdio nesta mesma instalação --
      // cenário real só se a plataforma um dia atender mais de uma firma
      // (ver Account, "multi-inquilino"). Rejeitado explicitamente em vez
      // de silenciosamente reatribuir a pessoa pra esta conta.
      throw new ApiError(
        'COLLABORATOR_EMAIL_TAKEN',
        'Este e-mail já está cadastrado como consultor de outra conta.',
        409,
      );
    }

    // Já existe nesta mesma conta (convidado pra outro projeto antes) --
    // não sobrescreve o nome com o do convite novo, só reaproveita.
    const collaborator =
      existing ?? (await this.prisma.db.externalCollaborator.create({ data: { accountId, email, name: input.name } }));

    const existingAccess = await this.prisma.db.collaboratorProjectAccess.findUnique({
      where: { collaboratorId_projectId: { collaboratorId: collaborator.id, projectId } },
    });
    if (existingAccess) {
      return { ...existingAccess, collaborator };
    }

    const access = await this.prisma.db.collaboratorProjectAccess.create({
      data: { collaboratorId: collaborator.id, projectId },
    });
    // Achado A65 da auditoria de 30 ago 2026 -- só no caminho em que o
    // acesso é de fato NOVO (o idempotente acima já retornou antes de
    // chegar aqui, então convidar de novo pro mesmo projeto não reenvia).
    await this.notificationsService.sendCollaboratorInvite(email, collaborator.name, project.name);
    return { ...access, collaborator };
  }

  async revoke(accountId: string, projectId: string, collaboratorId: string) {
    await this.projectsService.getProject(accountId, projectId);
    const access = await this.prisma.db.collaboratorProjectAccess.findUnique({
      where: { collaboratorId_projectId: { collaboratorId, projectId } },
    });
    if (!access) {
      throw new NotFoundError('Acesso de consultor externo');
    }
    await this.prisma.db.collaboratorProjectAccess.delete({ where: { id: access.id } });
  }
}
