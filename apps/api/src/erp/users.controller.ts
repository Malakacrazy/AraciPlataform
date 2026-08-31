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
import { ForbiddenError } from '../common/api-error';
import { AdminOnly } from '../auth/admin-only.decorator';

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

  // Achado A20 da auditoria de 30 ago 2026: faltava a checagem mais básica
  // de todas aqui -- qualquer staff conseguia dar PATCH no :id de QUALQUER
  // colega, não só no próprio. Self-scope pra quem não é admin (mesmo
  // padrão de GoogleCredentialsController/POST users/api-key, que nem
  // aceitam :id).
  @Patch(':id')
  async update(
    @SessionAccount() { accountId, userId, accessLevel }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) input: UserUpdateInput,
  ) {
    if (accessLevel !== 'admin' && id !== userId) {
      throw new ForbiddenError('Você só pode editar o próprio cadastro.');
    }
    // costPerHour, accessLevel e role só passam se quem está pedindo é
    // admin -- sem isso, staff não vê o próprio custo/hora (GET já
    // filtra) mas ainda conseguiria escrevê-lo às cegas, ninguém
    // conseguiria promover/rebaixar ninguém pela API, e (achado A20)
    // qualquer staff poderia reprecificar a própria fatura por hora
    // trocando o próprio `role` -- createHourlyInvoice agrupa por
    // User.role e multiplica pela RoleRate daquele papel, mesma razão
    // pela qual RoleRatesController já é admin-only.
    const safeInput =
      accessLevel === 'admin' ? input : { ...input, costPerHour: undefined, accessLevel: undefined, role: undefined };
    const data = await this.usersService.updateUser(accountId, id, safeInput);
    return { data: this.redactCost(data, accessLevel) };
  }

  // Chave de API para a extensão Captura (ver AuthGuard) -- devolvida em
  // texto puro só nesta resposta; a partir daqui só o hash sobrevive no
  // banco, então perder a resposta significa regenerar, não recuperar.
  // Sem :id (achado C-02 da auditoria): a rota antiga aceitava qualquer
  // userId de outra conta no MESMO account e gerava a chave dele -- staff
  // conseguia forjar uma chave com accessLevel de admin (AuthGuard resolve
  // x-api-key direto pro accessLevel do dono). Igual ao padrão já usado em
  // GoogleCredentialsController: só opera na PRÓPRIA sessão.
  @Post('api-key')
  @HttpCode(201)
  async generateApiKey(@SessionAccount() { userId }: SessionAccountType) {
    const apiKey = await this.usersService.generateApiKey(userId);
    return { data: { apiKey } };
  }

  @Delete('api-key')
  @HttpCode(204)
  async revokeApiKey(@SessionAccount() { userId }: SessionAccountType) {
    await this.usersService.revokeApiKey(userId);
  }

  // Achado A23 da auditoria de 30 ago 2026: até aqui só o próprio dono
  // conseguia revogar a chave (rota acima). Sem exclusão de User nem flag
  // de usuário desativado no schema, um admin não tinha NENHUM jeito de
  // desligar a chave de API de outra pessoa pela API -- só mexendo direto
  // no banco. `:id` aqui é seguro porque é @AdminOnly() (diferente do
  // /api-key acima, que é deliberadamente self-scoped).
  @AdminOnly()
  @Delete(':id/api-key')
  @HttpCode(204)
  async revokeApiKeyForUser(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.usersService.getUser(accountId, id); // 404 se não é desta conta
    await this.usersService.revokeApiKey(id);
  }
}
