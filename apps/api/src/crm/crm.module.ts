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
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  // ErpModule para ProjectsService (OpportunitiesService, conversão
  // automática) e RoleRatesService (ProposalsService — RoleRatesService
  // mudou pra ErpModule quando InvoicesService passou a precisar dela;
  // ver comentário em erp.module.ts); NotificationsModule para avisar a
  // equipe quando o cliente assina uma proposta via ZapSign.
  imports: [ErpModule, NotificationsModule],
  controllers: [
    ClientsController,
    OpportunitiesController,
    ProposalsController,
    ZapSignWebhookController,
    LeadsController,
  ],
  providers: [
    ClientsService,
    OpportunitiesService,
    ProposalsService,
    ProposalSigningService,
    LeadsService,
  ],
  exports: [ClientsService, OpportunitiesService],
})
export class CrmModule {}
