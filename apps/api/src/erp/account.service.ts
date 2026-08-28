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
  // Abas 01/02 da planilha de precificação -- inputs compartilhados da
  // fórmula de tarifa/hora (ver RoleRatesService.upsertRoleRate e
  // crm/pricing.ts). Percentuais como fração (0.3 = 30%), não 0-100.
  pricingMarginPercent: z.number().min(0).max(5).optional(),
  pricingTaxBurdenPercent: z.number().min(0).max(0.99).optional(),
  pricingBusinessDaysPerMonth: z.number().int().min(1).max(31).optional(),
  pricingBillableHoursPerDay: z.number().positive().max(24).optional(),
  pricingActiveStaffCount: z.number().positive().optional(),
  // Lacuna da matriz (LGPD, "retenção/expurgo") -- nulo (padrão) desliga o
  // DataRetentionCron pra esta conta. `.nullable()` (não só `.optional()`)
  // pra deixar voltar a desligar depois de já ter configurado um prazo.
  dataRetentionMonths: z.number().int().min(1, 'Prazo precisa ser de pelo menos 1 mês.').max(600).nullable().optional(),
  // Lacuna da matriz (NFS-e dentro do fluxo real) -- ver comentário no
  // schema.prisma (Account.nfseAmbiente) para o porquê de "producao" ser
  // uma decisão explícita e não uma env var.
  nfseAmbiente: z.enum(['homologacao', 'producao']).optional(),
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
