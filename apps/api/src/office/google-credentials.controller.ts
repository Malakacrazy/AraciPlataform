import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import {
  GoogleCredentialsService,
  saveGoogleCredentialSchema,
  type SaveGoogleCredentialInput,
} from './google-credentials.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// Sem @AdminOnly() de propósito -- é a credencial GOOGLE DA PRÓPRIA
// PESSOA logada, não um dado da conta/escritório (mesmo raciocínio de
// POST /users/:id/api-key, que também é self-service). userId sempre vem
// da sessão, nunca do corpo/URL -- não existe "conectar Google em nome de
// outra pessoa" nesta API.
@Controller('v1/office/google-credential')
export class GoogleCredentialsController {
  constructor(private readonly googleCredentialsService: GoogleCredentialsService) {}

  @Get()
  async status(@SessionAccount() { userId }: SessionAccountType) {
    const data = await this.googleCredentialsService.getStatus(userId);
    return { data };
  }

  // Chamado pelo callback OAuth em apps/web (apps/api nunca é exposto ao
  // navegador, então a troca do code pelo token acontece lá -- este
  // endpoint só recebe o refresh_token já obtido e guarda criptografado).
  @Post()
  @HttpCode(201)
  async save(
    @SessionAccount() { userId }: SessionAccountType,
    @Body(new ZodValidationPipe(saveGoogleCredentialSchema)) input: SaveGoogleCredentialInput,
  ) {
    await this.googleCredentialsService.saveCredential(userId, input);
    return { data: { connected: true } };
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@SessionAccount() { userId }: SessionAccountType) {
    await this.googleCredentialsService.disconnect(userId);
  }
}
