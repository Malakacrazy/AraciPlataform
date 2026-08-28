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
  ClientsService,
  clientInputSchema,
  type ClientInput,
} from './clients.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

@Controller('v1/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.clientsService.listClients(accountId);
    return { data };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.clientsService.getClient(accountId, id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(clientInputSchema)) input: ClientInput,
  ) {
    const data = await this.clientsService.createClient(accountId, input);
    return { data };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(clientInputSchema.partial()))
    input: Partial<ClientInput>,
  ) {
    const data = await this.clientsService.updateClient(accountId, id, input);
    return { data };
  }

  @AdminOnly()
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.clientsService.deleteClient(accountId, id);
  }

  // Lacuna da matriz (LGPD, "exportação dos dados do titular") --
  // admin-only por lidar com dado pessoal abrangente do titular de uma
  // vez só, mesmo nível de sensibilidade de custo/hora (ver
  // UsersController.redactCost).
  @AdminOnly()
  @Get(':id/data-export')
  async exportData(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.clientsService.exportClientData(accountId, id);
    return { data };
  }

  // Lacuna da matriz (LGPD, "anonimização preservando o registro fiscal,
  // em vez de exclusão física") -- POST, não DELETE: não remove o
  // registro, só os campos identificáveis (ver ClientsService.anonymizeClient).
  @AdminOnly()
  @Post(':id/anonymize')
  @HttpCode(200)
  async anonymize(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.clientsService.anonymizeClient(accountId, id);
    const data = await this.clientsService.getClient(accountId, id);
    return { data };
  }
}
