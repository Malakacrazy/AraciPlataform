import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  PhasesService,
  approveGateSchema,
  updatePhaseSchema,
  type ApproveGateInput,
  type UpdatePhaseInput,
} from './phases.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminOnly } from '../auth/admin-only.decorator';

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

  // Lacuna da matriz ("checklist de documentos obrigatórios por fase") --
  // preview do que approve() abaixo vai exigir, pra tela mostrar antes de
  // alguém tentar aprovar e levar um 422.
  @Get(':phaseId/document-checklist')
  async documentChecklist(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
  ) {
    const data = await this.phasesService.getDocumentChecklist(accountId, projectId, phaseId);
    return { data };
  }

  // Ação dedicada, não um PATCH genérico na fase — não existe rota para
  // setar approvedAt diretamente, só esta, que aplica as regras do gate
  // (ordem sequencial, canal válido) antes de gravar. 200, não 201 (Nest
  // usa 201 como padrão para POST, mas isto muta uma fase existente, não
  // cria um recurso novo).
  // @AdminOnly() -- achado real de revisão: faltava aqui, e aprovar um
  // gate destrava faturamento do estágio (Invoice.phaseId) e o início do
  // próximo estágio no PEP; mesma classe de decisão gerencial que já é
  // @AdminOnly() em AllocationsController/AbsencesController.
  @AdminOnly()
  @Post(':phaseId/approve')
  @HttpCode(200)
  async approve(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Body(new ZodValidationPipe(approveGateSchema)) input: ApproveGateInput,
  ) {
    const data = await this.phasesService.approvePhaseGate(
      accountId,
      projectId,
      phaseId,
      input,
    );
    return { data };
  }

  // Diferente do PATCH que .../approve deliberadamente não expõe: aqui só
  // datas/orçamento, nunca approvedAt/stage/order/contracted (estrutural).
  @Patch(':phaseId')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Body(new ZodValidationPipe(updatePhaseSchema)) input: UpdatePhaseInput,
  ) {
    const data = await this.phasesService.updatePhase(
      accountId,
      projectId,
      phaseId,
      input,
    );
    return { data };
  }
}
