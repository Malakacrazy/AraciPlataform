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

    // Achado A70 da auditoria de 30 ago 2026: account.findFirst() é o
    // único ponto do código que decide QUEM é a conta sem escopar nada --
    // todo o resto do isolamento (os ~300 filtros where: { accountId })
    // depende do accountId que sai daqui. Hoje é seguro só porque nunca
    // existe mais de uma Account (o único account.create do repositório é
    // a linha abaixo, guardada por existingAccounts.length === 0) -- no
    // dia em que uma segunda Account nascer por outro caminho (script de
    // onboarding, seed), findFirst() continuaria funcionando SEM ERRO
    // NENHUM, só devolvendo o inquilino errado pro próximo login novo.
    // Falha alto em vez de silenciosamente escolher uma linha -- decisão
    // determinística de qual conta pertence a qual e-mail (domínio,
    // convite) é um redesenho maior, fora do escopo desta correção; o
    // guard aqui só impede a query certa virar errada em silêncio.
    const existingAccounts = await this.prisma.db.account.findMany({ take: 2 });
    if (existingAccounts.length > 1) {
      throw new Error(
        'Mais de uma Account existe, mas ensureAccountAndUser ainda resolve o inquilino por account.findFirst() -- resolução determinística (domínio/convite por conta) precisa existir antes de logins novos serem seguros.',
      );
    }
    const account = existingAccounts[0] ?? (await this.prisma.db.account.create({ data: { name: 'Studio Araci' } }));

    // Quem cria a conta pela primeira vez é o admin -- todo mundo que
    // entra depois (existingAccount já existia) começa como staff e
    // precisa ser promovido por um admin em /team. Antes deste campo,
    // `role: 'admin'` era setado pra QUALQUER login novo, sem
    // distinção nenhuma de permissão real (ver User.accessLevel).
    return this.prisma.db.user.create({
      data: {
        accountId: account.id,
        email,
        name,
        role: 'admin',
        accessLevel: existingAccounts.length > 0 ? 'staff' : 'admin',
      },
    });
  }

  // Usado pelo caminho de chave de API do AuthGuard (extensão Captura) —
  // ver users.service.ts#generateApiKey para como o hash é gerado.
  findByApiKeyHash(apiKeyHash: string) {
    return this.prisma.db.user.findUnique({ where: { apiKeyHash } });
  }
}
