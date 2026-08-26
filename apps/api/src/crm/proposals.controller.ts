import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ProposalsService,
  proposalInputSchema,
  statusUpdateSchema,
  type ProposalInput,
  type ProposalStatusUpdate,
} from './proposals.service';
import { ProposalSigningService } from './proposal-signing.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/proposals')
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly proposalSigningService: ProposalSigningService,
  ) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Query('opportunityId') opportunityId?: string,
  ) {
    const data = await this.proposalsService.listProposals(
      accountId,
      opportunityId,
    );
    return { data };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.proposalsService.getProposal(accountId, id);
    return { data };
  }

  // Somente leitura — as linhas de ProposalStage são geradas por
  // calcularProposta() na criação da proposta, não editadas diretamente.
  @Get(':id/stages')
  async stages(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const proposal = await this.proposalsService.getProposal(accountId, id);
    return { data: proposal.stages };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(proposalInputSchema)) input: ProposalInput,
  ) {
    const data = await this.proposalsService.createProposal(accountId, input);
    return { data };
  }

  // Só transição de status (draft → sent → signed/expired). value,
  // complexityMultiplier e as stages são derivados do cálculo na criação
  // — não são editáveis aqui; para mudar o cálculo, crie uma nova proposta.
  @Patch(':id')
  async updateStatus(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusUpdateSchema))
    input: ProposalStatusUpdate,
  ) {
    const data = await this.proposalsService.updateProposalStatus(
      accountId,
      id,
      input,
    );
    return { data };
  }

  // Cria o documento na ZapSign de verdade (não um flag de status
  // solto) -- ver ProposalSigningService. status vira "sent" só se a
  // chamada pra ZapSign realmente funcionar.
  @Post(':id/send-for-signature')
  @HttpCode(200)
  async sendForSignature(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    const data = await this.proposalSigningService.sendForSignature(accountId, id);
    return { data };
  }
}
