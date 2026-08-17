import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { PresentationLinksController } from './presentation-links.controller';
import { PresentationLinksService } from './presentation-links.service';
import { PublicPresentationController } from './public-presentation.controller';
import { PublicPresentationService } from './public-presentation.service';

@Module({
  imports: [ErpModule], // PresentationLinksService precisa de ProjectsService
  controllers: [PresentationLinksController, PublicPresentationController],
  providers: [PresentationLinksService, PublicPresentationService],
})
export class PresentationModule {}
