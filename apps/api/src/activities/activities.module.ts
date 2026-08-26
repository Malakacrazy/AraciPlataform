import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { CrmModule } from '../crm/crm.module';
import {
  ProjectActivitiesController,
  ClientActivitiesController,
  OpportunityActivitiesController,
  ActivitiesController,
} from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  // ErpModule para ProjectsService, CrmModule para ClientsService e
  // OpportunitiesService -- só pra validar que o alvo existe e pertence
  // à conta antes de gravar a nota, mesmo padrão do OfficeModule.
  imports: [ErpModule, CrmModule],
  controllers: [
    ProjectActivitiesController,
    ClientActivitiesController,
    OpportunityActivitiesController,
    ActivitiesController,
  ],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
