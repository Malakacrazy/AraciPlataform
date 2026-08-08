import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ClientsService, clientInputSchema, type ClientInput } from './clients.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.clientsService.listClients(accountId);
    return { data };
  }

  @Get(':id')
  async get(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
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
    @Body(new ZodValidationPipe(clientInputSchema.partial())) input: Partial<ClientInput>,
  ) {
    const data = await this.clientsService.updateClient(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
    await this.clientsService.deleteClient(accountId, id);
  }
}
