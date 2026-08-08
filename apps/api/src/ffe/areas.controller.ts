import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AreasService, areaInputSchema, type AreaInput } from './areas.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/projects/:projectId/areas')
export class ProjectAreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.areasService.listAreas(accountId, projectId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(areaInputSchema)) input: AreaInput,
  ) {
    const data = await this.areasService.createArea(accountId, projectId, input);
    return { data };
  }
}

@Controller('v1/areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Delete(':id')
  @HttpCode(204)
  async remove(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
    await this.areasService.deleteArea(accountId, id);
  }
}
