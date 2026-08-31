import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  ProjectMembersService,
  addMemberSchema,
  type AddMemberInput,
} from './project-members.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

@Controller('v1/projects/:projectId/members')
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.projectMembersService.listMembers(
      accountId,
      projectId,
    );
    return { data };
  }

  // @AdminOnly() -- achado real de revisão: faltava aqui, mesma classe de
  // decisão gerencial que já é @AdminOnly() em AllocationsController
  // (quem compõe a equipe de um projeto não é decisão do próprio
  // colaborador).
  @AdminOnly()
  @Post()
  @HttpCode(201)
  async add(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(addMemberSchema)) input: AddMemberInput,
  ) {
    const data = await this.projectMembersService.addMember(
      accountId,
      projectId,
      input,
    );
    return { data };
  }

  @AdminOnly()
  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    await this.projectMembersService.removeMember(accountId, projectId, userId);
  }
}
