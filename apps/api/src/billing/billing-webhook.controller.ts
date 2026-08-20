import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Public } from '../auth/public.decorator';
import { UnauthorizedError } from '../common/api-error';

// Terceira rota @Public() do sistema (ver public.decorator.ts) — a
// própria Asaas chama isto, sem sessão nenhuma, então o AuthGuard
// interno não tem como se aplicar. A autorização de verdade é o header
// asaas-access-token: é o mesmo valor configurado em
// ASAAS_WEBHOOK_AUTH_TOKEN na criação do webhook (ver
// docs.asaas.com/docs/sobre-os-webhooks) — a Asaas ecoa esse token de
// volta em toda notificação, então bater os dois é o suficiente pra
// confiar que a chamada é legítima. 401 se não bater, ANTES de tocar em
// qualquer dado (não silenciosamente ignora).
@Controller('v1/billing/asaas/webhook')
export class BillingWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Headers('asaas-access-token') accessToken: string | undefined,
    @Body() payload: { event?: string; payment?: { id?: string } },
  ) {
    const expected = process.env.ASAAS_WEBHOOK_AUTH_TOKEN;
    if (!expected || accessToken !== expected) {
      throw new UnauthorizedError(
        'Webhook Asaas: asaas-access-token ausente ou não confere.',
      );
    }
    await this.billingService.handleWebhookEvent(payload);
    return { data: { received: true } };
  }
}
