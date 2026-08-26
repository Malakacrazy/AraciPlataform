import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalSigningService } from './proposal-signing.service';
import { ZapSignWebhookController } from './zapsign-webhook.controller';
import { RoleRatesController } from './role-rates.controller';
import { RoleRatesService } from './role-rates.service';

@Module({
  // ErpModule para ProjectsService (OpportunitiesService, conversão
  // automática); NotificationsModule para avisar a equipe quando o
  // cliente assina uma proposta via ZapSign.
  imports: [ErpModule, NotificationsModule],
  controllers: [
    ClientsController,
    OpportunitiesController,
    ProposalsController,
    ZapSignWebhookController,
    RoleRatesController,
  ],
  providers: [
    ClientsService,
    OpportunitiesService,
    ProposalsService,
    ProposalSigningService,
    RoleRatesService,
  ],
  exports: [ClientsService, OpportunitiesService],
})
export class CrmModule {}
