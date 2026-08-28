import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpportunitiesService } from '../crm/opportunities.service';
import { ActivitiesService } from './activities.service';
import { NotificationsService } from '../notifications/notifications.service';

const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Achado da auditoria: "No follow-up automation for a lead sitting
// untouched for two weeks." Primeiro job em background da plataforma —
// mora aqui (não em CrmModule, dono de Opportunity) porque precisa ler
// Activity, dono de ActivitiesModule, e ActivitiesModule já importa
// CrmModule (não dá pra fazer o caminho inverso sem import circular —
// mesmo tipo de restrição que já moveu RoleRatesService de módulo antes
// nesta fase). "Última interação" é a Activity mais recente da
// oportunidade, ou a própria criação se nunca teve nenhuma.
@Injectable()
export class StalledOpportunitiesCron {
  private readonly logger = new Logger(StalledOpportunitiesCron.name);

  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Achado "Médio" da auditoria: versão anterior fazia um for...of com
  // await por dentro -- listForOpportunity (que revalida a oportunidade
  // via getOpportunity) + uma checagem de notificação recente,
  // sequencial, sem limite, pra CADA oportunidade aberta de TODAS as
  // contas. Reescrito em 2
  // consultas em lote (última atividade e última notificação por
  // oportunidade) mais o envio em paralelo só pra quem de fato precisa de
  // aviso -- de N×3 idas sequenciais ao banco para 2 idas em lote + M
  // envios em paralelo, M sendo só as oportunidades realmente paradas e
  // ainda não avisadas (sempre ≤ N, tipicamente bem menor).
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkStalledOpportunities() {
    const open = await this.opportunitiesService.listOpenOpportunities();
    const now = Date.now();

    const lastActivityAt = await this.activitiesService.getLastActivityAtByOpportunityIds(
      open.map((o) => o.id),
    );

    const stalled = open
      .map((opportunity) => {
        const lastTouch = lastActivityAt.get(opportunity.id) ?? opportunity.createdAt;
        const daysSinceContact = Math.floor((now - lastTouch.getTime()) / MS_PER_DAY);
        return { opportunity, lastTouch, daysSinceContact };
      })
      .filter((entry) => entry.daysSinceContact >= STALE_AFTER_DAYS);

    const lastNotifiedAt = await this.notificationsService.getLastStalledNotificationAtByOpportunityIds(
      stalled.map((entry) => entry.opportunity.id),
    );

    // Só reavisa se a última interação é mais recente que o último aviso
    // -- mesmo critério de antes (hasRecentNotification com since:
    // lastTouch), só que comparado em memória contra o lote já buscado.
    const toNotify = stalled.filter((entry) => {
      const notifiedAt = lastNotifiedAt.get(entry.opportunity.id);
      return !notifiedAt || notifiedAt < entry.lastTouch;
    });

    await Promise.all(
      toNotify.map((entry) =>
        this.notificationsService.notifyStalledOpportunity(entry.opportunity.client.accountId, {
          opportunityId: entry.opportunity.id,
          opportunityTitle: entry.opportunity.title,
          daysSinceContact: entry.daysSinceContact,
        }),
      ),
    );

    this.logger.log(
      `Checagem de oportunidades paradas concluída — ${open.length} oportunidade(s) em aberto avaliada(s), ${toNotify.length} notificada(s).`,
    );
  }
}
