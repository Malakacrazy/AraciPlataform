import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import {
  MoodboardsService,
  moodboardInputSchema,
  moodboardSnapshotInputSchema,
  moodboardCommentInputSchema,
  type MoodboardInput,
  type MoodboardSnapshotInput,
  type MoodboardCommentInput,
} from './moodboards.service';
import { MoodboardFilesService } from './moodboard-files.service';
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
  constructor(
    private readonly moodboardsService: MoodboardsService,
    private readonly moodboardFilesService: MoodboardFilesService,
  ) {}

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

  // Corpo binário puro (raw() em main.ts, Content-Type image/*), nunca
  // JSON -- por isso @Body() sem ZodValidationPipe aqui; a validação de
  // mimeType/tamanho é feita em MoodboardFilesService.putFile. O
  // mimeType em si vem do próprio Content-Type que o cliente enviou (o
  // mesmo cabeçalho que o raw() usou pra decidir consumir o corpo).
  @Put(':id/files/:fileId')
  async putFile(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Headers('content-type') contentType: string | undefined,
    @Body() bytes: Buffer,
  ) {
    const data = await this.moodboardFilesService.putFile(
      accountId,
      id,
      fileId,
      contentType ?? 'application/octet-stream',
      bytes,
    );
    return { data };
  }

  // Item binário, não { data } como o resto da API -- mesmo padrão de
  // PublicPresentationController.downloadDocument. immutable: conteúdo-
  // endereçado (ver moodboard-blob-store.ts), o mesmo fileId nunca muda
  // de bytes, então o navegador pode cachear pra sempre.
  @Get(':id/files/:fileId')
  async getFile(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.moodboardFilesService.getFile(accountId, id, fileId);
    res.set({
      // mimeType/disposition já vêm normalizados pela allowlist do
      // service (ver normalizeImageMimeType) -- nunca o header cru que o
      // upload mandou.
      'Content-Type': file.mimeType,
      'Content-Disposition': file.disposition,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.bytes);
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
