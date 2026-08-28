import { Controller, Get, Param, Patch, Post, Body, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import {
  PublicPresentationService,
  publicSpecUpdateSchema,
  type PublicSpecUpdateInput,
} from './public-presentation.service';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  moodboardSnapshotInputSchema,
  moodboardCommentInputSchema,
  type MoodboardSnapshotInput,
  type MoodboardCommentInput,
} from '../ffe/moodboards.service';

// Uma das famílias de rota @Public() do sistema (client-portal e
// collaborator-portal vieram depois, ver comentário em
// ClientPortalController) — ver auth.guard.ts/public.decorator.ts sobre
// por que isto é deliberado e não um esquecimento: o cliente que abre
// este link não tem sessão Google/NextAuth, nunca vai ter. @Public() só
// pula a checagem de token interno; a autorização de verdade acontece
// dentro do PublicPresentationService (posse do token = acesso a
// exatamente um projeto, nada além disso).
@Controller('v1/present/:token')
export class PublicPresentationController {
  constructor(
    private readonly publicPresentationService: PublicPresentationService,
  ) {}

  @Public()
  @Get()
  async get(@Param('token') token: string) {
    const data = await this.publicPresentationService.getPresentation(token);
    return { data };
  }

  @Public()
  @Patch('specifications/:specId')
  async updateSpecification(
    @Param('token') token: string,
    @Param('specId') specId: string,
    @Body(new ZodValidationPipe(publicSpecUpdateSchema))
    input: PublicSpecUpdateInput,
  ) {
    const data = await this.publicPresentationService.updateSpecification(
      token,
      specId,
      input,
    );
    return { data };
  }

  // Item "grande" da lista de 11 -- corpo binário, não { data } como o
  // resto da API: por isso @Res({ passthrough: true }) em vez de deixar
  // o Nest serializar. inline (não attachment) de propósito -- o cliente
  // só visualiza pelo portal, PDF/imagem abre direto no navegador em vez
  // de forçar download.
  @Public()
  @Get('documents/:officeLinkId')
  async downloadDocument(
    @Param('token') token: string,
    @Param('officeLinkId') officeLinkId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.publicPresentationService.downloadDocument(token, officeLinkId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
    });
    return new StreamableFile(file.data);
  }

  // Quadro tldraw + chat -- carregado sob demanda por prancha (ver
  // comentário em getPresentation). Cliente com o link tem escrita
  // igual ao resto do link (posse do link = acesso): desenha e comenta,
  // não só olha.
  @Public()
  @Get('moodboards/:moodboardId')
  async getMoodboardBoard(@Param('token') token: string, @Param('moodboardId') moodboardId: string) {
    const data = await this.publicPresentationService.getMoodboardBoard(token, moodboardId);
    return { data };
  }

  @Public()
  @Patch('moodboards/:moodboardId/snapshot')
  async saveMoodboardSnapshot(
    @Param('token') token: string,
    @Param('moodboardId') moodboardId: string,
    @Body(new ZodValidationPipe(moodboardSnapshotInputSchema)) input: MoodboardSnapshotInput,
  ) {
    const data = await this.publicPresentationService.saveMoodboardSnapshot(token, moodboardId, input.snapshot);
    return { data };
  }

  @Public()
  @Get('moodboards/:moodboardId/comments')
  async listMoodboardComments(@Param('token') token: string, @Param('moodboardId') moodboardId: string) {
    const data = await this.publicPresentationService.listMoodboardComments(token, moodboardId);
    return { data };
  }

  @Public()
  @Post('moodboards/:moodboardId/comments')
  async addMoodboardComment(
    @Param('token') token: string,
    @Param('moodboardId') moodboardId: string,
    @Body(new ZodValidationPipe(moodboardCommentInputSchema)) input: MoodboardCommentInput,
  ) {
    const data = await this.publicPresentationService.addMoodboardComment(token, moodboardId, input);
    return { data };
  }
}
