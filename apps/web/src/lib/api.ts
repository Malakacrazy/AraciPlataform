import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@araci/db";

// Error response convention fixed in docs/fase-0/especificacao-tecnica.md
// ("Formato da API própria") — every route handler funnels failures
// through errorResponse() so the shape never drifts between modules.
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Sessão inválida ou ausente.") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} não encontrado(a).`, 404);
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Entrada inválida." } },
      { status: 400 }
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // FK constraint (ex.: deletar um Client com Opportunity vinculada) —
    // 409, não 500, porque não é um bug, é um conflito real de estado que
    // o chamador pode resolver (apagar as dependências primeiro). P2003 é
    // o código clássico do query engine; com o driver adapter (Prisma 7 +
    // @prisma/adapter-pg), a mesma violação chega como P2039 — confirmado
    // rodando o smoke test de verdade contra Postgres, não documentação.
    if (error.code === "P2003" || error.code === "P2039") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Não é possível excluir: outros registros ainda dependem deste.",
          },
        },
        { status: 409 }
      );
    }
    // P2025: a linha não existe mais (corrida entre a checagem de
    // existência e a operação) — mesmo efeito de um 404 normal.
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Registro não encontrado." } },
        { status: 404 }
      );
    }
  }
  // Não vaza detalhe de erro interno (stack, mensagem de driver) — só loga.
  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno." } },
    { status: 500 }
  );
}
