import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UsersService, userUpdateSchema, type UserUpdateInput } from './users.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// Sem POST: um User só nasce via login SSO (AuthService.ensureAccountAndUser).
@Controller('v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.usersService.listUsers(accountId);
    return { data };
  }

  @Get(':id')
  async get(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
    const data = await this.usersService.getUser(accountId, id);
    return { data };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) input: UserUpdateInput,
  ) {
    const data = await this.usersService.updateUser(accountId, id, input);
    return { data };
  }
}
