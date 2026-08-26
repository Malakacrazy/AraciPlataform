import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  InvoicesService,
  createInvoiceSchema,
  invoiceStatusUpdateSchema,
  type CreateInvoiceInput,
  type InvoiceStatusUpdate,
} from './invoices.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

// Ação dedicada, como .../approve — só cria fatura para um estágio cujo
// gate já foi aprovado (ver InvoicesService).
@AdminOnly()
@Controller('v1/projects/:projectId/phases/:phaseId/invoice')
export class PhaseInvoiceController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema)) input: CreateInvoiceInput,
  ) {
    const data = await this.invoicesService.createInvoiceForPhase(
      accountId,
      projectId,
      phaseId,
      input,
    );
    return { data };
  }
}

// Sem POST aqui de propósito, mesmo padrão de /projects — uma Invoice só
// nasce via POST .../phases/:phaseId/invoice, que valida o gate aprovado
// antes de criar (ou, no FF&E, via checkout do carrinho).
@AdminOnly()
@Controller('v1/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('projectId') projectId?: string,
  ) {
    const data = await this.invoicesService.listInvoices(accountId, projectId);
    return { data };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.invoicesService.getInvoice(accountId, id);
    return { data };
  }

  @Patch(':id')
  async updateStatus(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(invoiceStatusUpdateSchema))
    input: InvoiceStatusUpdate,
  ) {
    const data = await this.invoicesService.updateInvoiceStatus(
      accountId,
      id,
      input,
    );
    return { data };
  }
}
