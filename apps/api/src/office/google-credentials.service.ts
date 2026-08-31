import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { encryptRefreshToken, decryptRefreshToken } from './google-credential-crypto';

export const saveGoogleCredentialSchema = z.object({
  refreshToken: z.string().min(1),
  scope: z.string().min(1),
});

export type SaveGoogleCredentialInput = z.infer<typeof saveGoogleCredentialSchema>;

// Fundação pra sincronização via webhook (Calendar events.watch / Gmail
// users.watch) -- ver comentário em schema.prisma, model
// GoogleCredential. Nada aqui chama watch() ainda; isto só guarda o
// refresh token que um job futuro vai precisar pra chamar a API do
// Google sem o usuário estar com o navegador aberto.
@Injectable()
export class GoogleCredentialsService {
  private readonly logger = new Logger(GoogleCredentialsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // userId, não accountId -- a credencial é da CONTA GOOGLE da pessoa,
  // não do escritório; cada colaborador conecta a sua própria.
  async saveCredential(userId: string, input: SaveGoogleCredentialInput) {
    const encrypted = encryptRefreshToken(input.refreshToken);
    await this.prisma.db.googleCredential.upsert({
      where: { userId },
      create: {
        userId,
        refreshTokenEnc: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenTag: encrypted.tag,
        scope: input.scope,
      },
      update: {
        refreshTokenEnc: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenTag: encrypted.tag,
        scope: input.scope,
      },
    });
  }

  async getStatus(userId: string) {
    const credential = await this.prisma.db.googleCredential.findUnique({
      where: { userId },
      select: { scope: true, createdAt: true, updatedAt: true },
    });
    if (!credential) {
      return { connected: false as const };
    }
    return { connected: true as const, ...credential };
  }

  // Revogação no Google é best-effort -- se a chamada falhar (token já
  // revogado do lado de lá, rede fora, etc.), ainda assim remove a
  // credencial local: o usuário pediu pra desconectar, então o registro
  // local não pode sobreviver só porque o Google não confirmou.
  async disconnect(userId: string) {
    const credential = await this.prisma.db.googleCredential.findUnique({ where: { userId } });
    if (!credential) {
      return;
    }
    try {
      const refreshToken = decryptRefreshToken({
        ciphertext: credential.refreshTokenEnc,
        iv: credential.refreshTokenIv,
        tag: credential.refreshTokenTag,
      });
      // Achado A37 da auditoria de 30 ago 2026: o token ia na query string
      // (mesmo mandando Content-Type urlencoded, o corpo ficava vazio) --
      // query string é o lugar mais provável de um segredo de longa
      // duração acabar registrado (proxy de saída, instrumentação HTTP do
      // Sentry). No corpo, mesmo padrão já usado em getAccessToken acima.
      const res = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
      if (!res.ok) {
        this.logger.warn(`Revogação no Google não confirmada (status ${res.status}) -- removendo credencial local mesmo assim.`);
      }
    } catch (error) {
      this.logger.warn(`Falha ao revogar credencial no Google: ${(error as Error).message}`);
    }
    await this.prisma.db.googleCredential.delete({ where: { userId } });
  }

  // Lacuna da matriz (gestão documental por projeto) -- primeiro uso REAL
  // do refresh token guardado (até aqui só disconnect() o tocava, pra
  // revogar). Troca por um access_token de vida curta (~1h) pra
  // GoogleDriveService chamar a Drive API do servidor, sem o navegador
  // aberto. Exige GOOGLE_CLIENT_ID/SECRET em apps/api (mesmo client OAuth
  // de apps/web) -- a troca refresh→access é sempre server-to-server,
  // nunca exposta ao navegador.
  async getAccessToken(userId: string): Promise<string> {
    const credential = await this.prisma.db.googleCredential.findUnique({ where: { userId } });
    if (!credential) {
      throw new NotFoundError('Credencial do Google');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new ApiError(
        'GOOGLE_OAUTH_NOT_CONFIGURED',
        'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados em apps/api.',
        422,
      );
    }

    const refreshToken = decryptRefreshToken({
      ciphertext: credential.refreshTokenEnc,
      iv: credential.refreshTokenIv,
      tag: credential.refreshTokenTag,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const body: { access_token?: string; error?: string; error_description?: string } = await res.json();
    if (!res.ok || !body.access_token) {
      // Acontece se a pessoa revogou o acesso direto em
      // myaccount.google.com/permissions sem passar por disconnect() aqui
      // -- a credencial local ainda existe, mas o refresh token morreu do
      // lado do Google.
      throw new ApiError(
        'GOOGLE_TOKEN_REFRESH_FAILED',
        body.error_description ?? 'Não foi possível renovar o acesso ao Google -- pode ser necessário reconectar.',
        502,
      );
    }
    return body.access_token;
  }
}
