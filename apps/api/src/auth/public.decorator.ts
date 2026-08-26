import { SetMetadata } from '@nestjs/common';

// Quatro famílias de rota usam isto, e só elas: /health;
// v1/present/:token (PublicPresentationController — o link de
// apresentação que um cliente sem login abre); v1/billing/asaas/webhook
// (BillingWebhookController — a própria Asaas chamando, nunca vai ter
// sessão); e v1/client-portal/* (ClientPortalController — magic link e
// sessão de cliente, ver ClientPortalService). AuthGuard é global
// (aplicado a toda rota por padrão) exatamente para que "esquecer de
// proteger uma rota" seja impossível por omissão — @Public() só pula a
// checagem de token interno, nunca autorização de verdade: cada uma
// dessas rotas faz a própria checagem (posse do token da URL; header
// asaas-access-token; token de sessão de cliente) dentro do
// controller/service, não confia em "está marcado @Public() então tudo
// bem". Qualquer novo uso deste decorator merece a mesma pergunta que
// essas quatro responderam: por que este dado pode ser lido/escrito por
// alguém sem sessão, e o que impede que vaze além do escopo pretendido?
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
