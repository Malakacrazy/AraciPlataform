import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { loadCertificateFileFromEnv } from './nfse-client';
import { readCertificateInfo } from './nfse-certificate-info';
import { runWithCronLock } from '../../common/cron-lock';

const AVISAR_DIAS_ANTES = 60;
const COOLDOWN_DIAS = 25; // não reavisa toda semana dentro da mesma janela -- lembra de novo a cada ~mês
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Item da lista de 9 lacunas fiscais da auditoria: renovação do
// certificado A1 "vira uma tarefa operacional recorrente do estúdio, não
// só um detalhe técnico único de setup" (decisoes-pos-descoberta.md #4) --
// sem aviso nenhum, o jeito de descobrir que venceu é uma emissão real
// falhando (CERTIFICATE_EXPIRED, ver NfseService). Certificado é único
// por ambiente, não por Account (mesmo comentário já em NfseController) --
// notifica os admins de TODAS as contas encontradas, não só uma.
@Injectable()
export class CertificateExpiryCron {
  private readonly logger = new Logger(CertificateExpiryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async checkCertificateExpiry() {
    await runWithCronLock(this.prisma, 'certificate-expiry', this.logger, () => this.run());
  }

  private async run() {
    let validTo: Date;
    try {
      const cert = loadCertificateFileFromEnv();
      const buffer = readFileSync(cert.path);
      validTo = readCertificateInfo(buffer, cert.password).validTo;
    } catch {
      // Sem certificado configurado (comum em dev) ou arquivo/senha
      // inválidos -- não é um erro deste cron reportar, NfseService já
      // recusa emitir com uma mensagem clara nesse caso.
      this.logger.log('Checagem de vencimento do certificado A1 pulada -- certificado não configurado ou inválido.');
      return;
    }

    const daysRemaining = Math.ceil((validTo.getTime() - Date.now()) / MS_PER_DAY);
    if (daysRemaining > AVISAR_DIAS_ANTES) {
      return;
    }

    // Achado A71 da auditoria de 30 ago 2026: o cooldown era checado uma
    // vez, GLOBAL entre contas -- qualquer notificação recente de
    // QUALQUER conta suprimia o aviso de TODAS, inclusive uma conta nova
    // que nunca tivesse sido avisada nesta janela. A escrita já era
    // por-conta (notifyCertificateExpiring), só a leitura que decide se
    // escreve não era. Mesmo padrão por-conta que
    // NotificationsService.getLastNotifiedAtByClientIds já usa.
    const cooldownSince = new Date(Date.now() - COOLDOWN_DIAS * MS_PER_DAY);
    const accounts = await this.prisma.db.account.findMany({ select: { id: true } });
    let notified = 0;
    await Promise.all(
      accounts.map(async (account) => {
        const recentlyNotified = await this.prisma.db.notification.findFirst({
          where: { accountId: account.id, type: 'certificate_expiring', createdAt: { gte: cooldownSince } },
        });
        if (recentlyNotified) return;
        await this.notificationsService.notifyCertificateExpiring(account.id, { validTo, daysRemaining });
        notified++;
      }),
    );
    this.logger.log(`Certificado A1 vence em ${daysRemaining} dia(s) -- ${notified} de ${accounts.length} conta(s) avisada(s) (demais em cooldown).`);
  }
}
