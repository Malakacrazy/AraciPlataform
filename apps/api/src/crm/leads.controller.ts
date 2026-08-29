import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { LeadsService, leadInputSchema, type LeadInput } from './leads.service';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// 6ª família de rota pública -- ver public.decorator.ts. Só escreve
// (cria Client+Opportunity), nunca lê nada de volta: a resposta é
// genérica de propósito (nenhum id, nenhum dado da conta), mesmo
// espírito de "sem enumeração" do ClientPortalController. O
// O limite de taxa que protege esta rota é o de apps/web/src/
// middleware.ts (POST /lead, por IP real do chamador), não o
// ThrottlerGuard global do apps/api -- aquele chaveia pelo IP do apps/web
// e é o mesmo pra todo mundo, então nunca limitou atacante nenhum aqui
// (achado de revisão de segurança). Mesmo com o limite certo no lugar
// certo, isto não é CAPTCHA: nada impede um script de mandar alguns
// leads falsos por minuto de IPs diferentes. Risco aceito, no roadmap.
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
