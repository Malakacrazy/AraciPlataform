import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ClientsService } from './clients.service';

export const leadInputSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().optional(),
  message: z.string().max(2000).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  // Formulário público (sem sessão) -- ver LeadsController e
  // public.decorator.ts. Fase 1 tem uma única conta (não existe signup),
  // então resolve accountId do mesmo jeito que
  // AuthService.ensureAccountAndUser resolve pro primeiro login: não tem
  // token nenhum pra tirar isso de dentro.
  //
  // Sempre cria um Client novo, nunca tenta casar por e-mail com um já
  // existente -- dedupe de contato é um problema à parte, já registrado
  // como redline do próprio módulo Clients na auditoria; misturar essa
  // lógica aqui só pra este formulário criaria dois caminhos diferentes
  // de dedupe no futuro.
  async submitLead(input: LeadInput) {
    const account = await this.prisma.db.account.findFirst();
    if (!account) {
      throw new NotFoundError('Conta do estúdio');
    }

    const client = await this.clientsService.createClient(account.id, {
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: 'site',
    });

    // feeModel/stage não vêm do formulário -- um visitante anônimo não
    // tem como saber que "hora_tecnica" é o único modelo em uso real
    // hoje (ver opportunities.service.ts); a equipe ajusta depois do
    // primeiro contato, como faria com um lead recebido por telefone.
    await this.prisma.db.opportunity.create({
      data: {
        clientId: client.id,
        title: `Novo lead — ${input.name}`,
        stage: 'novo_lead',
        feeModel: 'hora_tecnica',
        leadMessage: input.message,
      },
    });
  }
}
