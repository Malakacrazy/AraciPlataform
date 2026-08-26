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
  ActivitiesService,
  activityInputSchema,
  type ActivityInput,
} from './activities.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/projects/:projectId/activities')
export class ProjectActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.activitiesService.listForProject(accountId, projectId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(activityInputSchema)) input: ActivityInput,
  ) {
    const data = await this.activitiesService.createForProject(accountId, userId, projectId, input);
    return { data };
  }
}

@Controller('v1/clients/:clientId/activities')
export class ClientActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('clientId') clientId: string,
  ) {
    const data = await this.activitiesService.listForClient(accountId, clientId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Param('clientId') clientId: string,
    @Body(new ZodValidationPipe(activityInputSchema)) input: ActivityInput,
  ) {
    const data = await this.activitiesService.createForClient(accountId, userId, clientId, input);
    return { data };
  }
}

@Controller('v1/opportunities/:opportunityId/activities')
export class OpportunityActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('opportunityId') opportunityId: string,
  ) {
    const data = await this.activitiesService.listForOpportunity(accountId, opportunityId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId, userId }: SessionAccountType,
    @Param('opportunityId') opportunityId: string,
    @Body(new ZodValidationPipe(activityInputSchema)) input: ActivityInput,
  ) {
    const data = await this.activitiesService.createForOpportunity(accountId, userId, opportunityId, input);
    return { data };
  }
}

@Controller('v1/activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.activitiesService.deleteActivity(accountId, id);
  }
}
