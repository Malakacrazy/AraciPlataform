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
import { AllocationsController } from './allocations.controller';
import { AllocationsService } from './allocations.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { FiscalController } from './fiscal/fiscal.controller';
import { FiscalService } from './fiscal/fiscal.service';

@Module({
  controllers: [
    ProjectsController,
    UsersController,
    PhasesController,
    PhaseInvoiceController,
    InvoicesController,
    TimeEntriesController,
    ProjectMembersController,
    AllocationsController,
    AccountController,
    FiscalController,
  ],
  providers: [
    ProjectsService,
    UsersService,
    PhasesService,
    InvoicesService,
    TimeEntriesService,
    ProjectMembersService,
    AllocationsService,
    AccountService,
    FiscalService,
  ],
  // ProjectsService/UsersService são usados por CrmModule (conversão de
  // oportunidade ganha em projeto) e por FfeModule (checkout do carrinho)
  // — precisam ser exportados para outros módulos injetarem via DI.
  exports: [ProjectsService, UsersService],
})
export class ErpModule {}
