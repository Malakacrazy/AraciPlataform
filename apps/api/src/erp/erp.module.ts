import { Module, forwardRef } from '@nestjs/common';
import { OfficeModule } from '../office/office.module';
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
import { RequiredDocumentTypesController } from './required-document-types.controller';
import { RequiredDocumentTypesService } from './required-document-types.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule é só pro CertificateExpiryCron -- sem risco de
  // ciclo, NotificationsModule não importa nada (ver seu próprio arquivo).
  // OfficeModule é pro NfseService arquivar o XML assinado no Drive (ver
  // GoogleDriveService.archiveFiscalXml) -- forwardRef porque OfficeModule
  // já importa ErpModule (por ProjectsService, ver office.module.ts), e
  // Nest não resolve import circular de módulo sem isso. Não é ciclo de
  // PROVIDER: GoogleDriveService não depende de nada do ErpModule, só
  // NfseService (aqui) passa a depender de GoogleDriveService (lá) --
  // por isso não precisa de @Inject(forwardRef(...)) no construtor do
  // NfseService, só aqui no import do módulo.
  imports: [NotificationsModule, forwardRef(() => OfficeModule)],
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
    RequiredDocumentTypesController,
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
    RequiredDocumentTypesService,
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
