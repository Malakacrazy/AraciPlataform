import { Injectable } from '@nestjs/common';
import { prisma } from '@araci/db';

// Envolve o singleton do @araci/db para o container de DI do Nest — não
// gerencia conexão própria, o cliente/pool já é gerenciado pelo pacote
// compartilhado (ver packages/db/src/index.ts).
//
// Propriedade chamada `db`, não `client` — o schema tem um model `Client`
// (CRM), e `prismaService.client.client.findMany()` seria ilegível.
@Injectable()
export class PrismaService {
  readonly db = prisma;
}
