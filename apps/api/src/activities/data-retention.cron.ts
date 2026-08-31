import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientsService } from '../crm/clients.service';
import { ActivitiesService } from './activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { runWithCronLock } from '../common/cron-lock';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30 * MS_PER_DAY; // aproximado -- prazo é configurado em meses inteiros, não precisa de precisão de calendário

// Lacuna da matriz (LGPD, "automação de retenção/expurgo") -- pergunta
// respondida antes de escrever este arquivo (ver AskUserQuestion na
// sessão): "automático" aqui é a DETECÇÃO de candidatos, não a
// anonimização em si. Mesmo padrão de StalledOpportunitiesCron (mora
// aqui, não em CrmModule, pelo mesmo motivo de import circular) e da
// própria emissão de NFS-e (decisoes-pos-descoberta.md #4): uma ação
// irreversível continua sendo um clique de um humano
// (ClientsService.anonymizeClient, já existente em /clients/:id), o cron
// só evita que ninguém precise auditar cliente por cliente à mão.
@Injectable()
export class DataRetentionCron {
  private readonly logger = new Logger(DataRetentionCron.name);

  constructor(
    private readonly clientsService: ClientsService,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async checkRetentionCandidates() {
    await runWithCronLock(this.prisma, 'data-retention', this.logger, () => this.run());
  }

  private async run() {
    const clients = await this.clientsService.listRetentionCandidateClients();
    if (clients.length === 0) {
      this.logger.log('Checagem de retenção de dados concluída — nenhuma conta com política configurada.');
      return;
    }

    // Achado A3 da auditoria de 30 ago 2026: os sinais antigos (só
    // createdAt de cliente/oportunidade/projeto + Activity de entityType
    // CLIENT) ignoravam qualquer sinal de projeto realmente vivo -- hora
    // lançada, fatura, gate aprovado, nota na timeline do PROJETO/da
    // OPORTUNIDADE. Buscados aqui, não no service, porque são duas
    // entidades diferentes (Activity é polimórfica) e o service já trouxe
    // timeEntries/invoices/phases junto de cada projeto.
    const projectIds = clients.flatMap((c) => c.projects.map((p) => p.id));
    const opportunityIds = clients.flatMap((c) => c.opportunities.map((o) => o.id));
    const [lastClientNoteAt, lastProjectNoteAt, lastOpportunityNoteAt] = await Promise.all([
      this.activitiesService.getLastActivityAtByClientIds(clients.map((c) => c.id)),
      this.activitiesService.getLastActivityAtByProjectIds(projectIds),
      this.activitiesService.getLastActivityAtByOpportunityIds(opportunityIds),
    ]);
    const now = Date.now();

    const candidates = clients
      .map((client) => {
        // Oportunidade ainda aberta ou projeto NÃO ENCERRADO tira o
        // cliente da lista de propósito, independente de há quanto tempo
        // isso começou -- um projeto de longa duração (ou pausado, que
        // não é a mesma coisa que abandonado) não é "cliente inativo".
        // Antes disto só `status === 'ativo'` contava, e 'pausado' caía
        // no mesmo balaio de 'encerrado'.
        const hasOpenOpportunity = client.opportunities.some((o) => !o.wonAt && !o.lostAt);
        const hasNonClosedProject = client.projects.some((p) => p.status !== 'encerrado');
        if (hasOpenOpportunity || hasNonClosedProject) return null;

        const retentionMonths = client.account.dataRetentionMonths;
        if (retentionMonths === null) return null; // defensivo -- a query já filtra isto

        const timestamps = [
          client.createdAt,
          ...client.opportunities.map((o) => o.wonAt ?? o.lostAt ?? o.createdAt),
          ...client.projects.map((p) => p.createdAt),
          ...client.projects.flatMap((p) => p.timeEntries.map((t) => t.date)),
          ...client.projects.flatMap((p) => p.invoices.flatMap((i) => [i.issuedAt, i.paidAt, i.dueDate])),
          ...client.projects.flatMap((p) => p.phases.map((ph) => ph.approvedAt)),
        ].filter((d): d is Date => d !== null);
        const noteAt = lastClientNoteAt.get(client.id);
        if (noteAt) timestamps.push(noteAt);
        for (const project of client.projects) {
          const projectNoteAt = lastProjectNoteAt.get(project.id);
          if (projectNoteAt) timestamps.push(projectNoteAt);
        }
        for (const opportunity of client.opportunities) {
          const opportunityNoteAt = lastOpportunityNoteAt.get(opportunity.id);
          if (opportunityNoteAt) timestamps.push(opportunityNoteAt);
        }
        const lastTouch = timestamps.reduce((max, d) => (d > max ? d : max));

        const monthsSinceActivity = Math.floor((now - lastTouch.getTime()) / MS_PER_MONTH);
        if (monthsSinceActivity < retentionMonths) return null;

        return { client, lastTouch, monthsSinceActivity };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const lastNotifiedAt = await this.notificationsService.getLastNotifiedAtByClientIds(
      candidates.map((entry) => entry.client.id),
    );

    const toNotify = candidates.filter((entry) => {
      const notifiedAt = lastNotifiedAt.get(entry.client.id);
      return !notifiedAt || notifiedAt < entry.lastTouch;
    });

    await Promise.all(
      toNotify.map((entry) =>
        this.notificationsService.notifyDataRetentionCandidate(entry.client.accountId, {
          clientId: entry.client.id,
          clientName: entry.client.name,
          monthsSinceActivity: entry.monthsSinceActivity,
        }),
      ),
    );

    this.logger.log(
      `Checagem de retenção de dados concluída — ${clients.length} cliente(s) com política ativa avaliado(s), ${candidates.length} candidato(s), ${toNotify.length} notificado(s).`,
    );
  }
}
