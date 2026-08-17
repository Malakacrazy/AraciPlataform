import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  MoodboardsService,
  moodboardInputSchema,
  moodboardItemInputSchema,
  type MoodboardInput,
  type MoodboardItemInput,
} from './moodboards.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/projects/:projectId/moodboards')
export class ProjectMoodboardsController {
  constructor(private readonly moodboardsService: MoodboardsService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.moodboardsService.listMoodboards(
      accountId,
      projectId,
    );
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(moodboardInputSchema)) input: MoodboardInput,
  ) {
    const data = await this.moodboardsService.createMoodboard(
      accountId,
      projectId,
      input,
    );
    return { data };
  }
}

@Controller('v1/moodboards')
export class MoodboardsController {
  constructor(private readonly moodboardsService: MoodboardsService) {}

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.moodboardsService.deleteMoodboard(accountId, id);
  }

  @Post(':id/items')
  @HttpCode(201)
  async addItem(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moodboardItemInputSchema))
    input: MoodboardItemInput,
  ) {
    const data = await this.moodboardsService.addItem(accountId, id, input);
    return { data };
  }
}

@Controller('v1/moodboard-items')
export class MoodboardItemsController {
  constructor(private readonly moodboardsService: MoodboardsService) {}

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.moodboardsService.removeItem(accountId, id);
  }
}
