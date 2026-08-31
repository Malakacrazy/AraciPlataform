import { Controller, Get, Query } from '@nestjs/common';
import { BiService } from './bi.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { AdminOnly } from '../auth/admin-only.decorator';

@Controller('v1/bi')
export class BiController {
  constructor(private readonly biService: BiService) {}

  // Achado A21 da auditoria de 30 ago 2026: faltava @AdminOnly() aqui --
  // getExecutiveSummary devolve receita/despesa/margem do estúdio inteiro
  // e por projeto (o mesmo financeiro que ExpensesController/
  // InvoicesController/RoleRatesController já escondem de staff), e
  // 'realizado' por projeto é derivável em costPerHour de um colega
  // específico (dividindo pelas horas dele em GET /time-entries, que
  // continua aberto). @AdminOnly() só AQUI, não na classe: capacidade e
  // ffe abaixo alimentam telas que staff legitimamente usa
  // (/dashboard/capacidade) -- gatear a classe inteira quebraria isso
  // (a própria auditoria cita esse exato erro como "correção óbvia que
  // piora o problema").
  //
  // from/to em "YYYY-MM" (granularidade de mês, ver parsePeriodo em
  // bi.service.ts) -- ausentes ou inválidos caem no default de últimos 6
  // meses, mesmo comportamento de antes do date-range existir.
  @AdminOnly()
  @Get('executivo')
  async executivo(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.biService.getExecutiveSummary(accountId, from, to);
    return { data };
  }

  @Get('capacidade')
  async capacidade(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.biService.getCapacidade(accountId);
    return { data };
  }

  @Get('ffe')
  async ffe(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.biService.getFfe(accountId);
    return { data };
  }
}
