import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { PresentationLinksService } from './presentation-links.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';

@Controller('v1/projects/:projectId/presentation-link')
export class PresentationLinksController {
  constructor(
    private readonly presentationLinksService: PresentationLinksService,
  ) {}

  @Get()
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.presentationLinksService.getLink(
      accountId,
      projectId,
    );
    return { data };
  }

  @Post()
  @HttpCode(201)
  async regenerate(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.presentationLinksService.regenerateLink(
      accountId,
      projectId,
    );
    return { data };
  }

  @Delete()
  @HttpCode(204)
  async revoke(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    await this.presentationLinksService.revokeLink(accountId, projectId);
  }
}
