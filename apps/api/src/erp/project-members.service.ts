import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';
import { UsersService } from './users.service';

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  roleOnProject: z.string().min(1).optional(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
  ) {}

  async listMembers(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.projectMember.findMany({
      where: { projectId },
      include: { user: true },
    });
  }

  async addMember(accountId: string, projectId: string, input: AddMemberInput) {
    await this.projectsService.getProject(accountId, projectId);
    await this.usersService.getUser(accountId, input.userId); // 404 se o usuário não é desta conta

    const existing = await this.prisma.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: input.userId } },
    });
    if (existing) {
      throw new ApiError(
        'ALREADY_MEMBER',
        'Este colaborador já está na equipe deste projeto.',
        409,
      );
    }

    return this.prisma.db.projectMember.create({
      data: {
        projectId,
        userId: input.userId,
        roleOnProject: input.roleOnProject,
      },
      include: { user: true },
    });
  }

  async removeMember(accountId: string, projectId: string, userId: string) {
    await this.projectsService.getProject(accountId, projectId);
    const member = await this.prisma.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new NotFoundError('Membro do projeto');
    }
    await this.prisma.db.projectMember.delete({ where: { id: member.id } });
  }
}
