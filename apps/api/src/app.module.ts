import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CrmModule } from './crm/crm.module';
import { ErpModule } from './erp/erp.module';
import { FfeModule } from './ffe/ffe.module';
import { OfficeModule } from './office/office.module';
import { PresentationModule } from './presentation/presentation.module';
import { BillingModule } from './billing/billing.module';
import { BiModule } from './bi/bi.module';
import { ActivitiesModule } from './activities/activities.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { CollaboratorPortalModule } from './collaborator-portal/collaborator-portal.module';
import { WhiteboardGuestPortalModule } from './whiteboard-guest-portal/whiteboard-guest-portal.module';
import { AuditLogModule } from './audit/audit-log.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ErpModule,
    CrmModule,
    FfeModule,
    OfficeModule,
    PresentationModule,
    BillingModule,
    BiModule,
    ActivitiesModule,
    ClientPortalModule,
    CollaboratorPortalModule,
    WhiteboardGuestPortalModule,
    AuditLogModule,
    // Defesa em profundidade — este serviço não é exposto ao navegador,
    // mas um limite de taxa custa pouco e ajuda contra um chamador
    // comprometido/com bug no lado do apps/web.
    //
    // Achado de revisão de segurança: isto chaveia por IP de origem, e
    // como só o apps/web chama aqui (servidor-a-servidor), TODO request
    // vem do mesmo IP -- ou seja, este número nunca foi "por cliente",
    // sempre foi um teto global do estúdio inteiro. Em 300/min ele era
    // um risco de disponibilidade maior que a proteção que dava (uma
    // tela pesada ou um laço derrubaria todo mundo com 429). O limite
    // que de fato defende o formulário de lead e o pedido de magic link
    // agora vive em apps/web/src/middleware.ts, onde o IP do chamador é
    // o IP real de quem está abusando. Aqui fica só o teto de sanidade.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3_000 }]),
    // Primeiro job em background da plataforma (ver
    // activities/stalled-opportunities.cron.ts) — antes disso não havia
    // nenhum processo rodando fora do ciclo request/response do Nest.
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
