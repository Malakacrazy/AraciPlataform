// Portado de apps/web/src/lib/api.ts — mesma convenção de erro
// ({error:{code,message}}, ver docs/fase-0/especificacao-tecnica.md),
// agora capturada por HttpExceptionFilter em vez de um try/catch por rota.
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Sessão inválida ou ausente.') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} não encontrado(a).`, 404);
  }
}
