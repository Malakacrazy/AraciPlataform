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
  AllocationsService,
  allocationInputSchema,
  type AllocationInput,
} from './allocations.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/allocations')
export class AllocationsController {
  constructor(private readonly allocationsService: AllocationsService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
  ) {
    const data = await this.allocationsService.listAllocations(accountId, {
      userId,
      projectId,
    });
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(allocationInputSchema)) input: AllocationInput,
  ) {
    const data = await this.allocationsService.createAllocation(
      accountId,
      input,
    );
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.allocationsService.deleteAllocation(accountId, id);
  }
}
