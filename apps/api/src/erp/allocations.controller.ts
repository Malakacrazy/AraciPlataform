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

  // Mesmo redactCost de UsersController -- achado real de revisão: esta
  // lista embute o User inteiro (alloc.user), então costPerHour vazava
  // pra qualquer staff mesmo já sendo removido em /v1/users. create/
  // remove não precisam disto (já são @AdminOnly() abaixo).
  // Achado A47 da auditoria de 30 ago 2026: o mesmo include também
  // vazava apiKeyHash (o redactCost original só tratava costPerHour) --
  // redigido pra todo mundo, não só quem não é admin, porque não há
  // motivo nenhum pra hash de chave de API atravessar esta tela pra
  // ninguém (diferente de costPerHour, que admin legitimamente vê aqui).
  private redactCost<T extends { user?: { costPerHour?: unknown; apiKeyHash?: unknown } }>(alloc: T, accessLevel: string): T {
    if (!alloc.user) return alloc;
    const user = accessLevel === 'admin' ? alloc.user : { ...alloc.user, costPerHour: undefined };
    return { ...alloc, user: { ...user, apiKeyHash: undefined } };
  }

  // Sem @AdminOnly() aqui -- é a agenda compartilhada do time (tela de
  // planejamento), qualquer staff pode ver quem está alocado onde. O
  // custo/hora em si continua redigido pra quem não é admin (redactCost).
  @Get()
  async list(
    @SessionAccount() { accountId, accessLevel }: SessionAccountType,
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
  ) {
    const data = await this.allocationsService.listAllocations(accountId, {
      userId,
      projectId,
    });
    return { data: data.map((a) => this.redactCost(a, accessLevel)) };
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
