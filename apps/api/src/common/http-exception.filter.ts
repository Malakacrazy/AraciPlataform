import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@araci/db';
import * as Sentry from '@sentry/nestjs';
import { ApiError } from './api-error';
import { getAuditActor } from '../audit/audit-context';

// Portado de apps/web/src/lib/api.ts (errorResponse) — mesmo formato de
// resposta em todo o backend: { error: { code, message } }.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiError) {
      response
        .status(exception.status)
        .json({ error: { code: exception.code, message: exception.message } });
      return;
    }

    if (exception instanceof ZodError) {
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: exception.issues[0]?.message ?? 'Entrada inválida.',
        },
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // FK constraint (ex.: deletar um Client com Opportunity vinculada) —
      // 409, não 500: não é um bug, é um conflito real de estado que o
      // chamador pode resolver. P2003 é o código clássico do query engine;
      // com o driver adapter (Prisma 7 + @prisma/adapter-pg), a mesma
      // violação chega como P2039 — confirmado rodando o smoke test de
      // verdade contra Postgres, não documentação (ver
      // decisoes-pos-descoberta.md).
      if (exception.code === 'P2003' || exception.code === 'P2039') {
        response.status(409).json({
          error: {
            code: 'CONFLICT',
            message:
              'Não é possível excluir: outros registros ainda dependem deste.',
          },
        });
        return;
      }
      if (exception.code === 'P2025') {
        response.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Registro não encontrado.' },
        });
        return;
      }
      // Violação de @unique (ex.: Client.email desde o achado A-05 da
      // auditoria) -- sem isso, criar/atualizar com um valor já em uso
      // caía direto no 500 genérico abaixo, exatamente o tipo de erro que
      // um humano digitando um e-mail repetido vai bater na prática, não
      // um caso extremo. meta.target já vem do query engine com o(s)
      // nome(s) do campo que colidiu, então a mensagem não precisa ser
      // genérica.
      if (exception.code === 'P2002') {
        const target = Array.isArray(exception.meta?.target)
          ? exception.meta.target.join(', ')
          : 'valor';
        response.status(409).json({
          error: {
            code: 'CONFLICT',
            message: `Já existe um registro com o mesmo ${target}.`,
          },
        });
        return;
      }
    }

    // Não vaza detalhe de erro interno (stack, mensagem de driver) pro
    // cliente -- mas precisa vazar pro PRÓPRIO log, senão um 500 de
    // produção é indiagnosticável (bloqueador 10 da auditoria: antes,
    // this.logger.error(exception) sozinho não registrava rota, método
    // nem quem estava logado quando aconteceu).
    const request = host.switchToHttp().getRequest<Request>();
    const actor = getAuditActor();
    this.logger.error(
      `${request.method} ${request.originalUrl} — ator: ${actor.actorEmail ?? actor.actorType ?? 'desconhecido'}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    // Sem SENTRY_DSN configurado, captureException é um no-op (bloqueador
    // 09 da auditoria) -- ver src/instrument.ts.
    Sentry.captureException(exception, {
      tags: { route: request.originalUrl, method: request.method },
      user: actor.actorEmail ? { email: actor.actorEmail, id: actor.actorId } : undefined,
    });
    response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } });
  }
}
