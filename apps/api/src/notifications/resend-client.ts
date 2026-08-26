// Cliente HTTP fino pra API da Resend (envio de e-mail transacional) --
// mesmo estilo de billing/asaas-client.ts: uma função de baixo nível por
// operação, chave carregada de variável de ambiente, erro específico se
// faltar configuração em vez de deixar a chamada real falhar com algo
// genérico.
import { ApiError } from '../common/api-error';

export function loadApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      'RESEND_NOT_CONFIGURED',
      'Envio de e-mail não configurado — falta a variável de ambiente RESEND_API_KEY.',
      422,
    );
  }
  return apiKey;
}

// updates.studioaraci.com.br é o domínio verificado no painel da Resend
// (confirmado direto na API antes de usar, não suposto) -- notificação
// automatizada sai daqui, não de um Gmail pessoal de alguém da equipe.
const FROM_ADDRESS = 'Studio Araci <notificacoes@updates.studioaraci.com.br>';

export async function sendEmail(input: { to: string[]; subject: string; html: string }): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loadApiKey()}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.message ?? `HTTP ${res.status}`;
    throw new ApiError('RESEND_REQUEST_FAILED', `Resend: ${message}`, 502);
  }
}
