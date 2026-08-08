import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProjectAreasController, AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import {
  AreaSpecificationsController,
  SpecificationsController,
  FfeCheckoutController,
} from './specifications.controller';
import { SpecificationsService } from './specifications.service';

@Module({
  imports: [ErpModule], // AreasService/SpecificationsService precisam de ProjectsService
  controllers: [
    ProductsController,
    ProjectAreasController,
    AreasController,
    AreaSpecificationsController,
    SpecificationsController,
    FfeCheckoutController,
  ],
  providers: [ProductsService, AreasService, SpecificationsService],
})
export class FfeModule {}
