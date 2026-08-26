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

  // costPerHour some da resposta pra quem não é admin -- staff ainda
  // precisa listar colegas pra timesheet/alocação, só não o custo/hora de
  // ninguém. Removido aqui na borda HTTP, não no service: BiService lê
  // costPerHour direto via Prisma pro cálculo de realizado, sem passar
  // por este controller, então esse cálculo continua funcionando normal.
  private redactCost<T extends { costPerHour?: unknown }>(user: T, accessLevel: string): T {
    if (accessLevel === 'admin') return user;
    return { ...user, costPerHour: undefined };
  }

  @Get()
  async list(@SessionAccount() { accountId, accessLevel }: SessionAccountType) {
    const users = await this.usersService.listUsers(accountId);
    return { data: users.map((u) => this.redactCost(u, accessLevel)) };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId, accessLevel }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const user = await this.usersService.getUser(accountId, id);
    return { data: this.redactCost(user, accessLevel) };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId, accessLevel }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) input: UserUpdateInput,
  ) {
    // costPerHour e accessLevel só passam se quem está pedindo é admin --
    // sem isso, staff não vê o próprio custo/hora (GET já filtra) mas
    // ainda conseguiria escrevê-lo às cegas, e ninguém conseguiria
    // promover/rebaixar ninguém pela API.
    const safeInput = accessLevel === 'admin' ? input : { ...input, costPerHour: undefined, accessLevel: undefined };
    const data = await this.usersService.updateUser(accountId, id, safeInput);
    return { data: this.redactCost(data, accessLevel) };
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
