import { Module, forwardRef } from '@nestjs/common';
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
  // NotificationsModule é só pro BrokenLinkCheckCron. forwardRef nos
  // dois (Erp e Crm): ErpModule passou a importar OfficeModule de volta
  // (NfseService arquiva XML fiscal no Drive), o que fecha um ciclo de
  // TRÊS módulos com o CrmModule no meio (Erp -> Office -> Crm -> Erp),
  // não só a aresta direta Erp<->Office -- ver o comentário em
  // crm.module.ts pro erro real de boot que isso causou sem o forwardRef
  // aqui também.
  imports: [forwardRef(() => ErpModule), forwardRef(() => CrmModule), NotificationsModule],
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
  // GoogleDriveService pro PresentationModule -- documentos visíveis ao
  // cliente no link de apresentação (ver PublicPresentationService).
  exports: [GoogleDriveService],
})
export class OfficeModule {}
