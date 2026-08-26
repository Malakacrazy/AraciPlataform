import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
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
      const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) {
        this.logger.warn(`Revogação no Google não confirmada (status ${res.status}) -- removendo credencial local mesmo assim.`);
      }
    } catch (error) {
      this.logger.warn(`Falha ao revogar credencial no Google: ${(error as Error).message}`);
    }
    await this.prisma.db.googleCredential.delete({ where: { userId } });
  }
}
