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
  // Lacuna da matriz (LGPD) -- achado da auditoria: "o formulário público
  // coleta dado pessoal sem base declarada". .literal(true) em vez de só
  // z.boolean(): um checkbox desmarcado nem aparece no corpo (HTML padrão
  // pra checkbox não marcado), então isto rejeita tanto "false" quanto
  // "ausente" com a mesma mensagem, sem precisar de .refine().
  consent: z.literal(true, 'É necessário aceitar para enviarmos seu contato.'),
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
  // Reaproveita o Client existente pelo e-mail em vez de sempre criar um
  // novo -- Client.email agora é @unique (achado A-05 da auditoria:
  // login do portal buscava por e-mail sem constraint nenhuma), então um
  // segundo envio do formulário público com o mesmo e-mail (visitante
  // manda de novo, ou já é cliente) violaria a constraint se tentasse
  // criar outro Client. Um contato repetido é uma Opportunity nova pro
  // mesmo Client, não um Client duplicado -- mais correto que a lacuna
  // que isso substitui, não só um jeito de não quebrar.
  async submitLead(input: LeadInput) {
    const account = await this.prisma.db.account.findFirst();
    if (!account) {
      throw new NotFoundError('Conta do estúdio');
    }

    const email = input.email.toLowerCase();
    const existingClient = await this.prisma.db.client.findUnique({ where: { email } });
    const client =
      existingClient ??
      (await this.clientsService.createClient(account.id, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: 'site',
      }));

    // Lacuna da matriz (LGPD) -- registra a base legal desta coleta
    // específica, mesmo quando reaproveita um Client já existente (achado
    // A-05): cada envio do formulário é um evento de consentimento novo,
    // não só o primeiro.
    await this.prisma.db.client.update({
      where: { id: client.id },
      data: { consentedAt: new Date() },
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
