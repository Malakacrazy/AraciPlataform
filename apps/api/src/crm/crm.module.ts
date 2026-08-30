import { Module, forwardRef } from '@nestjs/common';
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
  //
  // forwardRef achado NA PRÁTICA (não por precaução): ErpModule passou a
  // importar OfficeModule (NfseService arquiva XML no Drive), e
  // OfficeModule já importava tanto ErpModule quanto CrmModule sem
  // forwardRef nenhum -- isso fecha um ciclo de TRÊS módulos (Erp ->
  // Office -> Crm -> Erp), não só o de dois que erp.module.ts/
  // office.module.ts documentam. `npm run dev` bootando de verdade
  // acusou "UndefinedModuleException: module at index [1] of the
  // OfficeModule imports array is undefined" -- forwardRef só na aresta
  // Erp<->Office não bastava, precisou nesta também.
  imports: [forwardRef(() => ErpModule), NotificationsModule],
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
