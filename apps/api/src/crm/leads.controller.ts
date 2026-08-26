import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { LeadsService, leadInputSchema, type LeadInput } from './leads.service';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// 6ª família de rota pública -- ver public.decorator.ts. Só escreve
// (cria Client+Opportunity), nunca lê nada de volta: a resposta é
// genérica de propósito (nenhum id, nenhum dado da conta), mesmo
// espírito de "sem enumeração" do ClientPortalController. O
// ThrottlerGuard global (ver app.module.ts, 300 req/min) se aplica aqui
// como a toda rota, mas isso é defesa genérica contra abuso de volume,
// não CAPTCHA -- nada impede um script de mandar poucas dezenas de leads
// falsos por minuto. Risco aceito, registrado no roadmap.
@Public()
@Controller('v1/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @HttpCode(201)
  async create(@Body(new ZodValidationPipe(leadInputSchema)) input: LeadInput) {
    await this.leadsService.submitLead(input);
    return { data: { received: true } };
  }
}
