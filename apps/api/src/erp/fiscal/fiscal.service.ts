import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiError } from '../../common/api-error';
import { AccountService } from '../account.service';
import { calcularFatorR } from './fator-r';

export const fatorRSimulateSchema = z.object({
  folhaPagamento12m: z.number().nonnegative(),
  receitaBruta12m: z.number().positive(),
});

export type FatorRSimulateInput = z.infer<typeof fatorRSimulateSchema>;

@Injectable()
export class FiscalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountService: AccountService,
  ) {}

  // Persiste o resultado em Account (fatorRPercent/taxRegimeAnexo) além
  // de devolvê-lo -- é "o último cálculo feito", igual ao comentário do
  // schema, não só uma simulação descartável. MEI não usa Fator R (paga
  // DAS-MEI fixo); simular aqui daria um Anexo recomendado que não
  // significa nada pra quem está em MEI, então é bloqueado explicitamente
  // em vez de calcular um número que a tela teria que saber ignorar.
  async simulateFatorR(accountId: string, input: FatorRSimulateInput) {
    const account = await this.accountService.getAccount(accountId);
    if (account.taxRegime === 'MEI') {
      throw new ApiError(
        'FATOR_R_NOT_APPLICABLE_MEI',
        'Fator R não se aplica a quem está no regime MEI — MEI paga um valor fixo mensal (DAS-MEI), sem essa conta. Mude o regime para ME antes de simular.',
        422,
      );
    }

    const result = calcularFatorR(input);

    await this.prisma.db.account.update({
      where: { id: accountId },
      data: {
        fatorRPercent: result.fatorR,
        taxRegimeAnexo: result.anexoRecomendado,
      },
    });

    return result;
  }
}
