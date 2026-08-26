import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import {
  createAsaasCustomer,
  createAsaasPayment,
  loadApiKey,
  type AsaasPayment,
} from './asaas-client';
import { setAuditActor } from '../audit/audit-context';

// Eventos que contam como "pago" pra fechar o ciclo da Invoice. A Asaas
// manda PAYMENT_CONFIRMED quando a compensação é iniciada (comum em
// boleto) e PAYMENT_RECEIVED quando o valor já está disponível (comum em
// Pix, que compensa na hora) -- tratamos os dois como "marcar como paga"
// porque a Invoice não distingue esses dois estágios intermediários, só
// pendente/emitida/paga.
const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private async getInvoiceWithClient(accountId: string, invoiceId: string) {
    const invoice = await this.prisma.db.invoice.findFirst({
      where: { id: invoiceId, project: { accountId } },
      include: { project: { include: { client: true } } },
    });
    if (!invoice) {
      throw new NotFoundError('Fatura');
    }
    return invoice;
  }

  // Reaproveita o customer da Asaas se este Client já tiver um (evita
  // recriar um customer novo a cada fatura da mesma pessoa/empresa).
  private async ensureAsaasCustomer(client: {
    id: string;
    name: string;
    document: string | null;
    email: string | null;
    asaasCustomerId: string | null;
  }): Promise<string> {
    if (client.asaasCustomerId) {
      return client.asaasCustomerId;
    }
    if (!client.document) {
      throw new ApiError(
        'CLIENT_MISSING_DOCUMENT',
        'Este cliente não tem CPF/CNPJ cadastrado — obrigatório pra Asaas criar a cobrança.',
        422,
      );
    }

    const customer = await createAsaasCustomer({
      name: client.name,
      cpfCnpj: client.document,
      email: client.email ?? undefined,
    });

    await this.prisma.db.client.update({
      where: { id: client.id },
      data: { asaasCustomerId: customer.id },
    });

    return customer.id;
  }

  // Cria a cobrança (Boleto + Pix, billingType UNDEFINED -- o cliente
  // escolhe na própria página da Asaas) pra uma Invoice já existente.
  // Não cria a Invoice; ela já nasce via createInvoiceForPhase ou
  // approveCartToInvoiceDraft (ver invoices.service.ts /
  // specifications.service.ts) -- este método só a manda pra cobrança.
  async chargeInvoice(accountId: string, invoiceId: string): Promise<AsaasPayment> {
    // "Está configurado?" é checado antes de qualquer outra coisa --
    // barato, e falhar rápido aqui evita validar o resto do estado da
    // fatura só pra descobrir depois, lá no fundo de ensureAsaasCustomer,
    // que a integração nem está ligada.
    loadApiKey();

    const invoice = await this.getInvoiceWithClient(accountId, invoiceId);

    if (invoice.asaasPaymentId) {
      throw new ApiError(
        'INVOICE_ALREADY_CHARGED',
        'Esta fatura já tem uma cobrança Asaas associada.',
        422,
      );
    }
    if (!invoice.dueDate) {
      throw new ApiError(
        'INVOICE_MISSING_DUE_DATE',
        'Esta fatura não tem data de vencimento — obrigatória pra criar a cobrança.',
        422,
      );
    }

    const customerId = await this.ensureAsaasCustomer(invoice.project.client);

    const payment = await createAsaasPayment({
      customer: customerId,
      value: Number(invoice.amount),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      description: `${invoice.project.name} — fatura ${invoice.id}`,
      externalReference: invoice.id,
    });

    await this.prisma.db.invoice.update({
      where: { id: invoice.id },
      data: {
        asaasPaymentId: payment.id,
        asaasInvoiceUrl: payment.invoiceUrl,
      },
    });

    return payment;
  }

  // Chamado pelo BillingWebhookController (@Public(), sem sessão -- é a
  // própria Asaas chamando). A verificação de que a chamada é legítima
  // (header asaas-access-token bate com ASAAS_WEBHOOK_AUTH_TOKEN) já
  // aconteceu no controller antes de chegar aqui.
  async handleWebhookEvent(payload: {
    event?: string;
    payment?: { id?: string };
  }): Promise<void> {
    if (!payload.event || !PAID_EVENTS.has(payload.event)) {
      return; // evento que não nos interessa -- 200 mesmo assim, não é erro
    }
    const asaasPaymentId = payload.payment?.id;
    if (!asaasPaymentId) {
      return;
    }

    const invoice = await this.prisma.db.invoice.findFirst({
      where: { asaasPaymentId },
      include: { project: { select: { accountId: true } } },
    });
    if (!invoice) {
      // Pode ser um evento de outra integração testando o mesmo endpoint,
      // ou uma cobrança criada fora deste fluxo -- não é um erro nosso,
      // só não há o que atualizar.
      return;
    }
    if (invoice.status === 'paga') {
      return; // idempotente -- a Asaas pode reenviar o mesmo evento
    }

    // Rota @Public() chamada pela própria Asaas, sem sessão de User --
    // Invoice não tem accountId próprio (só via project), então precisa
    // ser resolvido aqui pra não perder o vínculo de conta no log de
    // auditoria (ver resolveAccountId em prisma-audit-extension.ts, que
    // só acharia sozinho se o próprio model tivesse a coluna).
    setAuditActor({ accountId: invoice.project.accountId, actorType: 'system' });

    await this.prisma.db.invoice.update({
      where: { id: invoice.id },
      data: { status: 'paga', paidAt: new Date() },
    });
  }
}
