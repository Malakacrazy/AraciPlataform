import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  WhiteboardGuestsService,
  inviteWhiteboardGuestSchema,
  type InviteWhiteboardGuestInput,
} from './whiteboard-guests.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

// @AdminOnly() em todo o controller -- mesmo raciocínio de
// ProjectCollaboratorsController: convidar um terceiro pra dentro da
// plataforma, mesmo escopado a um quadro só, é decisão de negócio.
@AdminOnly()
@Controller('v1/moodboards/:moodboardId/guests')
export class WhiteboardGuestsController {
  constructor(private readonly whiteboardGuestsService: WhiteboardGuestsService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('moodboardId') moodboardId: string,
  ) {
    const data = await this.whiteboardGuestsService.listForMoodboard(accountId, moodboardId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async invite(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('moodboardId') moodboardId: string,
    @Body(new ZodValidationPipe(inviteWhiteboardGuestSchema)) input: InviteWhiteboardGuestInput,
  ) {
    const data = await this.whiteboardGuestsService.invite(accountId, moodboardId, input);
    return { data };
  }

  @Delete(':guestId')
  @HttpCode(204)
  async revoke(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('moodboardId') moodboardId: string,
    @Param('guestId') guestId: string,
  ) {
    await this.whiteboardGuestsService.revoke(accountId, moodboardId, guestId);
  }
}
