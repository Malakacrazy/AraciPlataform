import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  OfficeLinksService,
  officeLinkInputSchema,
  officeLinkUpdateSchema,
  type OfficeLinkInput,
  type OfficeLinkUpdateInput,
} from './office-links.service';
import { GoogleDriveService } from './google-drive.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/projects/:projectId/office-links')
export class ProjectOfficeLinksController {
  constructor(private readonly officeLinksService: OfficeLinksService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.officeLinksService.listForProject(
      accountId,
      projectId,
    );
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(officeLinkInputSchema)) input: OfficeLinkInput,
  ) {
    const data = await this.officeLinksService.createForProject(
      accountId,
      userId,
      projectId,
      input,
    );
    return { data };
  }
}

@Controller('v1/clients/:clientId/office-links')
export class ClientOfficeLinksController {
  constructor(private readonly officeLinksService: OfficeLinksService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('clientId') clientId: string,
  ) {
    const data = await this.officeLinksService.listForClient(
      accountId,
      clientId,
    );
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Param('clientId') clientId: string,
    @Body(new ZodValidationPipe(officeLinkInputSchema)) input: OfficeLinkInput,
  ) {
    const data = await this.officeLinksService.createForClient(
      accountId,
      userId,
      clientId,
      input,
    );
    return { data };
  }
}

@Controller('v1/office-links')
export class OfficeLinksController {
  constructor(
    private readonly officeLinksService: OfficeLinksService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  // Lacuna da matriz (gestão documental por projeto, "versionamento")
  // -- histórico de revisões que o Drive já guarda, exposto aqui.
  @Get(':id/revisions')
  async listRevisions(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.googleDriveService.listRevisions(accountId, id);
    return { data };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(officeLinkUpdateSchema)) input: OfficeLinkUpdateInput,
  ) {
    const data = await this.officeLinksService.updateOfficeLink(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.officeLinksService.deleteOfficeLink(accountId, id);
  }
}
