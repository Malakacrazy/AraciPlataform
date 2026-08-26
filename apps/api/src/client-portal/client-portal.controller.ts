import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ClientPortalService,
  requestLinkSchema,
  consumeTokenSchema,
  type RequestLinkInput,
  type ConsumeTokenInput,
} from './client-portal.service';
import { Public } from '../auth/public.decorator';
import { UnauthorizedError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// Quarta família de rota @Public() do sistema (ver public.decorator.ts):
// quem chama aqui não tem sessão de staff nenhuma, é um cliente com só
// um token de portador (ver ClientPortalService pro porquê disso ser
// seguro -- o token na tabela é a própria credencial, checado dentro do
// service, não confiado por estar marcado @Public()).
@Public()
@Controller('v1/client-portal')
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Post('request-link')
  @HttpCode(200)
  async requestLink(@Body(new ZodValidationPipe(requestLinkSchema)) input: RequestLinkInput) {
    await this.clientPortalService.requestMagicLink(input);
    return { data: { message: 'Se o e-mail estiver cadastrado, você receberá um link de acesso.' } };
  }

  @Post('consume')
  @HttpCode(200)
  async consume(@Body(new ZodValidationPipe(consumeTokenSchema)) input: ConsumeTokenInput) {
    const data = await this.clientPortalService.consumeMagicLink(input);
    return { data };
  }

  @Get('projects')
  async listProjects(@Headers('x-client-session') sessionToken?: string) {
    if (!sessionToken) {
      throw new UnauthorizedError('Sessão de cliente ausente.');
    }
    const data = await this.clientPortalService.listProjects(sessionToken);
    return { data };
  }
}
