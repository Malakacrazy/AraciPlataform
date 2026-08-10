import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { CrmModule } from '../crm/crm.module';
import {
  ProjectOfficeLinksController,
  ClientOfficeLinksController,
  OfficeLinksController,
} from './office-links.controller';
import { OfficeLinksService } from './office-links.service';

@Module({
  // ErpModule para ProjectsService, CrmModule para ClientsService — só
  // pra validar que o Project/Client alvo existe e pertence à conta antes
  // de gravar o vínculo, mesmo padrão de AreasService/PhasesService.
  imports: [ErpModule, CrmModule],
  controllers: [
    ProjectOfficeLinksController,
    ClientOfficeLinksController,
    OfficeLinksController,
  ],
  providers: [OfficeLinksService],
})
export class OfficeModule {}
