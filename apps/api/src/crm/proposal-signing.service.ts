import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProposalsService } from './proposals.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createZapSignDocument } from './zapsign-client';
import { setAuditActor } from '../audit/audit-context';

// Só pra deixar o texto do documento na ZapSign legível -- apps/web tem
// o mesmo mapa (lib/pep-stages.ts) mas não é importável daqui (ADR 0002:
// apps/api não depende de apps/web nem vice-versa), então é uma cópia
// deliberada, não uma referência viva.
const STAGE_LABELS: Record<string, string> = {
  CAPTACAO_ALINHAMENTO: 'Captação/Alinhamento',
  BRIEFING: 'Briefing',
  CRIACAO_CONCEITO: 'Criação de Conceito',
  DETALHAMENTO_ACABAMENTOS: 'Detalhamento/Acabamentos',
  EXECUTIVO: 'Executivo',
};

@Injectable()
export class ProposalSigningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalsService: ProposalsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private buildMarkdown(opportunityTitle: string, clientName: string, value: string, stages: { stage: string; contracted: boolean; adjustedHours: unknown; adjustedCost: unknown }[]): string {
    const lines = [
      `# Proposta — ${opportunityTitle}`,
      '',
      `Cliente: ${clientName}`,
      '',
      `**Valor total: R$ ${value}**`,
      '',
      '## Etapas contratadas',
      '',
      // Lista, não tabela markdown -- achado real abrindo o documento
      // gerado no sandbox da ZapSign: o conversor deles não renderiza
      // sintaxe de tabela (| col | col |), só imprime os caracteres "|"
      // literalmente. Lista é suportada por praticamente qualquer
      // conversor markdown->documento, tabela não é garantia nenhuma.
      ...stages
        .filter((s) => s.contracted)
        .map((s) => `- **${STAGE_LABELS[s.stage] ?? s.stage}** — ${s.adjustedHours}h — R$ ${s.adjustedCost}`),
    ];
    return lines.join('\n');
  }

  // Só "draft" pode ser enviado -- uma versão "sent"/"signed"/"expired"
  // já passou por aqui (ou nunca deveria); pra reenviar de verdade,
  // recalcular cria uma nova versão (ver ProposalsService.createProposal),
  // que nasce "draft" de novo.
  async sendForSignature(accountId: string, proposalId: string) {
    await this.proposalsService.getProposal(accountId, proposalId); // 404 se não é desta conta

    const proposal = await this.prisma.db.proposal.findUnique({
      where: { id: proposalId },
      include: { stages: true, opportunity: { include: { client: true } } },
    });
    if (!proposal) {
      throw new NotFoundError('Proposta');
    }
    if (proposal.status !== 'draft') {
      throw new ApiError(
        'PROPOSAL_NOT_SENDABLE',
        'Só uma proposta em rascunho pode ser enviada para assinatura.',
        422,
      );
    }
    const client = proposal.opportunity.client;
    if (!client.email) {
      throw new ApiError(
        'CLIENT_MISSING_EMAIL',
        'Este cliente não tem e-mail cadastrado — obrigatório pra ZapSign identificar o signatário.',
        422,
      );
    }

    const markdown = this.buildMarkdown(
      proposal.opportunity.title,
      client.name,
      Number(proposal.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      proposal.stages,
    );

    const doc = await createZapSignDocument({
      name: `Proposta — ${proposal.opportunity.title} v${proposal.version}`,
      markdownText: markdown,
      externalId: proposal.id,
      signerName: client.name,
      signerEmail: client.email,
    });

    const signer = doc.signers[0];
    return this.prisma.db.proposal.update({
      where: { id: proposal.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        zapsignDocToken: doc.token,
        zapsignSignUrl: signer?.sign_url,
      },
      include: { stages: true },
    });
  }

  // Chamado pelo ZapSignWebhookController (@Public(), sem sessão -- a
  // própria ZapSign chamando). A verificação de que a chamada é legítima
  // (header zapsign-webhook-token bate com ZAPSIGN_WEBHOOK_AUTH_TOKEN) já
  // aconteceu no controller antes de chegar aqui -- mesmo desenho do
  // BillingWebhookController pra Asaas.
  async handleWebhookEvent(payload: {
    event_type?: string;
    token?: string;
    signers?: { name?: string; email?: string; signed_at?: string }[];
  }): Promise<void> {
    if (payload.event_type !== 'doc_signed') {
      return; // evento que não nos interessa -- 200 mesmo assim, não é erro
    }
    if (!payload.token) {
      return;
    }

    const proposal = await this.prisma.db.proposal.findFirst({
      where: { zapsignDocToken: payload.token },
      include: { opportunity: { include: { client: true } } },
    });
    if (!proposal) {
      // Documento de outro contexto de teste da ZapSign, ou evento
      // duplicado de uma proposta já removida -- não é erro nosso.
      return;
    }
    if (proposal.status === 'signed') {
      return; // idempotente -- a ZapSign pode reenviar o mesmo evento
    }

    const signer = payload.signers?.[0];
    const signerName = signer?.name ?? proposal.opportunity.client.name;
    const signedAt = signer?.signed_at ? new Date(signer.signed_at) : new Date();

    setAuditActor({
      accountId: proposal.opportunity.client.accountId,
      actorType: 'client',
      actorId: proposal.opportunity.clientId,
      actorEmail: signer?.email ?? proposal.opportunity.client.email ?? undefined,
    });

    const updated = await this.prisma.db.proposal.update({
      where: { id: proposal.id },
      data: { status: 'signed', signedAt, signerName },
    });

    // notifyProposalSigned já engole os próprios erros (loga e segue) --
    // sem try/catch redundante aqui.
    await this.notificationsService.notifyProposalSigned(proposal.opportunity.client.accountId, {
      opportunityId: proposal.opportunityId,
      opportunityTitle: proposal.opportunity.title,
      signerName,
      value: Number(updated.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    });
  }
}
