import { SetMetadata } from '@nestjs/common';

// Duas famílias de rota usam isto, e só elas: /health, e
// v1/present/:token (PublicPresentationController — o link de
// apresentação que um cliente sem login abre). AuthGuard é global
// (aplicado a toda rota por padrão) exatamente para que "esquecer de
// proteger uma rota" seja impossível por omissão — @Public() só pula a
// checagem de token interno, nunca autorização de verdade: as rotas de
// apresentação fazem a própria checagem (posse do token da URL) dentro
// do service, não confiam em "está marcado @Public() então tudo bem".
// Qualquer novo uso deste decorator merece a mesma pergunta que
// PublicPresentationController respondeu: por que este dado pode ser
// lido/escrito por alguém sem sessão, e o que impede que vaze além do
// escopo pretendido?
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
