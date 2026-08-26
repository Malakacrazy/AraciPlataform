import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresentationModule } from '../presentation/presentation.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

@Module({
  // NotificationsModule pro e-mail do magic link, PresentationModule pra
  // reaproveitar PresentationLinksService (gerar/reaproveitar o link de
  // cada projeto sob demanda em vez de reimplementar essa lógica aqui).
  imports: [NotificationsModule, PresentationModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
