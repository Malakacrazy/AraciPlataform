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
  // e-mail (ou de gravar o sino) derrubar a aprovação em si, que é a ação
  // real do cliente e já foi persistida antes desta chamada -- só loga e
  // segue.
  async notifySpecificationApproved(
    accountId: string,
    params: { projectId: string; projectName: string; productName: string; clientComment?: string | null },
  ) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { id: true, email: true },
      });
      if (admins.length === 0) return;

      const title = `${params.projectName}: item aprovado pelo cliente`;
      await this.prisma.db.notification.createMany({
        data: admins.map((admin) => ({
          accountId,
          userId: admin.id,
          type: 'specification_approved',
          title,
          body: params.clientComment ?? null,
          projectId: params.projectId,
        })),
      });

      const commentHtml = params.clientComment
        ? `<p><strong>Comentário do cliente:</strong> ${escapeHtml(params.clientComment)}</p>`
        : '';

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: title,
        html: `<p>O cliente aprovou <strong>${escapeHtml(params.productName)}</strong> no projeto <strong>${escapeHtml(params.projectName)}</strong>.</p>${commentHtml}`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar aprovação de especificação: ${(error as Error).message}`);
    }
  }

  // Segundo gatilho real -- achado da mesma auditoria: "no notification to
  // the studio when a client actually opens or approves something"
  // também valia pra proposta assinada, não só especificação aprovada.
  // Mesma filosofia de nunca deixar uma falha de e-mail/sino derrubar a
  // assinatura em si, que já foi persistida antes desta chamada.
  async notifyProposalSigned(
    accountId: string,
    params: { opportunityId: string; opportunityTitle: string; signerName: string; value: string },
  ) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { id: true, email: true },
      });
      if (admins.length === 0) return;

      const title = `${params.opportunityTitle}: proposta assinada`;
      const body = `Assinado por ${params.signerName} — R$ ${params.value}`;
      await this.prisma.db.notification.createMany({
        data: admins.map((admin) => ({
          accountId,
          userId: admin.id,
          type: 'proposal_signed',
          title,
          body,
          opportunityId: params.opportunityId,
        })),
      });

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: title,
        html: `<p><strong>${escapeHtml(params.signerName)}</strong> assinou a proposta de <strong>${escapeHtml(params.opportunityTitle)}</strong> no valor de R$ ${escapeHtml(params.value)}.</p>`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar proposta assinada: ${(error as Error).message}`);
    }
  }

  // Terceiro gatilho -- diferente dos dois acima, não nasce de uma ação
  // que já aconteceu (cliente aprovou/assinou algo); nasce da AUSÊNCIA de
  // ação, detectada pelo StalledOpportunitiesCron (ver activities/).
  // hasRecentNotification existe pra não mandar o mesmo aviso todo dia
  // enquanto o lead continuar parado -- só reavisa se aconteceu uma
  // Activity nova desde o último aviso (o cron recalcula "última
  // interação" e só chama isto quando ela é mais recente que a
  // notificação anterior).
  async notifyStalledOpportunity(
    accountId: string,
    params: { opportunityId: string; opportunityTitle: string; daysSinceContact: number },
  ) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { id: true, email: true },
      });
      if (admins.length === 0) return;

      const title = `${params.opportunityTitle}: sem contato há ${params.daysSinceContact} dias`;
      await this.prisma.db.notification.createMany({
        data: admins.map((admin) => ({
          accountId,
          userId: admin.id,
          type: 'stalled_opportunity',
          title,
          opportunityId: params.opportunityId,
        })),
      });

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: title,
        html: `<p>A oportunidade <strong>${escapeHtml(params.opportunityTitle)}</strong> está sem nenhum contato registrado há <strong>${params.daysSinceContact} dias</strong>. Vale um follow-up.</p>`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar oportunidade parada: ${(error as Error).message}`);
    }
  }

  // Quarto gatilho -- achado da auditoria: "Emission is a manual trigger,
  // not tied to invoice payment". Não emite a NFS-e sozinho (ver
  // decisoes-pos-descoberta.md #4 e nfse-client.ts: emissão real em
  // Produção é uma decisão de código deliberada, nunca automática) — só
  // avisa que o pagamento confirmado deixou uma fatura sem NFS-e, pra um
  // humano revisar e emitir pela tela (POST/PATCH .../invoices/:id já
  // existente).
  async notifyNfseReady(
    accountId: string,
    params: { projectId: string; projectName: string; amount: string },
  ) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { id: true, email: true },
      });
      if (admins.length === 0) return;

      const title = `${params.projectName}: pagamento confirmado, falta emitir NFS-e`;
      const body = `R$ ${params.amount}`;
      await this.prisma.db.notification.createMany({
        data: admins.map((admin) => ({
          accountId,
          userId: admin.id,
          type: 'nfse_ready',
          title,
          body,
          projectId: params.projectId,
        })),
      });

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: title,
        html: `<p>O pagamento da fatura de <strong>${escapeHtml(params.projectName)}</strong> (R$ ${escapeHtml(params.amount)}) foi confirmado e ainda não tem NFS-e emitida.</p>`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar NFS-e pendente: ${(error as Error).message}`);
    }
  }

  async hasRecentNotification(accountId: string, opportunityId: string, type: string, since: Date) {
    const existing = await this.prisma.db.notification.findFirst({
      where: { accountId, opportunityId, type, createdAt: { gte: since } },
      select: { id: true },
    });
    return existing !== null;
  }

  // Sino da Nav (apps/web) -- contraparte visual do e-mail acima. Só as
  // últimas 20 pra não crescer sem limite na resposta; marcar como lida
  // não apaga, só seta readAt (histórico continua consultável se um dia
  // precisar).
  listForUser(accountId: string, userId: string) {
    return this.prisma.db.notification.findMany({
      where: { accountId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  countUnread(accountId: string, userId: string) {
    return this.prisma.db.notification.count({
      where: { accountId, userId, readAt: null },
    });
  }

  async markRead(accountId: string, userId: string, id: string) {
    await this.prisma.db.notification.updateMany({
      where: { id, accountId, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(accountId: string, userId: string) {
    await this.prisma.db.notification.updateMany({
      where: { accountId, userId, readAt: null },
      data: { readAt: new Date() },
    });
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
