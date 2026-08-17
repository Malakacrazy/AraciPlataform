import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../erp/projects.service';

// Lado da equipe (autenticado, escopado por accountId como o resto da
// API) — cria/consulta/revoga o link. O acesso do cliente em si é o
// PublicPresentationService, sem sessão nenhuma, escopado só pelo token.
@Injectable()
export class PresentationLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getLink(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.presentationLink.findUnique({ where: { projectId } });
  }

  // Gerar de novo substitui o token anterior (upsert) — é a forma de
  // "revogar e reemitir" num passo só, para o caso de um link ter
  // vazado. token vem de crypto.randomUUID(), não do id/cuid do
  // registro — cuid existe para unicidade, não foi desenhado para ser
  // imprevisível como credencial de portador (ver comentário no schema).
  async regenerateLink(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    const token = randomUUID();
    return this.prisma.db.presentationLink.upsert({
      where: { projectId },
      update: { token },
      create: { projectId, token },
    });
  }

  async revokeLink(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    // deleteMany, não delete: revogar um link que já não existe não é
    // erro, é o resultado desejado (idempotente).
    await this.prisma.db.presentationLink.deleteMany({ where: { projectId } });
  }
}
