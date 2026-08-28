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
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ProjectTasksController, PhaseTasksController, TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import { ProjectMembersController } from './project-members.controller';
import { ProjectMembersService } from './project-members.service';
import { AllocationsController } from './allocations.controller';
import { AllocationsService } from './allocations.service';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { FiscalController } from './fiscal/fiscal.controller';
import { FiscalService } from './fiscal/fiscal.service';
import { NfseController } from './fiscal/nfse.controller';
import { NfseService } from './fiscal/nfse.service';
import { CertificateExpiryCron } from './fiscal/certificate-expiry.cron';
import { RoleRatesController } from './role-rates.controller';
import { RoleRatesService } from './role-rates.service';
import { StudioFixedCostsController } from './studio-fixed-costs.controller';
import { StudioFixedCostsService } from './studio-fixed-costs.service';
import { ProjectCollaboratorsController } from './collaborators.controller';
import { CollaboratorsService } from './collaborators.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule é só pro CertificateExpiryCron -- sem risco de
  // ciclo, NotificationsModule não importa nada (ver seu próprio arquivo).
  imports: [NotificationsModule],
  controllers: [
    ProjectsController,
    UsersController,
    PhasesController,
    PhaseInvoiceController,
    InvoicesController,
    ExpensesController,
    ProjectTasksController,
    PhaseTasksController,
    TasksController,
    TimeEntriesController,
    ProjectMembersController,
    AllocationsController,
    AbsencesController,
    AccountController,
    FiscalController,
    NfseController,
    RoleRatesController,
    StudioFixedCostsController,
    ProjectCollaboratorsController,
  ],
  providers: [
    ProjectsService,
    UsersService,
    PhasesService,
    InvoicesService,
    ExpensesService,
    TasksService,
    TimeEntriesService,
    ProjectMembersService,
    AllocationsService,
    AbsencesService,
    AccountService,
    FiscalService,
    NfseService,
    CertificateExpiryCron,
    RoleRatesService,
    StudioFixedCostsService,
    CollaboratorsService,
  ],
  // ProjectsService/UsersService são usados por CrmModule (conversão de
  // oportunidade ganha em projeto) e por FfeModule (checkout do carrinho).
  // RoleRatesService mudou de módulo (era CrmModule) porque InvoicesService
  // agora precisa dela pra faturar hora_tecnica por hora apontada — CrmModule
  // já importa ErpModule, então movida pra cá evita depender na direção
  // contrária (ProposalsService injeta RoleRatesService de volta).
  exports: [ProjectsService, UsersService, RoleRatesService],
})
export class ErpModule {}
