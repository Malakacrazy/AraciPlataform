import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ProjectMembersService, addMemberSchema, type AddMemberInput } from './project-members.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/projects/:projectId/members')
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.projectMembersService.listMembers(accountId, projectId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async add(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(addMemberSchema)) input: AddMemberInput,
  ) {
    const data = await this.projectMembersService.addMember(accountId, projectId, input);
    return { data };
  }

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
