import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  RoleRatesService,
  roleRateInputSchema,
  type RoleRateInput,
} from './role-rates.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/role-rates')
export class RoleRatesController {
  constructor(private readonly roleRatesService: RoleRatesService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.roleRatesService.listRoleRates(accountId);
    return { data };
  }

  // Upsert por role — reenviar o mesmo papel com nova tarifa atualiza em
  // vez de duplicar (RoleRate tem @@unique([accountId, role])).
  @Post()
  @HttpCode(201)
  async upsert(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(roleRateInputSchema)) input: RoleRateInput,
  ) {
    const data = await this.roleRatesService.upsertRoleRate(accountId, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.roleRatesService.deleteRoleRate(accountId, id);
  }
}
