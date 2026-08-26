import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { RoleRatesController } from './role-rates.controller';
import { RoleRatesService } from './role-rates.service';

@Module({
  imports: [ErpModule], // OpportunitiesService precisa de ProjectsService (conversão automática)
  controllers: [
    ClientsController,
    OpportunitiesController,
    ProposalsController,
    RoleRatesController,
  ],
  providers: [
    ClientsService,
    OpportunitiesService,
    ProposalsService,
    RoleRatesService,
  ],
  exports: [ClientsService, OpportunitiesService],
})
export class CrmModule {}
