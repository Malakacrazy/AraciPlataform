import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sendEmail } from './resend-client';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Primeiro gatilho real de notificação da plataforma -- antes disso,
  // nada avisava a equipe quando um cliente de fato aprovava algo pelo
  // link de apresentação (achado da auditoria). Nunca deixa uma falha de
  // e-mail derrubar a aprovação em si, que é a ação real do cliente e
  // já foi persistida antes desta chamada -- só loga e segue.
  async notifySpecificationApproved(
    accountId: string,
    params: { projectName: string; productName: string; clientComment?: string | null },
  ) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { email: true },
      });
      if (admins.length === 0) return;

      const commentHtml = params.clientComment
        ? `<p><strong>Comentário do cliente:</strong> ${escapeHtml(params.clientComment)}</p>`
        : '';

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: `${params.projectName}: item aprovado pelo cliente`,
        html: `<p>O cliente aprovou <strong>${escapeHtml(params.productName)}</strong> no projeto <strong>${escapeHtml(params.projectName)}</strong>.</p>${commentHtml}`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar aprovação de especificação: ${(error as Error).message}`);
    }
  }

  // Diferente de notifySpecificationApproved acima: aqui o e-mail É a
  // ação (sem ele, o cliente simplesmente não consegue entrar), então o
  // erro não é engolido -- propaga pra quem chamou decidir. O chamador
  // (ClientPortalService.requestMagicLink) ainda devolve a mesma
  // resposta genérica pro cliente independente de sucesso, pra não
  // vazar se aquele e-mail está cadastrado ou não.
  async sendClientMagicLink(to: string, clientName: string, link: string) {
    await sendEmail({
      to: [to],
      subject: 'Seu link de acesso — Studio Araci',
      html: `<p>Olá, ${escapeHtml(clientName)}.</p><p>Clique no link abaixo para acessar seus projetos. Válido por 15 minutos.</p><p><a href="${link}">${link}</a></p>`,
    });
  }
}
