import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CrmModule } from './crm/crm.module';
import { ErpModule } from './erp/erp.module';
import { FfeModule } from './ffe/ffe.module';
import { OfficeModule } from './office/office.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ErpModule,
    CrmModule,
    FfeModule,
    OfficeModule,
    // Defesa em profundidade — este serviço não é exposto ao navegador,
    // mas um limite de taxa custa pouco e ajuda contra um chamador
    // comprometido/com bug no lado do apps/web.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
