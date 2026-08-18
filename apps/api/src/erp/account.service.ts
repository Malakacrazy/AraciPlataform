import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';

// Sem POST: a Account nasce no bootstrap de login
// (AuthService.ensureAccountAndUser), igual ao User — não existe
// signup/criação de conta direta pela API ainda (Fase 1 é uma única
// conta, ver decisoes-pos-descoberta.md).
export const accountUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  cnpj: z.string().min(1).optional(),
  taxRegime: z.enum(['MEI', 'ME']).optional(),
});

export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(accountId: string) {
    const account = await this.prisma.db.account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundError('Conta');
    }
    return account;
  }

  // Trocar de MEI pra ME não decide sozinho o Anexo -- isso exige rodar o
  // simulador de Fator R com números reais (ver FiscalService), não um
  // valor arbitrário. Voltar de ME pra MEI também não limpa
  // taxRegimeAnexo/fatorRPercent: são o último cálculo feito, útil de
  // manter como histórico mesmo que hoje não se aplique.
  async updateAccount(accountId: string, input: AccountUpdateInput) {
    await this.getAccount(accountId);
    return this.prisma.db.account.update({
      where: { id: accountId },
      data: input,
    });
  }
}
