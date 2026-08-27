import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  StudioFixedCostsService,
  createStudioFixedCostSchema,
  type CreateStudioFixedCostInput,
} from './studio-fixed-costs.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

// Admin-only, mesmo padrão de ExpensesController -- é dado de custo do
// estúdio, staff não deveria ver de qualquer jeito (ver User.accessLevel).
// Sem PATCH: corrigir um item é remover e recriar (mesmo espírito de
// RoleRatesController, onde o upsert já cobre o caso de "atualizar" via
// reenvio -- aqui a chave não é única por descrição, então recriar é mais
// simples que decidir semântica de "qual campo mudou").
@AdminOnly()
@Controller('v1/studio-fixed-costs')
export class StudioFixedCostsController {
  constructor(private readonly studioFixedCostsService: StudioFixedCostsService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.studioFixedCostsService.listFixedCosts(accountId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(createStudioFixedCostSchema)) input: CreateStudioFixedCostInput,
  ) {
    const data = await this.studioFixedCostsService.createFixedCost(accountId, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.studioFixedCostsService.deleteFixedCost(accountId, id);
  }
}
