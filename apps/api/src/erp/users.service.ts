import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';

// Papel/cargo sugerido: apps/api/src/roles.ts (CANONICAL_ROLES) — não é
// uma trava no schema, `role` continua string livre (ver
// decisoes-pos-descoberta.md #2). Sem create aqui: um User só nasce via o
// bootstrap de login (AuthService.ensureAccountAndUser), não por criação
// direta na API — não existe convite/pré-cadastro de conta ainda.
export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  costPerHour: z.number().nonnegative().optional(),
  // nonnegative, não positive -- achado real de revisão: a tela de Equipe
  // já aceita 0 (min="0" no input, "temporariamente fora de alocação"),
  // mas o schema rejeitava com um erro genérico de validação.
  weeklyCapacityHours: z.number().nonnegative().optional(),
  // Só um admin pode de fato setar isto -- ver UsersController.update, que
  // remove o campo do input antes de chegar aqui se quem pediu não for
  // admin. Fica no schema (não só no controller) porque validar o
  // formato é responsabilidade do schema; quem pode setar é autorização,
  // não validação.
  accessLevel: z.enum(['admin', 'staff']).optional(),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// Achado A47 da auditoria de 30 ago 2026: findMany/findFirst sem select
// devolviam o User inteiro, inclusive apiKeyHash (sha-256 da chave de
// API) -- atravessava a fronteira staff/admin sem necessidade nenhuma
// (a única tela que consome isto só faz `Boolean(user.apiKeyHash)` pro
// próprio usuário). `hasApiKey` abaixo expõe exatamente esse booleano,
// nunca o hash. Só os campos que as telas realmente usam (ver
// apps/web/src/lib/types.ts User) -- uma coluna sensível nova no User não
// vaza por padrão de novo.
const USER_SELECT = {
  id: true,
  accountId: true,
  name: true,
  email: true,
  role: true,
  specialty: true,
  costPerHour: true,
  weeklyCapacityHours: true,
  accessLevel: true,
  createdAt: true,
} as const;

function withHasApiKey<T extends { apiKeyHash?: string | null }>({ apiKeyHash, ...user }: T) {
  return { ...user, hasApiKey: apiKeyHash != null };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(accountId: string) {
    const users = await this.prisma.db.user.findMany({
      where: { accountId },
      select: { ...USER_SELECT, apiKeyHash: true },
      orderBy: { name: 'asc' },
    });
    return users.map(withHasApiKey);
  }

  async getUser(accountId: string, id: string) {
    const user = await this.prisma.db.user.findFirst({
      where: { id, accountId },
      select: { ...USER_SELECT, apiKeyHash: true },
    });
    if (!user) {
      throw new NotFoundError('Colaborador');
    }
    return withHasApiKey(user);
  }

  async updateUser(accountId: string, id: string, input: UserUpdateInput) {
    await this.getUser(accountId, id);
    const user = await this.prisma.db.user.update({
      where: { id },
      data: input,
      select: { ...USER_SELECT, apiKeyHash: true },
    });
    return withHasApiKey(user);
  }

  // A chave de API (usada pela extensão Captura para autenticar POST
  // /v1/products direto do navegador -- ver AuthGuard) só existe em texto
  // puro aqui, no retorno desta chamada; só o hash sha-256 é persistido.
  // Regenerar sobrescreve o hash antigo, invalidando a chave anterior sem
  // precisar de um passo de revogação separado. `id` vem só da sessão
  // (ver UsersController) -- nunca de um :id de rota -- então não existe
  // risco de gerar/revogar a chave de outro usuário.
  async generateApiKey(id: string): Promise<string> {
    const apiKey = `araci_${randomBytes(24).toString('base64url')}`;
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    await this.prisma.db.user.update({ where: { id }, data: { apiKeyHash } });
    return apiKey;
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.prisma.db.user.update({
      where: { id },
      data: { apiKeyHash: null },
    });
  }
}
