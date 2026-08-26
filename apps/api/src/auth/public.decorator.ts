import { SetMetadata } from '@nestjs/common';

// Cinco famílias de rota usam isto, e só elas: /health;
// v1/present/:token (PublicPresentationController — o link de
// apresentação que um cliente sem login abre); v1/billing/asaas/webhook
// (BillingWebhookController — a própria Asaas chamando, nunca vai ter
// sessão); v1/client-portal/* (ClientPortalController — magic link e
// sessão de cliente, ver ClientPortalService); e v1/zapsign/webhook
// (ZapSignWebhookController — a própria ZapSign chamando quando uma
// proposta é assinada, nunca vai ter sessão; a assinatura em si acontece
// na página hospedada pela ZapSign, não em nenhuma rota deste sistema).
// AuthGuard é global (aplicado a toda rota por padrão) exatamente para
// que "esquecer de proteger uma rota" seja impossível por omissão —
// @Public() só pula a checagem de token interno, nunca autorização de
// verdade: cada uma dessas rotas faz a própria checagem (posse do token
// da URL; header asaas-access-token; token de sessão de cliente; header
// zapsign-webhook-token) dentro do controller/service, não confia em
// "está marcado @Public() então tudo bem". Qualquer novo uso deste
// decorator merece a mesma pergunta que essas cinco responderam: por que
// este dado pode ser lido/escrito por alguém sem sessão, e o que impede
// que vaze além do escopo pretendido?
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
