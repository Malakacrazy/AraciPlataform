import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  SpecificationsService,
  specificationInputSchema,
  specificationUpdateSchema,
  type SpecificationInput,
  type SpecificationUpdateInput,
} from './specifications.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/areas/:areaId/specifications')
export class AreaSpecificationsController {
  constructor(private readonly specificationsService: SpecificationsService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType, @Param('areaId') areaId: string) {
    const data = await this.specificationsService.listSpecifications(accountId, areaId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('areaId') areaId: string,
    @Body(new ZodValidationPipe(specificationInputSchema)) input: SpecificationInput,
  ) {
    const data = await this.specificationsService.createSpecification(accountId, areaId, input);
    return { data };
  }
}

@Controller('v1/specifications')
export class SpecificationsController {
  constructor(private readonly specificationsService: SpecificationsService) {}

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(specificationUpdateSchema)) input: SpecificationUpdateInput,
  ) {
    const data = await this.specificationsService.updateSpecification(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
    await this.specificationsService.deleteSpecification(accountId, id);
  }
}

const checkoutSchema = z.object({
  specificationIds: z.array(z.string().min(1)).min(1),
});

// Fluxo automático #3 — ver SpecificationsService.approveCartToInvoiceDraft
// para a lógica completa.
@Controller('v1/projects/:projectId/ffe-checkout')
export class FfeCheckoutController {
  constructor(private readonly specificationsService: SpecificationsService) {}

  @Post()
  @HttpCode(201)
  async checkout(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(checkoutSchema)) body: { specificationIds: string[] },
  ) {
    const data = await this.specificationsService.approveCartToInvoiceDraft(
      accountId,
      projectId,
      body.specificationIds,
    );
    return { data };
  }
}
