import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OfficeModule } from '../office/office.module';
import { FfeModule } from '../ffe/ffe.module';
import { PresentationLinksController } from './presentation-links.controller';
import { PresentationLinksService } from './presentation-links.service';
import { PublicPresentationController } from './public-presentation.controller';
import { PublicPresentationService } from './public-presentation.service';

@Module({
  // ErpModule para ProjectsService (PresentationLinksService), Notifications
  // para avisar a equipe quando o cliente aprova algo pelo link público,
  // OfficeModule para GoogleDriveService (documentos visíveis ao cliente),
  // FfeModule para MoodboardsService (quadro tldraw + chat, ver
  // PublicPresentationService).
  imports: [ErpModule, NotificationsModule, OfficeModule, FfeModule],
  controllers: [PresentationLinksController, PublicPresentationController],
  providers: [PresentationLinksService, PublicPresentationService],
  exports: [PresentationLinksService],
})
export class PresentationModule {}
