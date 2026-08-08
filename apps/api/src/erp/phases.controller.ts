import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { PhasesService, approveGateSchema, type ApproveGateInput } from './phases.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/projects/:projectId/phases')
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.phasesService.listPhases(accountId, projectId);
    return { data };
  }

  // Ação dedicada, não um PATCH genérico na fase — não existe rota para
  // setar approvedAt diretamente, só esta, que aplica as regras do gate
  // (ordem sequencial, canal válido) antes de gravar. 200, não 201 (Nest
  // usa 201 como padrão para POST, mas isto muta uma fase existente, não
  // cria um recurso novo).
  @Post(':phaseId/approve')
  @HttpCode(200)
  async approve(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Body(new ZodValidationPipe(approveGateSchema)) input: ApproveGateInput,
  ) {
    const data = await this.phasesService.approvePhaseGate(accountId, projectId, phaseId, input);
    return { data };
  }
}
