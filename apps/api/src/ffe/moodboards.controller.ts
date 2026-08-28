import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  MoodboardsService,
  moodboardInputSchema,
  moodboardSnapshotInputSchema,
  moodboardCommentInputSchema,
  type MoodboardInput,
  type MoodboardSnapshotInput,
  type MoodboardCommentInput,
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
    const data = await this.moodboardsService.listMoodboards(accountId, projectId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(moodboardInputSchema)) input: MoodboardInput,
  ) {
    const data = await this.moodboardsService.createMoodboard(accountId, projectId, input);
    return { data };
  }
}

@Controller('v1/moodboards')
export class MoodboardsController {
  constructor(private readonly moodboardsService: MoodboardsService) {}

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.moodboardsService.getMoodboard(accountId, id);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.moodboardsService.deleteMoodboard(accountId, id);
  }

  // Debounced no frontend (ver TldrawBoard) -- não é chamado a cada
  // stroke, só depois de uma pausa no desenho, pra não martelar o banco
  // a cada movimento de mouse.
  @Patch(':id/snapshot')
  async saveSnapshot(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moodboardSnapshotInputSchema)) input: MoodboardSnapshotInput,
  ) {
    const data = await this.moodboardsService.saveSnapshot(accountId, id, input);
    return { data };
  }

  @Get(':id/comments')
  async listComments(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.moodboardsService.getMoodboard(accountId, id); // 404 se a prancha não é desta conta
    const data = await this.moodboardsService.listComments(id);
    return { data };
  }

  @Post(':id/comments')
  @HttpCode(201)
  async addComment(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moodboardCommentInputSchema)) input: MoodboardCommentInput,
  ) {
    const data = await this.moodboardsService.addStaffComment(accountId, id, userId, input.body);
    return { data };
  }
}
