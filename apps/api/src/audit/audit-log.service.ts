import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PAGE_SIZE = 50;

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  action?: string;
  page?: number;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string, filters: AuditLogFilters) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const where = {
      accountId,
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
    };

    // Sem AuditLog.create() aqui de propósito -- só a extensão do Prisma
    // (prisma-audit-extension.ts) escreve nesta tabela, na escrita real de
    // outro model. Este service é só leitura.
    const [entries, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    return { entries, total, page, pageSize: PAGE_SIZE };
  }
}
