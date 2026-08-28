import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { PrismaService } from './prisma/prisma.service';
import { ServiceUnavailableError } from './common/api-error';

// Bloqueador 15 da auditoria: antes, respondia {status:'ok'} sempre,
// sem tocar no banco -- um healthcheck que nunca falha não protege
// contra nada (a plataforma podia estar de pé, mas sem conseguir falar
// com o Postgres, e o load balancer/orquestrador continuaria mandando
// tráfego pra ela). Uma consulta mínima (SELECT 1) é suficiente pra
// provar que a conexão real está de pé, sem depender de nenhuma tabela
// de negócio existir com dado nenhum.
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableError('Banco de dados inacessível.');
    }
    return { status: 'ok' };
  }
}
