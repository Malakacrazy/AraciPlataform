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

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkStalledOpportunities() {
    const open = await this.opportunitiesService.listOpenOpportunities();
    const now = Date.now();

    for (const opportunity of open) {
      const accountId = opportunity.client.accountId;
      const activities = await this.activitiesService.listForOpportunity(accountId, opportunity.id);
      const lastTouch = activities[0]?.createdAt ?? opportunity.createdAt;
      const daysSinceContact = Math.floor((now - lastTouch.getTime()) / MS_PER_DAY);

      if (daysSinceContact < STALE_AFTER_DAYS) continue;

      const alreadyNotified = await this.notificationsService.hasRecentNotification(
        accountId,
        opportunity.id,
        'stalled_opportunity',
        lastTouch,
      );
      if (alreadyNotified) continue;

      await this.notificationsService.notifyStalledOpportunity(accountId, {
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        daysSinceContact,
      });
    }

    this.logger.log(`Checagem de oportunidades paradas concluída — ${open.length} oportunidade(s) em aberto avaliada(s).`);
  }
}
