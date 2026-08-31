import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../common/api-error';
import { MoodboardsService, type MoodboardCommentAuthorType, type MoodboardSnapshotInput } from '../ffe/moodboards.service';

export const verifyLogtoLoginSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  logtoSubjectId: z.string().min(1),
});

export type VerifyLogtoLoginInput = z.infer<typeof verifyLogtoLoginSchema>;

export const guestCommentInputSchema = z.object({
  body: z.string().min(1).max(2000),
});

export type GuestCommentInput = z.infer<typeof guestCommentInputSchema>;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias -- mesmo TTL de ClientSession/CollaboratorSession

const GUEST_AUTHOR_TYPE: MoodboardCommentAuthorType = 'guest';

// Mesmo modelo de segurança do CollaboratorPortalService (token na
// tabela É a credencial), com uma diferença: quem prova a identidade não
// é um magic link próprio, é o Logto (OIDC) -- apps/web termina o fluxo
// OAuth e chama verifyLogtoLogin() com as claims já verificadas pelo
// próprio token endpoint do Logto (canal servidor-a-servidor confiável,
// mesmo raciocínio de /api/google/callback confiar na resposta do
// endpoint de token do Google). Esta classe nunca vê um id_token bruto,
// só os três campos que já foram checados antes de chegar aqui.
@Injectable()
export class WhiteboardGuestPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moodboardsService: MoodboardsService,
  ) {}

  // O convite (WhiteboardGuestsService.invite) sempre vem antes -- Logto
  // só prova quem a pessoa é, nunca autocadastra um convidado novo. Uma
  // vez vinculado, logtoSubjectId passa a ser a chave de busca primária;
  // e-mail é só o jeito de encontrar o convite a primeira vez.
  async verifyLogtoLogin(input: VerifyLogtoLoginInput) {
    let guest = await this.prisma.db.whiteboardGuest.findUnique({
      where: { logtoSubjectId: input.logtoSubjectId },
    });

    if (!guest) {
      const email = input.email.toLowerCase();
      guest = await this.prisma.db.whiteboardGuest.findUnique({ where: { email } });
      if (!guest) {
        throw new UnauthorizedError('Este e-mail ainda não foi convidado pra nenhum quadro.');
      }
      if (guest.logtoSubjectId && guest.logtoSubjectId !== input.logtoSubjectId) {
        // Mesmo e-mail, subject diferente do já vinculado -- não deveria
        // acontecer em uso normal (um e-mail, uma conta Logto), mas
        // rejeitar explicitamente é mais seguro que decidir qual dos
        // dois "subjects" confiar.
        throw new UnauthorizedError('Este e-mail já está vinculado a outra conta de login.');
      }
      guest = await this.prisma.db.whiteboardGuest.update({
        where: { id: guest.id },
        data: { logtoSubjectId: input.logtoSubjectId },
      });
    }

    const sessionToken = randomUUID();
    await this.prisma.db.whiteboardGuestSession.create({
      data: { guestId: guest.id, token: sessionToken, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });

    return { sessionToken, guestName: guest.name };
  }

  private async resolveSession(sessionToken: string) {
    const session = await this.prisma.db.whiteboardGuestSession.findUnique({ where: { token: sessionToken } });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Sessão inválida ou expirada — entre novamente.');
    }
    return session;
  }

  // Mesmo achado/racional de ClientPortalService.logout -- apagar o
  // cookie não invalidava o token do lado do servidor.
  async logout(sessionToken: string): Promise<void> {
    await this.prisma.db.whiteboardGuestSession.deleteMany({ where: { token: sessionToken } });
  }

  async listBoards(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const guest = await this.prisma.db.whiteboardGuest.findUnique({
      where: { id: session.guestId },
      include: {
        access: {
          include: { moodboard: { select: { id: true, name: true, project: { select: { name: true } } } } },
          orderBy: { invitedAt: 'desc' },
        },
      },
    });
    if (!guest) {
      throw new UnauthorizedError('Sessão inválida ou expirada — entre novamente.');
    }
    return {
      guestName: guest.name,
      boards: guest.access.map((a) => ({
        id: a.moodboard.id,
        name: a.moodboard.name,
        projectName: a.moodboard.project.name,
      })),
    };
  }

  // "Escopado por quadro" verificado aqui, não só prometido -- mesmo
  // princípio de CollaboratorPortalService.getProject. 403, não 401: a
  // sessão já foi validada (resolveSession), só não abrange este quadro.
  private async requireAccess(sessionToken: string, moodboardId: string) {
    const session = await this.resolveSession(sessionToken);
    const access = await this.prisma.db.whiteboardGuestAccess.findUnique({
      where: { guestId_moodboardId: { guestId: session.guestId, moodboardId } },
    });
    if (!access) {
      throw new ForbiddenError('Você não tem acesso a este quadro.');
    }
    return session;
  }

  async getBoard(sessionToken: string, moodboardId: string) {
    await this.requireAccess(sessionToken, moodboardId);
    const moodboard = await this.prisma.db.moodboard.findUnique({
      where: { id: moodboardId },
      select: { id: true, name: true, snapshot: true },
    });
    if (!moodboard) {
      throw new NotFoundError('Prancha'); // defensivo -- inalcançável na prática, ver requireAccess acima
    }
    return moodboard;
  }

  async saveSnapshot(sessionToken: string, moodboardId: string, snapshot: MoodboardSnapshotInput['snapshot']) {
    await this.requireAccess(sessionToken, moodboardId);
    const accountId = await this.accountIdForMoodboard(moodboardId);
    return this.moodboardsService.saveSnapshot(accountId, moodboardId, { snapshot });
  }

  async listComments(sessionToken: string, moodboardId: string) {
    await this.requireAccess(sessionToken, moodboardId);
    return this.moodboardsService.listComments(moodboardId);
  }

  async addComment(sessionToken: string, moodboardId: string, input: GuestCommentInput) {
    const session = await this.requireAccess(sessionToken, moodboardId);
    const guest = await this.prisma.db.whiteboardGuest.findUniqueOrThrow({ where: { id: session.guestId } });
    return this.moodboardsService.addComment(moodboardId, GUEST_AUTHOR_TYPE, guest.name, input.body);
  }

  private async accountIdForMoodboard(moodboardId: string): Promise<string> {
    const moodboard = await this.prisma.db.moodboard.findUniqueOrThrow({
      where: { id: moodboardId },
      select: { project: { select: { accountId: true } } },
    });
    return moodboard.project.accountId;
  }
}
