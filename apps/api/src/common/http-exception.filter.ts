import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@araci/db';
import { ApiError } from './api-error';

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
            message: 'Não é possível excluir: outros registros ainda dependem deste.',
          },
        });
        return;
      }
      if (exception.code === 'P2025') {
        response
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: 'Registro não encontrado.' } });
        return;
      }
    }

    // Não vaza detalhe de erro interno (stack, mensagem de driver) — só loga.
    this.logger.error(exception);
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } });
  }
}
