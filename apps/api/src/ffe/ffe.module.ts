import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { ProductsController, ProductImagesController } from './products.controller';
import { ProductsService } from './products.service';
import { ProjectAreasController, AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import {
  AreaSpecificationsController,
  SpecificationsController,
  FfeCheckoutController,
} from './specifications.controller';
import { SpecificationsService } from './specifications.service';
import { ProjectMoodboardsController, MoodboardsController } from './moodboards.controller';
import { MoodboardsService } from './moodboards.service';
import { WhiteboardGuestsController } from './whiteboard-guests.controller';
import { WhiteboardGuestsService } from './whiteboard-guests.service';

@Module({
  imports: [ErpModule], // AreasService/SpecificationsService/MoodboardsService precisam de ProjectsService
  controllers: [
    ProductsController,
    ProductImagesController,
    ProjectAreasController,
    AreasController,
    AreaSpecificationsController,
    SpecificationsController,
    FfeCheckoutController,
    ProjectMoodboardsController,
    MoodboardsController,
    WhiteboardGuestsController,
  ],
  providers: [
    ProductsService,
    AreasService,
    SpecificationsService,
    MoodboardsService,
    WhiteboardGuestsService,
  ],
  exports: [SpecificationsService, MoodboardsService],
})
export class FfeModule {}
