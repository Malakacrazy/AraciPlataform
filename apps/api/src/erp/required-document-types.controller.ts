import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  RequiredDocumentTypesService,
  requiredDocumentTypeInputSchema,
  type RequiredDocumentTypeInput,
} from './required-document-types.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

// Lacuna da matriz ("checklist de documentos obrigatórios por fase") --
// @AdminOnly: exigir documento pra aprovar gate é decisão de processo do
// estúdio, mesmo padrão de acesso a tarifas/custos fixos.
@AdminOnly()
@Controller('v1/required-document-types')
export class RequiredDocumentTypesController {
  constructor(private readonly requiredDocumentTypesService: RequiredDocumentTypesService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.requiredDocumentTypesService.listForAccount(accountId);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(requiredDocumentTypeInputSchema)) input: RequiredDocumentTypeInput,
  ) {
    const data = await this.requiredDocumentTypesService.create(accountId, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.requiredDocumentTypesService.delete(accountId, id);
  }
}
