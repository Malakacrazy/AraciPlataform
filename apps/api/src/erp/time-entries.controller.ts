import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { TimeEntriesService, timeEntryInputSchema, type TimeEntryInput } from './time-entries.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
  ) {
    const data = await this.timeEntriesService.listTimeEntries(accountId, { projectId, userId });
    return { data };
  }

  // userId vem da sessão, nunca do corpo — ver TimeEntriesService.
  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Body(new ZodValidationPipe(timeEntryInputSchema)) input: TimeEntryInput,
  ) {
    const data = await this.timeEntriesService.createTimeEntry(accountId, userId, input);
    return { data };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(timeEntryInputSchema.partial())) input: Partial<TimeEntryInput>,
  ) {
    const data = await this.timeEntriesService.updateTimeEntry(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
    await this.timeEntriesService.deleteTimeEntry(accountId, id);
  }

  // Quem chama este endpoint é o aprovador, não quem lançou a hora — a
  // API não impede hoje que alguém aprove o próprio lançamento; isso
  // ficaria a cargo de uma regra de papel/permissão que ainda não existe.
  // 200, não 201 — muta um lançamento existente, não cria um recurso novo.
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.timeEntriesService.approveTimeEntry(accountId, id, userId);
    return { data };
  }
}
