import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  AccountService,
  accountUpdateSchema,
  type AccountUpdateInput,
} from './account.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  async get(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.accountService.getAccount(accountId);
    return { data };
  }

  @Patch()
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(accountUpdateSchema)) input: AccountUpdateInput,
  ) {
    const data = await this.accountService.updateAccount(accountId, input);
    return { data };
  }
}
