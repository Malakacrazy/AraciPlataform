import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';

@Controller('v1/invoices/:id')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('charge')
  @HttpCode(201)
  async charge(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.billingService.chargeInvoice(accountId, id);
    return { data };
  }
}
