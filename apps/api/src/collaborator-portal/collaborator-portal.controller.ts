import { Controller, Get, Headers, HttpCode, Param, Post, Body } from '@nestjs/common';
import {
  CollaboratorPortalService,
  requestLinkSchema,
  consumeTokenSchema,
  type RequestLinkInput,
  type ConsumeTokenInput,
} from './collaborator-portal.service';
import { Public } from '../auth/public.decorator';
import { UnauthorizedError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// Quinta família de rota @Public() do sistema (ver public.decorator.ts) --
// mesmo modelo de segurança do ClientPortalController: quem chama aqui
// não tem sessão de staff nenhuma, só um token de portador verificado
// dentro do service.
@Public()
@Controller('v1/collaborator-portal')
export class CollaboratorPortalController {
  constructor(private readonly collaboratorPortalService: CollaboratorPortalService) {}

  @Post('request-link')
  @HttpCode(200)
  async requestLink(@Body(new ZodValidationPipe(requestLinkSchema)) input: RequestLinkInput) {
    await this.collaboratorPortalService.requestMagicLink(input);
    return { data: { message: 'Se o e-mail estiver cadastrado como consultor, você receberá um link de acesso.' } };
  }

  @Post('consume')
  @HttpCode(200)
  async consume(@Body(new ZodValidationPipe(consumeTokenSchema)) input: ConsumeTokenInput) {
    const data = await this.collaboratorPortalService.consumeMagicLink(input);
    return { data };
  }

  // Mesmo racional de ClientPortalController.logout.
  @Post('logout')
  @HttpCode(200)
  async logout(@Headers('x-collaborator-session') sessionToken?: string) {
    if (sessionToken) {
      await this.collaboratorPortalService.logout(sessionToken);
    }
    return { data: { message: 'Sessão encerrada.' } };
  }

  @Get('projects')
  async listProjects(@Headers('x-collaborator-session') sessionToken?: string) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de consultor ausente.');
    }
    const data = await this.collaboratorPortalService.listProjects(sessionToken);
    return { data };
  }

  @Get('projects/:id')
  async getProject(
    @Headers('x-collaborator-session') sessionToken: string | undefined,
    @Param('id') id: string,
  ) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de consultor ausente.');
    }
    const data = await this.collaboratorPortalService.getProject(sessionToken, id);
    return { data };
  }
}
