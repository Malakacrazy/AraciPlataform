import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresentationModule } from '../presentation/presentation.module';
import { CrmModule } from '../crm/crm.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

@Module({
  // NotificationsModule pro e-mail do magic link, PresentationModule pra
  // reaproveitar PresentationLinksService (gerar/reaproveitar o link de
  // cada projeto sob demanda em vez de reimplementar essa lógica aqui).
  // CrmModule pra reaproveitar ClientsService.exportClientData na seção
  // "Meus dados" (lacuna da matriz, LGPD) -- mesma lógica de exportação
  // usada pelo painel admin, só autorizada pela sessão do portal em vez
  // de accessLevel.
  imports: [NotificationsModule, PresentationModule, CrmModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
