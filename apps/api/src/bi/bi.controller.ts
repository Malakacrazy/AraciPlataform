import { Controller, Get, Query } from '@nestjs/common';
import { BiService } from './bi.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';

@Controller('v1/bi')
export class BiController {
  constructor(private readonly biService: BiService) {}

  // from/to em "YYYY-MM" (granularidade de mês, ver parsePeriodo em
  // bi.service.ts) -- ausentes ou inválidos caem no default de últimos 6
  // meses, mesmo comportamento de antes do date-range existir.
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
