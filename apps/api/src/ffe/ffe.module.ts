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
import {
  ProjectMoodboardsController,
  MoodboardsController,
  MoodboardItemsController,
} from './moodboards.controller';
import { MoodboardsService } from './moodboards.service';

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
    MoodboardItemsController,
  ],
  providers: [
    ProductsService,
    AreasService,
    SpecificationsService,
    MoodboardsService,
  ],
  exports: [SpecificationsService, MoodboardsService],
})
export class FfeModule {}
