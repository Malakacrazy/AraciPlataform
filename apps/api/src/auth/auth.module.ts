import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

// Global: AuthGuard vira APP_GUARD, então toda rota de todo módulo exige
// o token interno por padrão, sem precisar importar nada — ver
// auth.guard.ts para o porquê disso ser deliberado.
@Global()
@Module({
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
