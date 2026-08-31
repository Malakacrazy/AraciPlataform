import { SetMetadata } from '@nestjs/common';

// OITO famílias de rota usam isto, e só elas. Esta lista é checklist de
// segurança: se divergir do código, a revisão que a consultar vai achar
// que viu tudo. Conferir com
// `grep -rn '^\s*@Public()\s*$' apps/api/src`.
//
//  1. /health (AppController) — liveness, sem dado de negócio.
//  2. v1/present/:token (PublicPresentationController) — o link de
//     apresentação que um cliente sem login abre. Autoriza por posse do
//     token da URL; a projeção é explícita (`select`), não o objeto do
//     Prisma.
//  3. v1/billing/asaas/webhook (BillingWebhookController) — a própria
//     Asaas chamando, nunca vai ter sessão. Header asaas-access-token,
//     comparado em tempo constante.
//  4. v1/zapsign/webhook (ZapSignWebhookController) — idem, header
//     zapsign-webhook-token. A assinatura em si acontece na página
//     hospedada pela ZapSign, não em nenhuma rota deste sistema.
//  5. v1/client-portal/* (ClientPortalController) — magic link e sessão
//     de cliente (ClientMagicLink/ClientSession, uso único, TTL).
//  6. v1/collaborator-portal/* (CollaboratorPortalController) — sessão
//     de consultor externo pelo header x-collaborator-session, com
//     escopo por projeto provado em CollaboratorProjectAccess a cada
//     requisição (não gravado na sessão, para que revogar tenha efeito
//     imediato). Só rotas GET; read-only é garantido pela ausência de
//     código de escrita, não por um flag.
//  7. v1/whiteboard-guest-portal/* (WhiteboardGuestPortalController) —
//     sessão de convidado de quadro (WhiteboardGuestSession), com
//     requireAccess() checando WhiteboardGuestAccess por quadro em TODA
//     rota, não só no join.
//  8. v1/leads (LeadsController) — formulário público de captação, um
//     visitante do site do estúdio antes de qualquer contato/login.
//
// Sete das oito só leem ou escrevem algo já autorizado por posse de um
// token/sessão. v1/leads é a única escrita sem NENHUMA credencial —
// mitigada por ser write-only (nunca devolve id nem dado da conta), pela
// resposta genérica, e pelo limite de taxa por IP em
// apps/web/src/proxy.ts (o ThrottlerGuard do apps/api não serve pra
// isso: chaveia pelo IP do apps/web, igual pra todo mundo -- achado de
// revisão de segurança). Nada disso é CAPTCHA: risco de spam de baixo
// volume aceito e registrado no roadmap, não ignorado.
//
// AuthGuard é global (aplicado a toda rota por padrão) exatamente para
// que "esquecer de proteger uma rota" seja impossível por omissão —
// @Public() só pula a checagem de token interno, nunca autorização de
// verdade: cada uma dessas rotas faz a própria checagem dentro do
// controller/service, não confia em "está marcado @Public() então tudo
// bem". Qualquer novo uso deste decorator merece a mesma pergunta que
// essas oito responderam: por que este dado pode ser lido/escrito por
// alguém sem sessão, e o que impede que vaze além do escopo pretendido?
// E precisa entrar NESTA lista: as duas famílias mais novas
// (collaborator-portal, whiteboard-guest-portal) ficaram fora dela por
// uma revisão inteira, enquanto o comentário ainda afirmava "seis".
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
