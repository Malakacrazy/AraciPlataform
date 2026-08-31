import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ForbiddenError, UnauthorizedError } from '../common/api-error';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_ADMIN_ONLY_KEY } from './admin-only.decorator';
import type { SessionAccount } from './session-account.interface';
import { setAuditActor } from '../audit/audit-context';

// Defesa em profundidade do achado C-01 -- a checagem principal é o
// callback signIn em apps/web/src/lib/auth.ts (é lá que o login é
// negado); isto aqui é um segundo gate caso um JWT interno chegue por
// outro caminho que não o login normal. Mesmas variáveis por nome, cada
// serviço lê a sua cópia do ambiente.
function isEmailAllowed(email: string): boolean {
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const emails = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const normalized = email.toLowerCase();
  const domain = normalized.split('@')[1];
  return domains.includes(domain) || emails.includes(normalized);
}

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
    const isAdminOnly = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
      const user = await this.authService.findByApiKeyHash(apiKeyHash);
      if (!user) {
        throw new UnauthorizedError();
      }
      // Achado A23 da auditoria de 30 ago 2026: o ramo Bearer abaixo já
      // aplicava isEmailAllowed antes de aceitar a sessão; este ramo não
      // aplicava. Como não existe rota de exclusão de User nem flag de
      // usuário desativado, o único jeito de desligar alguém hoje é
      // removê-lo de ALLOWED_EMAILS/ALLOWED_EMAIL_DOMAINS -- sem esta
      // checagem aqui, isso fechava o login Google mas deixava a chave de
      // API de quem foi desligado funcionando pra sempre.
      if (!isEmailAllowed(user.email)) {
        throw new ForbiddenError();
      }
      if (isAdminOnly && user.accessLevel !== 'admin') {
        throw new ForbiddenError();
      }
      request.sessionAccount = {
        accountId: user.accountId,
        userId: user.id,
        email: user.email,
        accessLevel: user.accessLevel,
      };
      setAuditActor({ accountId: user.accountId, actorType: 'user', actorId: user.id, actorEmail: user.email });
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

    if (!isEmailAllowed(email)) {
      throw new ForbiddenError();
    }

    const user = await this.authService.ensureAccountAndUser(email, email);
    if (isAdminOnly && user.accessLevel !== 'admin') {
      throw new ForbiddenError();
    }
    request.sessionAccount = {
      accountId: user.accountId,
      userId: user.id,
      email,
      accessLevel: user.accessLevel,
    };
    setAuditActor({ accountId: user.accountId, actorType: 'user', actorId: user.id, actorEmail: email });
    return true;
  }
}
