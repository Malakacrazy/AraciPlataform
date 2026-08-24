import { Controller, Get } from '@nestjs/common';
import { BiService } from './bi.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';

@Controller('v1/bi')
export class BiController {
  constructor(private readonly biService: BiService) {}

  @Get('executivo')
  async executivo(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.biService.getExecutiveSummary(accountId);
    return { data };
  }
}
