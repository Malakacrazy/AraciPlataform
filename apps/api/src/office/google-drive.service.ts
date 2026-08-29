import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { STAGE_LABELS } from '../common/pep-stage-labels';
import { GoogleCredentialsService } from './google-credentials.service';
import { DRIVE_CLIENT, DRIVE_FILE_SCOPE, type DriveClient } from './google-drive-client';

// Lacuna da matriz (gestão documental por projeto) -- recomendação já
// registrada na auditoria: o Drive continua guardando os arquivos, a
// plataforma passa a ser dona só da árvore e dos metadados. A credencial
// usada é a de sincronização (GoogleCredential, por USUÁRIO, ver
// google-credentials.service.ts) -- não existe identidade "do estúdio"
// no Google, então esta classe usa a credencial de QUALQUER admin da
// conta que já conectou com escopo drive.file, a primeira que achar. Se
// essa pessoa desconectar depois, quem provisionou não some (as pastas
// já existem no Drive dela), só a próxima ação (nova pasta, checagem de
// vínculo quebrado) passa a exigir outro admin conectado.
@Injectable()
export class GoogleDriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCredentialsService: GoogleCredentialsService,
    @Inject(DRIVE_CLIENT) private readonly driveClient: DriveClient,
  ) {}

  private async resolveDriveAccessToken(accountId: string): Promise<string> {
    const admins = await this.prisma.db.user.findMany({
      where: { accountId, accessLevel: 'admin' },
      select: { id: true },
    });
    if (admins.length === 0) {
      throw new ApiError(
        'GOOGLE_DRIVE_NOT_CONNECTED',
        'Nenhum admin nesta conta ainda -- não há a quem pedir a credencial do Drive.',
        422,
      );
    }
    const credential = await this.prisma.db.googleCredential.findFirst({
      where: { userId: { in: admins.map((a) => a.id) }, scope: { contains: DRIVE_FILE_SCOPE } },
    });
    if (!credential) {
      throw new ApiError(
        'GOOGLE_DRIVE_NOT_CONNECTED',
        'Nenhum admin desta conta conectou o Google com acesso ao Drive ainda -- conecte em Equipe (Sincronização Google) antes de provisionar pastas.',
        422,
      );
    }
    return this.googleCredentialsService.getAccessToken(credential.userId);
  }

  // Idempotente: reaproveita a pasta raiz e as pastas de fase que já
  // existem (marcadas por documentType, ver schema.prisma) -- clicar de
  // novo depois de uma fase nova ser contratada só cria o que falta, não
  // duplica a árvore inteira. Só fases contratadas ganham pasta -- a
  // mesma regra de negócio que já vale pro faturamento por fase.
  async ensureProjectFolderTree(accountId: string, projectId: string) {
    const project = await this.prisma.db.project.findFirst({
      where: { id: projectId, accountId },
      include: { phases: { where: { contracted: true }, orderBy: { order: 'asc' } } },
    });
    if (!project) {
      throw new NotFoundError('Projeto');
    }

    const existingFolders = await this.prisma.db.officeLink.findMany({
      where: {
        accountId,
        entityType: 'PROJECT',
        entityId: projectId,
        provider: 'DRIVE',
        documentType: { in: ['pasta_projeto', 'pasta_fase'] },
      },
    });
    const existingRoot = existingFolders.find((f) => f.documentType === 'pasta_projeto') ?? null;
    const existingPhaseIds = new Set(existingFolders.map((f) => f.phaseId).filter((id): id is string => !!id));
    const missingPhases = project.phases.filter((phase) => !existingPhaseIds.has(phase.id));

    if (existingRoot && missingPhases.length === 0) {
      return existingFolders;
    }

    const accessToken = await this.resolveDriveAccessToken(accountId);
    const created: (typeof existingFolders)[number][] = [];

    let root = existingRoot;
    if (!root) {
      const folder = await this.driveClient.createFolder(accessToken, project.name);
      root = await this.prisma.db.officeLink.create({
        data: {
          accountId,
          entityType: 'PROJECT',
          entityId: projectId,
          provider: 'DRIVE',
          externalId: folder.id,
          url: folder.url,
          title: folder.name,
          documentType: 'pasta_projeto',
        },
      });
      created.push(root);
    }

    for (const phase of missingPhases) {
      const label = STAGE_LABELS[phase.stage] ?? phase.stage;
      const folder = await this.driveClient.createFolder(accessToken, label, root.externalId);
      const link = await this.prisma.db.officeLink.create({
        data: {
          accountId,
          entityType: 'PROJECT',
          entityId: projectId,
          provider: 'DRIVE',
          externalId: folder.id,
          url: folder.url,
          title: folder.name,
          documentType: 'pasta_fase',
          phaseId: phase.id,
        },
      });
      created.push(link);
    }

    return [...existingFolders, ...created];
  }

  // Achado da auditoria: "hoje o link apodrece em silêncio" -- arquivo
  // movido/renomeado/excluído no Drive não avisa ninguém. Verifica todos
  // os OfficeLink provider=DRIVE de UMA conta (usada tanto pela checagem
  // sob demanda quanto pelo cron, que chama isto uma vez por conta).
  // Contas sem ninguém conectado são puladas (não é erro do cron, só não
  // dá pra verificar sem credencial).
  async checkBrokenLinksForAccount(accountId: string): Promise<{ checked: number; newlyBroken: string[] }> {
    const links = await this.prisma.db.officeLink.findMany({
      where: { accountId, provider: 'DRIVE' },
    });
    if (links.length === 0) {
      return { checked: 0, newlyBroken: [] };
    }

    const accessToken = await this.resolveDriveAccessToken(accountId);
    const newlyBroken: string[] = [];

    for (const link of links) {
      const file = await this.driveClient.getFile(accessToken, link.externalId);
      const isBroken = !file || file.trashed;
      if (isBroken && !link.brokenAt) {
        newlyBroken.push(link.id);
      }
      await this.prisma.db.officeLink.update({
        where: { id: link.id },
        data: {
          lastCheckedAt: new Date(),
          brokenAt: isBroken ? (link.brokenAt ?? new Date()) : null,
        },
      });
    }

    return { checked: links.length, newlyBroken };
  }

  // Item "grande" da lista de 11 (deliberadamente adiado até aqui, ver
  // roadmap) -- só o que a equipe marcou visibleToClient=true chega ao
  // portal/link de apresentação, e só o que ainda não está quebrado
  // (achado sobre link apodrecido em silêncio não faz sentido oferecer
  // pra download também). accountId aqui não vem de uma sessão de staff
  // -- PublicPresentationService o resolve a partir do próprio Project,
  // mesmo princípio de "escopo validado na service layer" do resto do
  // OfficeLink.
  async listClientVisibleDocuments(accountId: string, projectId: string) {
    return this.prisma.db.officeLink.findMany({
      where: {
        accountId,
        entityType: 'PROJECT',
        entityId: projectId,
        provider: 'DRIVE',
        visibleToClient: true,
        brokenAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, documentType: true, phase: { select: { stage: true } } },
    });
  }

  // Mesma checagem de escopo de listClientVisibleDocuments (conta +
  // projeto + visibleToClient + não quebrado) antes de sequer tentar
  // falar com o Drive -- um documento que a equipe nunca marcou como
  // visível não deveria ser baixável só por alguém adivinhar o id.
  async downloadClientVisibleDocument(accountId: string, projectId: string, officeLinkId: string) {
    const link = await this.prisma.db.officeLink.findFirst({
      where: {
        id: officeLinkId,
        accountId,
        entityType: 'PROJECT',
        entityId: projectId,
        provider: 'DRIVE',
        visibleToClient: true,
        brokenAt: null,
      },
    });
    if (!link) {
      throw new NotFoundError('Documento');
    }

    const accessToken = await this.resolveDriveAccessToken(accountId);
    return this.driveClient.downloadFile(accessToken, link.externalId);
  }

  // Item deixado de fora deliberadamente na rodada de gestão documental
  // ("versionamento -- expor revisões do Drive"), agora fechado: staff
  // só, escopado por conta (mesmo padrão de getFile/downloadFile) --
  // provider != DRIVE (Calendar/Gmail não tem revisão nenhuma) cai no
  // mesmo 404 de um vínculo que não existe, não um 422 à parte.
  async listRevisions(accountId: string, officeLinkId: string) {
    const link = await this.prisma.db.officeLink.findFirst({
      where: { id: officeLinkId, accountId, provider: 'DRIVE' },
    });
    if (!link) {
      throw new NotFoundError('Vínculo do Drive');
    }

    const accessToken = await this.resolveDriveAccessToken(accountId);
    const revisions = await this.driveClient.listRevisions(accessToken, link.externalId);
    // Mais recente primeiro -- é o que interessa de cara ("o que mudou
    // por último"), não a ordem cronológica crescente que a API devolve.
    return [...revisions].sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  }
}
