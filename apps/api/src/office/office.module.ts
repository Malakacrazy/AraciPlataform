import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { CrmModule } from '../crm/crm.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  ProjectOfficeLinksController,
  ClientOfficeLinksController,
  OfficeLinksController,
} from './office-links.controller';
import { OfficeLinksService } from './office-links.service';
import { GoogleCredentialsController } from './google-credentials.controller';
import { GoogleCredentialsService } from './google-credentials.service';
import { ProjectDriveFoldersController, OfficeLinksBrokenCheckController } from './google-drive.controller';
import { GoogleDriveService } from './google-drive.service';
import { DRIVE_CLIENT, GoogleDriveApiClient } from './google-drive-client';
import { BrokenLinkCheckCron } from './broken-link-check.cron';

@Module({
  // ErpModule para ProjectsService, CrmModule para ClientsService — só
  // pra validar que o Project/Client alvo existe e pertence à conta antes
  // de gravar o vínculo, mesmo padrão de AreasService/PhasesService.
  // NotificationsModule é só pro BrokenLinkCheckCron.
  imports: [ErpModule, CrmModule, NotificationsModule],
  controllers: [
    ProjectOfficeLinksController,
    ClientOfficeLinksController,
    OfficeLinksController,
    GoogleCredentialsController,
    ProjectDriveFoldersController,
    OfficeLinksBrokenCheckController,
  ],
  providers: [
    OfficeLinksService,
    GoogleCredentialsService,
    GoogleDriveService,
    BrokenLinkCheckCron,
    // Implementação real da porta DriveClient -- google-drive.service.spec.ts
    // injeta uma fake no lugar deste provider, sem chamar o Google.
    { provide: DRIVE_CLIENT, useClass: GoogleDriveApiClient },
  ],
})
export class OfficeModule {}
