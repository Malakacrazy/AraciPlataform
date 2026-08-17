import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Portado de apps/web/src/lib/session.ts (ensureAccountAndUser). Fase 1
// tem uma única conta (o estúdio) — não existe fluxo de signup ainda. No
// primeiro request autenticado, garante que exista uma Account e um User
// vinculado ao e-mail confirmado pelo token interno (ver AuthGuard). Isso
// muda quando a plataforma passar a atender mais de uma firma (ver
// data-model.md, "Multi-tenancy: decisão pendente").
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAccountAndUser(email: string, name: string) {
    const existingUser = await this.prisma.db.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return existingUser;
    }

    const account =
      (await this.prisma.db.account.findFirst()) ??
      (await this.prisma.db.account.create({ data: { name: 'Studio Araci' } }));

    return this.prisma.db.user.create({
      data: {
        accountId: account.id,
        email,
        name,
        role: 'admin',
      },
    });
  }

  // Usado pelo caminho de chave de API do AuthGuard (extensão Captura) —
  // ver users.service.ts#generateApiKey para como o hash é gerado.
  findByApiKeyHash(apiKeyHash: string) {
    return this.prisma.db.user.findUnique({ where: { apiKeyHash } });
  }
}
