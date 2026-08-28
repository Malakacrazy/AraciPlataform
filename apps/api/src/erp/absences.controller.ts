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
  AbsencesService,
  absenceInputSchema,
  type AbsenceInput,
} from './absences.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/absences')
export class AbsencesController {
  constructor(private readonly absencesService: AbsencesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('userId') userId?: string,
  ) {
    const data = await this.absencesService.listAbsences(accountId, { userId });
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(absenceInputSchema)) input: AbsenceInput,
  ) {
    const data = await this.absencesService.createAbsence(accountId, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.absencesService.deleteAbsence(accountId, id);
  }
}
