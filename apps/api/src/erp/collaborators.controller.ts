import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  CollaboratorsService,
  inviteCollaboratorSchema,
  type InviteCollaboratorInput,
} from './collaborators.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

// Lacuna da matriz ("colaboração com consultores externos") -- @AdminOnly
// em todo o controller: convidar um terceiro pra dentro de um projeto é
// decisão de negócio, mesmo padrão de acesso a financeiro/fiscal/tarifas.
@AdminOnly()
@Controller('v1/projects/:projectId/collaborators')
export class ProjectCollaboratorsController {
  constructor(private readonly collaboratorsService: CollaboratorsService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.collaboratorsService.listForProject(accountId, projectId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async invite(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(inviteCollaboratorSchema)) input: InviteCollaboratorInput,
  ) {
    const data = await this.collaboratorsService.invite(accountId, projectId, input);
    return { data };
  }

  @Delete(':collaboratorId')
  @HttpCode(204)
  async revoke(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('collaboratorId') collaboratorId: string,
  ) {
    await this.collaboratorsService.revoke(accountId, projectId, collaboratorId);
  }
}
