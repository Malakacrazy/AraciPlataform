import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionAccount as SessionAccountType } from './session-account.interface';

// Uso: async list(@SessionAccount() { accountId }: SessionAccountType).
// AuthGuard já garantiu que isto existe antes de qualquer controller
// rodar (guard global, roda antes de qualquer handler).
export const SessionAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionAccountType => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { sessionAccount: SessionAccountType }>();
    return request.sessionAccount;
  },
);
