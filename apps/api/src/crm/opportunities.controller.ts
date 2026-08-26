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
  OpportunitiesService,
  opportunityInputSchema,
  opportunityUpdateSchema,
  type OpportunityInput,
  type OpportunityUpdateInput,
} from './opportunities.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

@Controller('v1/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.opportunitiesService.listOpportunities(accountId);
    return { data };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.opportunitiesService.getOpportunity(accountId, id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(opportunityInputSchema))
    input: OpportunityInput,
  ) {
    const data = await this.opportunitiesService.createOpportunity(
      accountId,
      input,
    );
    return { data };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(opportunityUpdateSchema))
    body: OpportunityUpdateInput,
  ) {
    const opportunity = await this.opportunitiesService.updateOpportunity(
      accountId,
      id,
      {
        ...body,
        wonAt:
          body.wonAt === undefined
            ? undefined
            : body.wonAt === null
              ? null
              : new Date(body.wonAt),
        lostAt:
          body.lostAt === undefined
            ? undefined
            : body.lostAt === null
              ? null
              : new Date(body.lostAt),
      },
    );

    // Fluxo automático #1: marcar como ganha converte em projeto, sem
    // redigitação. Idempotente, então repetir o PATCH com o mesmo wonAt
    // não cria um segundo projeto.
    if (opportunity.wonAt) {
      await this.opportunitiesService.convertToProject(accountId, id);
    }

    const data = await this.opportunitiesService.getOpportunity(accountId, id);
    return { data };
  }

  @AdminOnly()
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.opportunitiesService.deleteOpportunity(accountId, id);
  }
}
