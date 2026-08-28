import { Module } from '@nestjs/common';
import { FfeModule } from '../ffe/ffe.module';
import { WhiteboardGuestPortalController } from './whiteboard-guest-portal.controller';
import { WhiteboardGuestPortalService } from './whiteboard-guest-portal.service';

@Module({
  imports: [FfeModule], // MoodboardsService (snapshot/comments)
  controllers: [WhiteboardGuestPortalController],
  providers: [WhiteboardGuestPortalService],
})
export class WhiteboardGuestPortalModule {}
