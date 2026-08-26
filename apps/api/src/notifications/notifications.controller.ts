import { Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';

// Sino da Nav -- sem @AdminOnly() de propósito: staff também recebe
// notificação (hoje nenhuma é gerada pra staff, mas o endpoint não deveria
// bloquear quem não tem nada pra ver, só devolver lista vazia).
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@SessionAccount() { accountId, userId }: SessionAccountType) {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationsService.listForUser(accountId, userId),
      this.notificationsService.countUnread(accountId, userId),
    ]);
    return { data: { notifications, unreadCount } };
  }

  @Patch(':id/read')
  @HttpCode(204)
  async markRead(@SessionAccount() { accountId, userId }: SessionAccountType, @Param('id') id: string) {
    await this.notificationsService.markRead(accountId, userId, id);
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@SessionAccount() { accountId, userId }: SessionAccountType) {
    await this.notificationsService.markAllRead(accountId, userId);
  }
}
