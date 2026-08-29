import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  WhiteboardGuestPortalService,
  verifyLogtoLoginSchema,
  guestCommentInputSchema,
  type VerifyLogtoLoginInput,
  type GuestCommentInput,
} from './whiteboard-guest-portal.service';
import { Public } from '../auth/public.decorator';
import { UnauthorizedError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { moodboardSnapshotInputSchema, type MoodboardSnapshotInput } from '../ffe/moodboards.service';

// Mais uma família de rota @Public() do sistema (ver comentário em
// ClientPortalController) -- quem chama aqui não tem sessão de staff,
// só o token de portador desta tabela (verify-login) ou nada ainda
// (verify-login em si, chamado pelo callback OAuth do Logto em
// apps/web -- apps/api nunca é exposto ao navegador, mesmo raciocínio
// de GoogleCredentialsController).
@Public()
@Controller('v1/whiteboard-guest-portal')
export class WhiteboardGuestPortalController {
  constructor(private readonly whiteboardGuestPortalService: WhiteboardGuestPortalService) {}

  @Post('verify-login')
  @HttpCode(200)
  async verifyLogin(@Body(new ZodValidationPipe(verifyLogtoLoginSchema)) input: VerifyLogtoLoginInput) {
    const data = await this.whiteboardGuestPortalService.verifyLogtoLogin(input);
    return { data };
  }

  // Mesmo racional de ClientPortalController.logout.
  @Post('logout')
  @HttpCode(200)
  async logout(@Headers('x-whiteboard-guest-session') sessionToken?: string) {
    if (sessionToken) {
      await this.whiteboardGuestPortalService.logout(sessionToken);
    }
    return { data: { message: 'Sessão encerrada.' } };
  }

  @Get('boards')
  async listBoards(@Headers('x-whiteboard-guest-session') sessionToken?: string) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de convidado ausente.');
    }
    const data = await this.whiteboardGuestPortalService.listBoards(sessionToken);
    return { data };
  }

  @Get('boards/:id')
  async getBoard(
    @Headers('x-whiteboard-guest-session') sessionToken: string | undefined,
    @Param('id') id: string,
  ) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de convidado ausente.');
    }
    const data = await this.whiteboardGuestPortalService.getBoard(sessionToken, id);
    return { data };
  }

  @Patch('boards/:id/snapshot')
  async saveSnapshot(
    @Headers('x-whiteboard-guest-session') sessionToken: string | undefined,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moodboardSnapshotInputSchema)) input: MoodboardSnapshotInput,
  ) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de convidado ausente.');
    }
    const data = await this.whiteboardGuestPortalService.saveSnapshot(sessionToken, id, input.snapshot);
    return { data };
  }

  @Get('boards/:id/comments')
  async listComments(
    @Headers('x-whiteboard-guest-session') sessionToken: string | undefined,
    @Param('id') id: string,
  ) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de convidado ausente.');
    }
    const data = await this.whiteboardGuestPortalService.listComments(sessionToken, id);
    return { data };
  }

  @Post('boards/:id/comments')
  @HttpCode(201)
  async addComment(
    @Headers('x-whiteboard-guest-session') sessionToken: string | undefined,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(guestCommentInputSchema)) input: GuestCommentInput,
  ) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de convidado ausente.');
    }
    const data = await this.whiteboardGuestPortalService.addComment(sessionToken, id, input);
    return { data };
  }
}
