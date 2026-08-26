import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ProposalSigningService } from './proposal-signing.service';
import { Public } from '../auth/public.decorator';
import { UnauthorizedError } from '../common/api-error';

// Quinta e última rota @Public() do sistema (ver public.decorator.ts) --
// a própria ZapSign chama isto, sem sessão nenhuma. Diferente da Asaas
// (que ecoa de volta um header configurado na criação do webhook), a
// ZapSign não tem verificação de assinatura embutida -- o header
// zapsign-webhook-token é um segredo que NÓS escolhemos e configuramos
// na hora de cadastrar este endpoint no painel da ZapSign (Configurações
// > Integrações > Webhooks), então batê-lo aqui é a única garantia real
// de que a chamada é legítima. 401 se não bater, ANTES de tocar em
// qualquer dado.
@Controller('v1/zapsign/webhook')
export class ZapSignWebhookController {
  constructor(private readonly proposalSigningService: ProposalSigningService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Headers('zapsign-webhook-token') webhookToken: string | undefined,
    @Body()
    payload: {
      event_type?: string;
      token?: string;
      signers?: { name?: string; email?: string; signed_at?: string }[];
    },
  ) {
    const expected = process.env.ZAPSIGN_WEBHOOK_AUTH_TOKEN;
    if (!expected || webhookToken !== expected) {
      throw new UnauthorizedError('Webhook ZapSign: zapsign-webhook-token ausente ou não confere.');
    }
    await this.proposalSigningService.handleWebhookEvent(payload);
    return { data: { received: true } };
  }
}
