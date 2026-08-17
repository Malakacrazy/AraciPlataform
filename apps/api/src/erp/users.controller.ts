import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  UsersService,
  userUpdateSchema,
  type UserUpdateInput,
} from './users.service';
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
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
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

  // Chave de API para a extensão Captura (ver AuthGuard) -- devolvida em
  // texto puro só nesta resposta; a partir daqui só o hash sobrevive no
  // banco, então perder a resposta significa regenerar, não recuperar.
  @Post(':id/api-key')
  @HttpCode(201)
  async generateApiKey(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const apiKey = await this.usersService.generateApiKey(accountId, id);
    return { data: { apiKey } };
  }

  @Delete(':id/api-key')
  @HttpCode(204)
  async revokeApiKey(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.usersService.revokeApiKey(accountId, id);
  }
}
