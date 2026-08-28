import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from './google-drive.service';
import { NotificationsService } from '../notifications/notifications.service';

// Achado da auditoria: "hoje o link apodrece em silêncio" -- arquivo
// movido/renomeado/excluído no Drive não avisa ninguém. Roda semanalmente
// (mesmo padrão de DataRetentionCron/CertificateExpiryCron), uma conta
// por vez -- GoogleDriveService.checkBrokenLinksForAccount pula sozinha
// contas sem ninguém conectado ao Drive (não é erro do cron).
@Injectable()
export class BrokenLinkCheckCron {
  private readonly logger = new Logger(BrokenLinkCheckCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async checkAllAccounts() {
    const accountIds = await this.prisma.db.officeLink.findMany({
      where: { provider: 'DRIVE' },
      distinct: ['accountId'],
      select: { accountId: true },
    });

    let totalChecked = 0;
    let totalNewlyBroken = 0;

    for (const { accountId } of accountIds) {
      let result: { checked: number; newlyBroken: string[] };
      try {
        result = await this.googleDriveService.checkBrokenLinksForAccount(accountId);
      } catch (error) {
        // Sem credencial conectada, ou refresh token morto -- não é uma
        // falha do cron, só não dá pra verificar esta conta hoje.
        this.logger.log(
          `Checagem de vínculos quebrados pulada para a conta ${accountId}: ${(error as Error).message}`,
        );
        continue;
      }

      totalChecked += result.checked;
      totalNewlyBroken += result.newlyBroken.length;
      if (result.newlyBroken.length === 0) continue;

      const links = await this.prisma.db.officeLink.findMany({
        where: { id: { in: result.newlyBroken } },
      });
      const projectIds = [...new Set(links.filter((l) => l.entityType === 'PROJECT').map((l) => l.entityId))];
      const projects = await this.prisma.db.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      });
      const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

      await Promise.all(
        links.map((link) =>
          this.notificationsService.notifyBrokenOfficeLink(accountId, {
            officeLinkTitle: link.title,
            projectId: link.entityType === 'PROJECT' ? link.entityId : undefined,
            projectName: link.entityType === 'PROJECT' ? (projectNameById.get(link.entityId) ?? null) : null,
          }),
        ),
      );
    }

    this.logger.log(
      `Checagem de vínculos quebrados concluída — ${totalChecked} vínculo(s) verificado(s), ${totalNewlyBroken} novo(s) quebrado(s).`,
    );
  }
}
