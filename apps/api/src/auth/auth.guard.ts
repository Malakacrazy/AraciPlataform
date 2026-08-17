import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { UnauthorizedError } from '../common/api-error';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { SessionAccount } from './session-account.interface';

// Este serviço nunca é chamado pelo navegador — só por apps/web,
// server-to-server, e pela extensão Captura (chave de API, ver abaixo). O
// Authorization: Bearer aqui é um token interno de vida curta (~60s) que
// apps/web forja por requisição depois de validar a sessão NextAuth real;
// não é o token de sessão do usuário. Ver docs/fase-0/ para o desenho
// completo (BFF: apps/web continua sendo a única integração OAuth/Google;
// este serviço nunca tem superfície de login própria).
//
// Registrado como APP_GUARD global (auth.module.ts) — toda rota exige
// autenticação por padrão; @Public() é a única forma de abrir uma rota,
// então "esquecer de proteger" não é possível por omissão.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { sessionAccount?: SessionAccount }>();

    // Chave de API (extensão Captura, rodando no navegador do colaborador
    // — não tem como forjar o JWT interno de curta duração que só
    // apps/web sabe assinar). Verificada antes do Bearer para não pagar o
    // custo de jwtVerify quando a chave já resolve a requisição.
    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
      const user = await this.authService.findByApiKeyHash(apiKeyHash);
      if (!user) {
        throw new UnauthorizedError();
      }
      request.sessionAccount = {
        accountId: user.accountId,
        userId: user.id,
        email: user.email,
      };
      return true;
    }

    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;
    if (!token) {
      throw new UnauthorizedError();
    }

    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      throw new UnauthorizedError('INTERNAL_API_SECRET não configurado.');
    }

    let email: string;
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
        {
          algorithms: ['HS256'],
        },
      );
      if (typeof payload.email !== 'string') {
        throw new Error('missing email claim');
      }
      email = payload.email;
    } catch {
      throw new UnauthorizedError();
    }

    const user = await this.authService.ensureAccountAndUser(email, email);
    request.sessionAccount = {
      accountId: user.accountId,
      userId: user.id,
      email,
    };
    return true;
  }
}
