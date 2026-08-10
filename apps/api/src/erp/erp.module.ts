import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PhasesController } from './phases.controller';
import { PhasesService } from './phases.service';
import {
  InvoicesController,
  PhaseInvoiceController,
} from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import { ProjectMembersController } from './project-members.controller';
import { ProjectMembersService } from './project-members.service';

@Module({
  controllers: [
    ProjectsController,
    UsersController,
    PhasesController,
    PhaseInvoiceController,
    InvoicesController,
    TimeEntriesController,
    ProjectMembersController,
  ],
  providers: [
    ProjectsService,
    UsersService,
    PhasesService,
    InvoicesService,
    TimeEntriesService,
    ProjectMembersService,
  ],
  // ProjectsService/UsersService são usados por CrmModule (conversão de
  // oportunidade ganha em projeto) e por FfeModule (checkout do carrinho)
  // — precisam ser exportados para outros módulos injetarem via DI.
  exports: [ProjectsService, UsersService],
})
export class ErpModule {}
