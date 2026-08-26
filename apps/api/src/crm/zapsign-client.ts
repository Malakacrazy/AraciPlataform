// Cliente HTTP fino pra API da ZapSign (assinatura eletrônica) -- ver
// docs/fase-0/roadmap-atualizado.md, Fase 2, pela decisão de trocar uma
// assinatura "digitar o nome e clicar" (capturada e hospedada por nós)
// por um provedor de verdade: uma proposta é um contrato de serviço com
// valor real, e validade jurídica de assinatura importa aqui de um jeito
// que não importava, por exemplo, pra aprovação de um item de FF&E pelo
// link de apresentação.
//
// Autenticação é um token estático no header Authorization: Bearer,
// mesmo formato do access_token da Asaas -- mas ao contrário da Asaas,
// sandbox e produção são DOMÍNIOS diferentes (sandbox.api.zapsign.com.br
// vs. api.zapsign.com.br), não a mesma URL com um token diferente.
import { ApiError } from '../common/api-error';

function resolveBaseUrl(): string {
  return process.env.ZAPSIGN_ENV === 'production'
    ? 'https://api.zapsign.com.br/api/v1'
    : 'https://sandbox.api.zapsign.com.br/api/v1';
}

function loadApiToken(): string {
  const token =
    process.env.ZAPSIGN_ENV === 'production'
      ? process.env.ZAPSIGN_PRODUCTION_API_TOKEN
      : process.env.ZAPSIGN_SANDBOX_API_TOKEN;
  if (!token) {
    throw new ApiError(
      'ZAPSIGN_NOT_CONFIGURED',
      'Assinatura via ZapSign não configurada — falta a variável de ambiente do token do ambiente atual.',
      422,
    );
  }
  return token;
}

async function zapsignFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loadApiToken()}`,
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message ?? body?.detail ?? `HTTP ${res.status}`;
    throw new ApiError('ZAPSIGN_REQUEST_FAILED', `ZapSign: ${message}`, 502);
  }
  return body;
}

export interface ZapSignSigner {
  token: string;
  sign_url: string;
  status: string;
  name: string;
}

export interface ZapSignDocument {
  token: string;
  status: string;
  name: string;
  signers: ZapSignSigner[];
}

// markdown_text em vez de gerar um PDF: a ZapSign converte pra documento
// assinável sozinha, evitando precisar de uma lib de PDF só pra isso.
// external_id carrega o Proposal.id de volta -- é como o webhook
// (ZapSignWebhookController) correlaciona o evento com o registro daqui,
// sem depender só do zapsignDocToken já ter sido persistido antes do
// webhook chegar (proteção contra corrida entre a resposta desta
// chamada e o evento, embora na prática a ZapSign só dispara doc_signed
// bem depois de created).
export async function createZapSignDocument(input: {
  name: string;
  markdownText: string;
  externalId: string;
  signerName: string;
  signerEmail: string;
}): Promise<ZapSignDocument> {
  return zapsignFetch('/docs/', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      markdown_text: input.markdownText,
      external_id: input.externalId,
      // Enviamos o link manualmente (mesmo hábito já usado em toda a
      // plataforma pra compartilhar com o cliente -- WhatsApp/e-mail
      // direto da equipe, não um e-mail automático de um sistema que o
      // cliente não reconhece) em vez de deixar a ZapSign mandar o
      // e-mail de convite sozinha.
      send_automatic_email: false,
      signers: [{ name: input.signerName, email: input.signerEmail }],
    }),
  });
}
