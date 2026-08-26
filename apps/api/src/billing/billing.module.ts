import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule só pra avisar quando um pagamento confirmado
  // deixa uma fatura sem NFS-e emitida (ver BillingService,
  // notifyNfseReady).
  imports: [NotificationsModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService],
})
export class BillingModule {}
