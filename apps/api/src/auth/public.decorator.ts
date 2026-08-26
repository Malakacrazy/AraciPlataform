import { SetMetadata } from '@nestjs/common';

// Seis famílias de rota usam isto, e só elas: /health;
// v1/present/:token (PublicPresentationController — o link de
// apresentação que um cliente sem login abre); v1/billing/asaas/webhook
// (BillingWebhookController — a própria Asaas chamando, nunca vai ter
// sessão); v1/client-portal/* (ClientPortalController — magic link e
// sessão de cliente, ver ClientPortalService); v1/zapsign/webhook
// (ZapSignWebhookController — a própria ZapSign chamando quando uma
// proposta é assinada, nunca vai ter sessão; a assinatura em si acontece
// na página hospedada pela ZapSign, não em nenhuma rota deste sistema);
// e v1/leads (LeadsController — formulário público de captação, um
// visitante do site do estúdio antes de qualquer contato/login). As
// primeiras cinco só liam ou escreviam algo já autorizado por posse de
// um token/sessão; v1/leads é a primeira rota de escrita sem NENHUMA
// credencial — mitigado por ser write-only (nunca devolve id nem dado
// da conta), pela resposta genérica, e pelo ThrottlerGuard global
// (app.module.ts), mas isso não é CAPTCHA: risco de spam de baixo volume
// aceito e registrado no roadmap, não ignorado.
// AuthGuard é global (aplicado a toda rota por padrão) exatamente para
// que "esquecer de proteger uma rota" seja impossível por omissão —
// @Public() só pula a checagem de token interno, nunca autorização de
// verdade: cada uma dessas rotas faz a própria checagem (posse do token
// da URL; header asaas-access-token; token de sessão de cliente; header
// zapsign-webhook-token; validação estrita de input, pra v1/leads)
// dentro do controller/service, não confia em "está marcado @Public()
// então tudo bem". Qualquer novo uso deste decorator merece a mesma
// pergunta que essas seis responderam: por que este dado pode ser
// lido/escrito por alguém sem sessão, e o que impede que vaze além do
// escopo pretendido?
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
