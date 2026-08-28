import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { CrmModule } from '../crm/crm.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  ProjectActivitiesController,
  ClientActivitiesController,
  OpportunityActivitiesController,
  ActivitiesController,
} from './activities.controller';
import { ActivitiesService } from './activities.service';
import { StalledOpportunitiesCron } from './stalled-opportunities.cron';
import { DataRetentionCron } from './data-retention.cron';

@Module({
  // ErpModule para ProjectsService, CrmModule para ClientsService e
  // OpportunitiesService -- só pra validar que o alvo existe e pertence
  // à conta antes de gravar a nota, mesmo padrão do OfficeModule.
  // NotificationsModule é só pros crons (StalledOpportunitiesCron e
  // DataRetentionCron) -- moram aqui (não em CrmModule) porque também
  // precisam de ActivitiesService, e ActivitiesModule → CrmModule já é a
  // única direção sem ciclo (ver comentário nos próprios crons).
  imports: [ErpModule, CrmModule, NotificationsModule],
  controllers: [
    ProjectActivitiesController,
    ClientActivitiesController,
    OpportunityActivitiesController,
    ActivitiesController,
  ],
  providers: [ActivitiesService, StalledOpportunitiesCron, DataRetentionCron],
})
export class ActivitiesModule {}
