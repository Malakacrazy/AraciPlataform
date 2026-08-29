import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../common/api-error';
import { NotificationsService } from '../notifications/notifications.service';

export const requestLinkSchema = z.object({ email: z.email() });
export type RequestLinkInput = z.infer<typeof requestLinkSchema>;

export const consumeTokenSchema = z.object({ token: z.string().min(1) });
export type ConsumeTokenInput = z.infer<typeof consumeTokenSchema>;

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutos
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Lacuna da matriz ("colaboração com consultores externos") -- mesmo
// modelo de segurança exato do ClientPortalService (token na tabela É a
// credencial, verificado aqui, nunca um JWT decodificado do lado do
// apps/web) e mesma separação do AuthGuard interno de staff. Único e
// deliberado: cada método aqui é SÓ LEITURA (decisão tomada antes de
// escrever qualquer código, ver AskUserQuestion registrado na sessão) --
// não existe write nenhum neste service, de propósito. Isso é o que torna
// "colaboração escopada por projeto" seguro sem precisar retrofitar
// checagem de participação em toda rota interna existente: o consultor
// externo nunca fala com a API de staff, só com este punhado de rotas
// próprias, todas de leitura.
@Injectable()
export class CollaboratorPortalService {
  private readonly logger = new Logger(CollaboratorPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async requestMagicLink(input: RequestLinkInput): Promise<void> {
    const collaborator = await this.prisma.db.externalCollaborator.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!collaborator) {
      return; // resposta genérica pro chamador de qualquer forma -- evita enumeração
    }

    await this.prisma.db.collaboratorMagicLink.deleteMany({
      where: { collaboratorId: collaborator.id, consumedAt: null },
    });

    const token = randomUUID();
    await this.prisma.db.collaboratorMagicLink.create({
      data: {
        collaboratorId: collaborator.id,
        token,
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
      },
    });

    const webUrl = process.env.WEB_URL;
    if (!webUrl) {
      this.logger.warn('WEB_URL não configurado -- magic link será gerado com http://localhost:3000, inútil fora de dev.');
    }
    const link = `${webUrl ?? 'http://localhost:3000'}/colaborador/verify?token=${token}`;

    try {
      await this.notificationsService.sendCollaboratorMagicLink(collaborator.email, collaborator.name, link);
    } catch (error) {
      this.logger.warn(`Falha ao enviar magic link de consultor: ${(error as Error).message}`);
    }
  }

  async consumeMagicLink(input: ConsumeTokenInput) {
    const magicLink = await this.prisma.db.collaboratorMagicLink.findUnique({
      where: { token: input.token },
      include: { collaborator: true },
    });
    if (!magicLink || magicLink.consumedAt || magicLink.expiresAt < new Date()) {
      throw new UnauthorizedError('Link inválido, já usado ou expirado.');
    }

    await this.prisma.db.collaboratorMagicLink.update({
      where: { id: magicLink.id },
      data: { consumedAt: new Date() },
    });

    const sessionToken = randomUUID();
    await this.prisma.db.collaboratorSession.create({
      data: {
        collaboratorId: magicLink.collaboratorId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { sessionToken, collaboratorName: magicLink.collaborator.name };
  }

  private async resolveSession(sessionToken: string) {
    const session = await this.prisma.db.collaboratorSession.findUnique({
      where: { token: sessionToken },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Sessão inválida ou expirada — entre novamente.');
    }
    return session;
  }

  // Mesmo achado/racional de ClientPortalService.logout -- apagar o
  // cookie não invalidava o token do lado do servidor.
  async logout(sessionToken: string): Promise<void> {
    await this.prisma.db.collaboratorSession.deleteMany({ where: { token: sessionToken } });
  }

  async listProjects(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const collaborator = await this.prisma.db.externalCollaborator.findUnique({
      where: { id: session.collaboratorId },
      include: {
        projectAccess: {
          include: { project: { select: { id: true, name: true, status: true, client: { select: { name: true } } } } },
          orderBy: { invitedAt: 'desc' },
        },
      },
    });
    if (!collaborator) {
      throw new UnauthorizedError('Sessão inválida ou expirada — entre novamente.');
    }

    return {
      collaboratorName: collaborator.name,
      projects: collaborator.projectAccess.map((access) => ({
        id: access.project.id,
        name: access.project.name,
        status: access.project.status,
        clientName: access.project.client.name,
      })),
    };
  }

  // "Escopado por projeto" verificado aqui, não só prometido: sem uma
  // CollaboratorProjectAccess pra este par (collaboratorId, projectId),
  // é 401 -- mesmo que o projeto exista de verdade na conta. Projeção
  // deliberadamente sem nada financeiro: sem ProjectPhase.budget, sem
  // Invoice, sem Proposal, sem User.costPerHour (só o nome de quem é
  // responsável pela tarefa).
  async getProject(sessionToken: string, projectId: string) {
    const session = await this.resolveSession(sessionToken);
    const access = await this.prisma.db.collaboratorProjectAccess.findUnique({
      where: { collaboratorId_projectId: { collaboratorId: session.collaboratorId, projectId } },
    });
    if (!access) {
      // 403, não 401: a sessão em si já foi validada acima (resolveSession)
      // -- isto é "sessão boa, mas não pra este projeto", não "entre de
      // novo". Distinção que importa pro frontend: 401 redireciona pro
      // login, 403 mostra "sem acesso" sem derrubar a sessão válida.
      throw new ForbiddenError('Você não tem acesso a este projeto.');
    }

    const project = await this.prisma.db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        status: true,
        accountId: true,
        client: { select: { name: true } },
        phases: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            stage: true,
            order: true,
            contracted: true,
            startDate: true,
            dueDate: true,
            approvedAt: true,
            tasks: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
                completedAt: true,
                assignee: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!project) {
      // Defensivo -- inalcançável na prática (access acima já garante,
      // via FK, que o projeto existe), mas se um dia um projeto puder ser
      // excluído sem limpar CollaboratorProjectAccess, isto é um 404 de
      // verdade, não um problema de sessão/permissão.
      throw new NotFoundError('Projeto');
    }

    const activities = await this.prisma.db.activity.findMany({
      where: { accountId: project.accountId, entityType: 'PROJECT', entityId: projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    });

    const { accountId: _accountId, ...safeProject } = project;
    return { ...safeProject, activities };
  }
}
