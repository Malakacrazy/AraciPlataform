import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresentationLinksController } from './presentation-links.controller';
import { PresentationLinksService } from './presentation-links.service';
import { PublicPresentationController } from './public-presentation.controller';
import { PublicPresentationService } from './public-presentation.service';

@Module({
  // ErpModule para ProjectsService (PresentationLinksService), Notifications
  // para avisar a equipe quando o cliente aprova algo pelo link público.
  imports: [ErpModule, NotificationsModule],
  controllers: [PresentationLinksController, PublicPresentationController],
  providers: [PresentationLinksService, PublicPresentationService],
  exports: [PresentationLinksService],
})
export class PresentationModule {}
