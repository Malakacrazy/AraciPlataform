import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AdminOnly } from '../auth/admin-only.decorator';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';

// Admin-only, mesmo padrão de Financeiro/Tarifas: quem mudou o quê é
// informação de supervisão, não algo que staff precisa ver pra fazer o
// próprio trabalho.
@AdminOnly()
@Controller('v1/audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
  ) {
    const data = await this.auditLogService.list(accountId, {
      entityType,
      entityId,
      action,
      page: page ? Number(page) : undefined,
    });
    return { data };
  }
}
