import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { MoodboardsService } from './moodboards.service';

export const inviteWhiteboardGuestSchema = z.object({
  email: z.email(),
  name: z.string().min(1, 'Nome é obrigatório.'),
});

export type InviteWhiteboardGuestInput = z.infer<typeof inviteWhiteboardGuestSchema>;

// Nova audiência (nem staff, nem o Client do projeto, nem um
// ExternalCollaborator de projeto inteiro) -- alguém convidado só pra
// colaborar num QUADRO específico. Mesmo formato exato de
// CollaboratorsService (convite idempotente, e-mail em minúsculas,
// reaproveita a identidade entre convites), escopado a Moodboard em vez
// de Project -- concessão mais estreita de propósito. @AdminOnly() no
// controller: convidar um terceiro, mesmo que só pra um quadro, é
// decisão de negócio, mesmo padrão de consultor externo.
@Injectable()
export class WhiteboardGuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moodboardsService: MoodboardsService,
  ) {}

  async listForMoodboard(accountId: string, moodboardId: string) {
    await this.moodboardsService.getMoodboard(accountId, moodboardId);
    return this.prisma.db.whiteboardGuestAccess.findMany({
      where: { moodboardId },
      include: { guest: { select: { id: true, name: true, email: true, logtoSubjectId: true } } },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async invite(accountId: string, moodboardId: string, input: InviteWhiteboardGuestInput) {
    await this.moodboardsService.getMoodboard(accountId, moodboardId);
    const email = input.email.toLowerCase();

    const existing = await this.prisma.db.whiteboardGuest.findUnique({ where: { email } });
    if (existing && existing.accountId !== accountId) {
      throw new ApiError(
        'WHITEBOARD_GUEST_EMAIL_TAKEN',
        'Este e-mail já está cadastrado como convidado de outra conta.',
        409,
      );
    }

    const guest =
      existing ?? (await this.prisma.db.whiteboardGuest.create({ data: { accountId, email, name: input.name } }));

    const existingAccess = await this.prisma.db.whiteboardGuestAccess.findUnique({
      where: { guestId_moodboardId: { guestId: guest.id, moodboardId } },
    });
    if (existingAccess) {
      return { ...existingAccess, guest };
    }

    const access = await this.prisma.db.whiteboardGuestAccess.create({
      data: { guestId: guest.id, moodboardId },
    });
    return { ...access, guest };
  }

  // Achado A60 da auditoria de 30 ago 2026: apagar só o
  // WhiteboardGuestAccess deixava a sessão de portal do convidado
  // (WhiteboardGuestSession) viva -- força reautenticação via Logto na
  // próxima vez que ele tentar abrir qualquer quadro, em vez de deixar a
  // sessão de portal sobreviver à revogação. Não invalida sozinho o JWT
  // do canal Realtime já emitido (bearer, independente desta tabela --
  // ver TOKEN_TTL em supabaseBoardToken.ts, que é a defesa real contra
  // isso), mas fecha o caminho HTTP do portal (get/snapshot/comentário)
  // imediatamente em vez de só no próximo check per-request.
  async revoke(accountId: string, moodboardId: string, guestId: string) {
    await this.moodboardsService.getMoodboard(accountId, moodboardId);
    const access = await this.prisma.db.whiteboardGuestAccess.findUnique({
      where: { guestId_moodboardId: { guestId, moodboardId } },
    });
    if (!access) {
      throw new NotFoundError('Acesso de convidado ao quadro');
    }
    await this.prisma.db.$transaction([
      this.prisma.db.whiteboardGuestAccess.delete({ where: { id: access.id } }),
      this.prisma.db.whiteboardGuestSession.deleteMany({ where: { guestId } }),
    ]);
  }
}
