import { SetMetadata } from '@nestjs/common';

// Só /health deve usar isto — AuthGuard é global (aplicado a toda rota
// por padrão) exatamente para que "esquecer de proteger uma rota" seja
// impossível por omissão. Ver docs/fase-0/ sobre por que login precisa
// ficar protegido por design, não por convenção.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
