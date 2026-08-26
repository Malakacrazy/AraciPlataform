import { Body, Controller, Post } from '@nestjs/common';
import {
  FiscalService,
  fatorRSimulateSchema,
  type FatorRSimulateInput,
} from './fiscal.service';
import { SessionAccount } from '../../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../../auth/session-account.interface';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminOnly } from '../../auth/admin-only.decorator';

@AdminOnly()
@Controller('v1/fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Post('fator-r/simulate')
  async simulateFatorR(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(fatorRSimulateSchema)) input: FatorRSimulateInput,
  ) {
    const data = await this.fiscalService.simulateFatorR(accountId, input);
    return { data };
  }
}
