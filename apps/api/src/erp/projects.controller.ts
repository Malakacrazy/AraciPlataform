import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ProjectsService,
  projectUpdateSchema,
  type ProjectUpdateInput,
} from './projects.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// Sem POST aqui de propósito: um Project só nasce via
// OpportunitiesService.convertToProject (Opportunity.wonAt), nunca criado
// do zero pela API — não há um segundo caminho de criação no plano.
@Controller('v1/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.projectsService.listProjects(accountId);
    return { data };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.projectsService.getProject(accountId, id);
    return { data };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(projectUpdateSchema)) input: ProjectUpdateInput,
  ) {
    const data = await this.projectsService.updateProject(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.projectsService.deleteProject(accountId, id);
  }
}
