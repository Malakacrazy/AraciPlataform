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
  // getLastStalledNotificationAtByOpportunityIds (abaixo) existe pra não
  // mandar o mesmo aviso todo dia enquanto o lead continuar parado -- só
  // reavisa se aconteceu uma Activity nova desde o último aviso.
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
  // not tied to invoice payment". Não emite a NFS-e sozinho -- mesmo que
  // hoje já exista emissão real ligada à fatura (ver
  // NfseService.emitirParaFatura), o pagamento confirmado nunca dispara
  // isso sozinho; só avisa que falta emitir, pra um humano decidir e
  // clicar em "Emitir NFS-e" na tela do projeto.
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

  // Quinto gatilho -- lacuna da matriz (LGPD, "automação de retenção/
  // expurgo"). Mesmo raciocínio de notifyNfseReady: emitir NFS-e sozinho
  // também foi uma decisão deliberada de NUNCA automatizar (ver comentário
  // lá) -- anonimizar um cliente é igualmente irreversível, então este
  // gatilho só avisa um admin sobre o candidato; quem clica em
  // "Anonimizar" (ClientsService.anonymizeClient, já existente na tela do
  // cliente) continua sendo uma pessoa.
  async notifyDataRetentionCandidate(
    accountId: string,
    params: { clientId: string; clientName: string; monthsSinceActivity: number },
  ) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { id: true, email: true },
      });
      if (admins.length === 0) return;

      const title = `${params.clientName}: candidato à retenção de dados (${params.monthsSinceActivity} meses sem atividade)`;
      await this.prisma.db.notification.createMany({
        data: admins.map((admin) => ({
          accountId,
          userId: admin.id,
          type: 'data_retention_candidate',
          title,
          clientId: params.clientId,
        })),
      });

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: title,
        html: `<p>O cliente <strong>${escapeHtml(params.clientName)}</strong> está sem nenhuma atividade (oportunidade aberta, projeto ativo ou nota) há <strong>${params.monthsSinceActivity} meses</strong> — passou do prazo de retenção configurado pra esta conta. Revise e, se fizer sentido, anonimize pela tela do cliente.</p>`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar candidato à retenção de dados: ${(error as Error).message}`);
    }
  }

  // Sexto gatilho -- item da lista de 9 lacunas fiscais da auditoria:
  // renovação do certificado A1 "vira uma tarefa operacional recorrente
  // do estúdio" (decisoes-pos-descoberta.md #4), sem aviso nenhum hoje.
  // O certificado é único por ambiente, não por Account (mesmo
  // comentário já em NfseController) -- CertificateExpiryCron chama isto
  // uma vez por conta encontrada, não por certificado.
  async notifyCertificateExpiring(accountId: string, params: { validTo: Date; daysRemaining: number }) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { id: true, email: true },
      });
      if (admins.length === 0) return;

      const validToStr = params.validTo.toLocaleDateString('pt-BR');
      const title =
        params.daysRemaining >= 0
          ? `Certificado A1 vence em ${params.daysRemaining} dia(s) (${validToStr})`
          : `Certificado A1 venceu há ${Math.abs(params.daysRemaining)} dia(s) (${validToStr})`;
      await this.prisma.db.notification.createMany({
        data: admins.map((admin) => ({
          accountId,
          userId: admin.id,
          type: 'certificate_expiring',
          title,
        })),
      });

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: title,
        html: `<p>O certificado digital A1 usado para emitir NFS-e vence em <strong>${validToStr}</strong>. Renove com antecedência -- sem um certificado válido, nenhuma NFS-e pode ser emitida.</p>`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar vencimento do certificado A1: ${(error as Error).message}`);
    }
  }

  // Sétimo gatilho -- lacuna da matriz (gestão documental por projeto),
  // achado da auditoria: "hoje o link apodrece em silêncio" quando um
  // arquivo é movido/renomeado/excluído no Drive. Disparado só na
  // transição pra quebrado (BrokenLinkCheckCron só chama isto pra quem
  // não tinha brokenAt antes) -- não reavisa toda semana enquanto
  // continuar quebrado, ninguém precisa do mesmo aviso repetido.
  async notifyBrokenOfficeLink(
    accountId: string,
    params: { officeLinkTitle: string; projectId?: string; projectName: string | null },
  ) {
    try {
      const admins = await this.prisma.db.user.findMany({
        where: { accountId, accessLevel: 'admin' },
        select: { id: true, email: true },
      });
      if (admins.length === 0) return;

      const title = params.projectName
        ? `${params.projectName}: vínculo "${params.officeLinkTitle}" quebrado no Drive`
        : `Vínculo "${params.officeLinkTitle}" quebrado no Drive`;
      await this.prisma.db.notification.createMany({
        data: admins.map((admin) => ({
          accountId,
          userId: admin.id,
          type: 'broken_office_link',
          title,
          projectId: params.projectId,
        })),
      });

      await sendEmail({
        to: admins.map((a) => a.email),
        subject: title,
        html: `<p>O vínculo <strong>${escapeHtml(params.officeLinkTitle)}</strong> não é mais acessível no Drive (arquivo movido, renomeado ou excluído). Revise e vincule de novo se ainda fizer sentido.</p>`,
      });
    } catch (error) {
      this.logger.warn(`Falha ao notificar vínculo quebrado: ${(error as Error).message}`);
    }
  }

  // Mesmo espírito de ActivitiesService.getLastActivityAtByOpportunityIds
  // -- usado só por StalledOpportunitiesCron, uma consulta pra todas as
  // oportunidades candidatas em vez de uma chamada a hasRecentNotification
  // por oportunidade dentro do loop (achado "Médio" da auditoria).
  async getLastStalledNotificationAtByOpportunityIds(opportunityIds: string[]): Promise<Map<string, Date>> {
    if (opportunityIds.length === 0) return new Map();
    const rows = await this.prisma.db.notification.findMany({
      where: { type: 'stalled_opportunity', opportunityId: { in: opportunityIds } },
      orderBy: { createdAt: 'desc' },
      select: { opportunityId: true, createdAt: true },
    });
    const lastNotifiedAt = new Map<string, Date>();
    for (const row of rows) {
      if (row.opportunityId && !lastNotifiedAt.has(row.opportunityId)) {
        lastNotifiedAt.set(row.opportunityId, row.createdAt);
      }
    }
    return lastNotifiedAt;
  }

  // Mesmo espírito do método acima, só que pro terceiro gatilho baseado em
  // ausência (DataRetentionCron) -- só reavisa se a última atividade do
  // cliente for mais recente que o último aviso (mesmo critério de
  // StalledOpportunitiesCron), evitando reenviar o mesmo aviso toda semana
  // enquanto o cliente continuar parado do mesmo jeito.
  async getLastNotifiedAtByClientIds(clientIds: string[]): Promise<Map<string, Date>> {
    if (clientIds.length === 0) return new Map();
    const rows = await this.prisma.db.notification.findMany({
      where: { type: 'data_retention_candidate', clientId: { in: clientIds } },
      orderBy: { createdAt: 'desc' },
      select: { clientId: true, createdAt: true },
    });
    const lastNotifiedAt = new Map<string, Date>();
    for (const row of rows) {
      if (row.clientId && !lastNotifiedAt.has(row.clientId)) {
        lastNotifiedAt.set(row.clientId, row.createdAt);
      }
    }
    return lastNotifiedAt;
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
