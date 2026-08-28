import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CollaboratorPortalController } from './collaborator-portal.controller';
import { CollaboratorPortalService } from './collaborator-portal.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CollaboratorPortalController],
  providers: [CollaboratorPortalService],
})
export class CollaboratorPortalModule {}
