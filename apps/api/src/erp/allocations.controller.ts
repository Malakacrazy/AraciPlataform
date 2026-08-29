import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  AllocationsService,
  allocationInputSchema,
  type AllocationInput,
} from './allocations.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

@Controller('v1/allocations')
export class AllocationsController {
  constructor(private readonly allocationsService: AllocationsService) {}

  // Sem @AdminOnly() aqui -- é a agenda compartilhada do time (tela de
  // planejamento), qualquer staff pode ver quem está alocado onde.
  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
  ) {
    const data = await this.allocationsService.listAllocations(accountId, {
      userId,
      projectId,
    });
    return { data };
  }

  // @AdminOnly() em create/remove -- AllocationsService.createAllocation
  // já documenta o porquê: alocação é decisão de quem gerencia o time,
  // não do próprio colaborador (mesmo espírito de RoleRatesController).
  // Achado real de revisão: faltava aqui, então qualquer staff conseguia
  // reatribuir a semana de outra pessoa pra outro projeto.
  @AdminOnly()
  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(allocationInputSchema)) input: AllocationInput,
  ) {
    const data = await this.allocationsService.createAllocation(
      accountId,
      input,
    );
    return { data };
  }

  @AdminOnly()
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.allocationsService.deleteAllocation(accountId, id);
  }
}
