// Cliente HTTP fino pra API da Asaas (Boleto + Pix) -- ver
// docs/fase-0/roadmap-atualizado.md, Fase 2, pela pesquisa que levou a
// escolher Asaas em vez de Cora/Inter (auth mais simples: só uma API
// key, sem OAuth2/mTLS; API grátis, sem plano pago pra acessar; sandbox
// real; MEI liberado hoje, sem depender da migração pra ME).
//
// Autenticação é só um header (access_token), bem mais simples que o
// certificado A1 usado pro NFS-e (ver fiscal/nfse-client.ts) -- não à
// toa essa foi a razão principal da escolha.
import { ApiError } from '../common/api-error';

// Nunca aponta pra produção sem decisão explícita, mesma postura do
// AMBIENTE_HOMOLOGACAO em fiscal/nfse-client.ts -- mas aqui a escolha é
// por variável de ambiente (ASAAS_ENV), não hardcoded, porque cobrar de
// verdade é o objetivo final deste módulo (diferente do NFS-e, que ainda
// depende de dado fiscal real confirmado pela contabilidade antes de
// qualquer emissão de produção fazer sentido). Enquanto ASAAS_ENV não
// for "production" explicitamente, cai em sandbox por padrão.
function resolveBaseUrl(): string {
  return process.env.ASAAS_ENV === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

export function loadApiKey(): string {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      'ASAAS_NOT_CONFIGURED',
      'Cobrança via Asaas não configurada — falta a variável de ambiente ASAAS_API_KEY.',
      422,
    );
  }
  return apiKey;
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: loadApiKey(),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // A Asaas devolve { errors: [{ code, description }] } em erro --
    // description já é uma mensagem legível o suficiente pra propagar.
    const message = body?.errors?.[0]?.description ?? `HTTP ${res.status}`;
    throw new ApiError('ASAAS_REQUEST_FAILED', `Asaas: ${message}`, 502);
  }
  return body;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
}

export async function createAsaasCustomer(input: {
  name: string;
  cpfCnpj: string;
  email?: string;
}): Promise<AsaasCustomer> {
  return asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface AsaasPayment {
  id: string;
  status: string;
  invoiceUrl: string;
  bankSlipUrl?: string;
}

export async function createAsaasPayment(input: {
  customer: string;
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
}): Promise<AsaasPayment> {
  return asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({ ...input, billingType: 'UNDEFINED' }),
  });
}

export async function getAsaasPayment(paymentId: string): Promise<AsaasPayment> {
  return asaasFetch(`/payments/${paymentId}`);
}
