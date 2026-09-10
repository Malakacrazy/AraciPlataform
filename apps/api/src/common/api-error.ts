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

export class ForbiddenError extends ApiError {
  constructor(message = 'Sua conta não tem permissão para esta ação.') {
    super('FORBIDDEN', message, 403);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = 'Serviço indisponível.') {
    super('SERVICE_UNAVAILABLE', message, 503);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Requisição inválida.') {
    super('BAD_REQUEST', message, 400);
  }
}

// Upload de imagem de prancha (ver moodboard-files.service.ts) --
// tipo rejeitado (SVG) ou corpo maior que IMAGE_UPLOAD_LIMIT.
export class UnsupportedMediaTypeError extends ApiError {
  constructor(message = 'Tipo de arquivo não suportado.') {
    super('UNSUPPORTED_MEDIA_TYPE', message, 415);
  }
}

export class PayloadTooLargeError extends ApiError {
  constructor(message = 'Arquivo maior que o limite permitido.') {
    super('PAYLOAD_TOO_LARGE', message, 413);
  }
}
