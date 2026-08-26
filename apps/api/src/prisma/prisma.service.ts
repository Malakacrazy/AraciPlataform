import { Injectable } from '@nestjs/common';
import { prisma } from '@araci/db';
import { withAuditExtension } from '../audit/prisma-audit-extension';

// Envolve o singleton do @araci/db para o container de DI do Nest — não
// gerencia conexão própria, o cliente/pool já é gerenciado pelo pacote
// compartilhado (ver packages/db/src/index.ts).
//
// Propriedade chamada `db`, não `client` — o schema tem um model `Client`
// (CRM), e `prismaService.client.client.findMany()` seria ilegível.
//
// `db` é o client ESTENDIDO com o log de auditoria (audit/) -- toda
// escrita feita através dele em models de negócio grava um AuditLog
// sozinha, sem cada service precisar chamar nada. `prisma` (o import
// acima, sem extensão) é passado como `baseClient` pra extensão usar nas
// leituras de antes/depois e na própria escrita do log, sem re-entrar
// nela mesma -- é por isso que scripts fora do Nest (ex.:
// scripts/smoke-test.ts) que importam `prisma` direto de @araci/db não
// passam pelo log: só o client injetado aqui tem a extensão.
@Injectable()
export class PrismaService {
  readonly db = prisma.$extends(withAuditExtension(prisma));
}
