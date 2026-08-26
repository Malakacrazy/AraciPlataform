import { Controller, Get } from '@nestjs/common';
import { SessionAccount } from './session-account.decorator';
import type { SessionAccount as SessionAccountType } from './session-account.interface';

// "Quem sou eu" -- só ecoa de volta o que o AuthGuard já resolveu pra
// toda requisição (accountId/userId/email/accessLevel), sem query nova.
// Existe pra apps/web saber o accessLevel de quem está logado (pra
// decidir o que mostrar na navegação) sem precisar de uma rota admin-only
// que bloquearia justamente quem não é admin.
@Controller('v1/me')
export class MeController {
  @Get()
  get(@SessionAccount() session: SessionAccountType) {
    return { data: session };
  }
}
