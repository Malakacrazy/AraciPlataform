import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ExpensesService,
  createExpenseSchema,
  expenseStatusUpdateSchema,
  type CreateExpenseInput,
  type ExpenseStatusUpdate,
} from './expenses.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

// Admin-only, mesmo padrão de InvoicesController -- é dado de custo do
// estúdio, staff não deveria ver de qualquer jeito (ver User.accessLevel).
@AdminOnly()
@Controller('v1/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('projectId') projectId?: string,
  ) {
    const data = await this.expensesService.listExpenses(accountId, projectId);
    return { data };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.expensesService.getExpense(accountId, id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(createExpenseSchema)) input: CreateExpenseInput,
  ) {
    const data = await this.expensesService.createExpense(accountId, input);
    return { data };
  }

  @Patch(':id')
  async updateStatus(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(expenseStatusUpdateSchema)) input: ExpenseStatusUpdate,
  ) {
    const data = await this.expensesService.updateExpenseStatus(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.expensesService.deleteExpense(accountId, id);
  }
}
