// Mesmo raciocínio de verify-stalled-cron.ts / verify-data-retention-cron.ts:
// job de fundo, sem rota que o dispare sob demanda. Roda via ts-node,
// mesmo motivo de emitDecoratorMetadata documentado lá.
//
// O certificado real do estúdio vence em 24/08/2027 (ver
// decisoes-pos-descoberta.md #4) -- hoje está longe demais do prazo de
// aviso (60 dias) pra exercitar o branch de notificação de ponta a ponta
// sem um segundo certificado descartável só pra teste, que não existe.
// Este script confirma o que dá pra confirmar sem isso: o cron roda
// contra o certificado real sem lançar (branch "ainda longe do
// vencimento, não avisa"), e a notificação em si (NotificationsService.
// notifyCertificateExpiring) produz o título/e-mail certos quando
// chamada direto com dias fabricados.
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@araci/db";
import { AppModule } from "../src/app.module";
import { CertificateExpiryCron } from "../src/erp/fiscal/certificate-expiry.cron";
import { NotificationsService } from "../src/notifications/notifications.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const cron = app.get(CertificateExpiryCron);
  const notifications = app.get(NotificationsService);

  const account = await prisma.account.findFirst();
  if (!account) throw new Error("Nenhuma conta encontrada — rode isto contra um banco de dev já provisionado.");

  try {
    console.log("Rodando checkCertificateExpiry() contra o certificado real (esperado: no-op, vencimento distante)...");
    await cron.checkCertificateExpiry();
    const criadasPeloCron = await prisma.notification.findMany({
      where: { type: "certificate_expiring", accountId: account.id },
    });
    console.log(
      criadasPeloCron.length === 0
        ? "  ✓ Nenhuma notificação criada — certificado real está longe do prazo de aviso, como esperado"
        : `  ✗ Criou ${criadasPeloCron.length} notificação(ões) — não esperava nenhuma hoje`
    );

    console.log("Chamando notifyCertificateExpiring() direto, com 10 dias fabricados...");
    await notifications.notifyCertificateExpiring(account.id, { validTo: new Date("2027-08-24"), daysRemaining: 10 });
    const notification = await prisma.notification.findFirst({
      where: { type: "certificate_expiring", accountId: account.id },
      orderBy: { createdAt: "desc" },
    });
    console.log(
      notification?.title.includes("vence em 10 dia(s)")
        ? `  ✓ Notificação criada com o título certo: "${notification.title}"`
        : `  ✗ Título inesperado: ${notification?.title}`
    );
  } finally {
    await prisma.notification.deleteMany({ where: { type: "certificate_expiring", accountId: account.id } });
    await app.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
