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
// no Google. Achado A33 da auditoria de 30 ago 2026: drive.file é uma
// concessão por (app, usuário, arquivo), então "qualquer admin
// conectado" não enxerga o arquivo que outro admin escolheu -- cada
// OfficeLink guarda quem de fato o criou (linkedByUserId) e
// resolveDriveAccessToken prefere a credencial dessa pessoa; só cai no
// "qualquer admin" (agora com orderBy determinístico) quando o vínculo
// não tem dono conhecido (linhas antigas, ou pasta/XML cujo dono é só
// quem resolveu a credencial na hora de criar).
@Injectable()
export class GoogleDriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCredentialsService: GoogleCredentialsService,
    @Inject(DRIVE_CLIENT) private readonly driveClient: DriveClient,
  ) {}

  // Achado A33 da auditoria de 30 ago 2026: drive.file é uma concessão
  // por (app, usuário, arquivo) -- a credencial de QUALQUER admin não
  // enxerga o arquivo que outro admin escolheu pelo Picker. preferUserId
  // (o linkedByUserId do vínculo, quando existe) faz a checagem de fato
  // usar quem escolheu o arquivo; só cai no "qualquer admin" (com
  // orderBy determinístico, sem depender de qual linha o Postgres decide
  // devolver primeiro) quando não há um dono conhecido, ou a credencial
  // dessa pessoa não existe mais.
  private async resolveDriveAccessToken(
    accountId: string,
    preferUserId?: string | null,
  ): Promise<{ accessToken: string; userId: string }> {
    if (preferUserId) {
      const preferred = await this.prisma.db.googleCredential.findFirst({
        where: { userId: preferUserId, scope: { contains: DRIVE_FILE_SCOPE } },
      });
      if (preferred) {
        return { accessToken: await this.googleCredentialsService.getAccessToken(preferred.userId), userId: preferred.userId };
      }
    }
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
      orderBy: { userId: 'asc' },
    });
    if (!credential) {
      throw new ApiError(
        'GOOGLE_DRIVE_NOT_CONNECTED',
        'Nenhum admin desta conta conectou o Google com acesso ao Drive ainda -- conecte em Equipe (Sincronização Google) antes de provisionar pastas.',
        422,
      );
    }
    return { accessToken: await this.googleCredentialsService.getAccessToken(credential.userId), userId: credential.userId };
  }

  // Idempotente: reaproveita a pasta raiz e as pastas de fase que já
  // existem (marcadas por documentType, ver schema.prisma) -- clicar de
  // novo depois de uma fase nova ser contratada só cria o que falta, não
  // duplica a árvore inteira. Só fases contratadas ganham pasta -- a
  // mesma regra de negócio que já vale pro faturamento por fase.
  // accessToken opcional -- achado real de revisão: archiveFiscalXml
  // sempre precisa de um token pro upload em si, então resolvê-lo de novo
  // aqui dentro (quando a árvore de pastas precisa ser criada) duplicava
  // a consulta de admin/credencial e um possível refresh de OAuth.
  // Chamadores que já têm uma credencial resolvida (archiveFiscalXml)
  // passam a deles; os demais (ensureProjectFolderTree chamado direto do
  // controller) continuam resolvendo por conta própria, como antes.
  async ensureProjectFolderTree(
    accountId: string,
    projectId: string,
    resolved?: { accessToken: string; userId: string },
  ) {
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

    const { accessToken: token, userId: linkedByUserId } = resolved ?? (await this.resolveDriveAccessToken(accountId));
    const created: (typeof existingFolders)[number][] = [];

    // Achado A36 da auditoria de 30 ago 2026: duas chamadas concorrentes
    // (duplo clique, dois membros da equipe) liam o mesmo estado "sem
    // pasta raiz" e ambas chamavam createFolder -- sem transação nem
    // constraint, duas pastas raiz nasciam no Drive. O índice único
    // parcial da migration (OfficeLink_unique_pasta_projeto/_pasta_fase)
    // faz a SEGUNDA gravação estourar P2002 em vez de duplicar; aqui só
    // trata isso como "outro processo já criou", relendo o que existe.
    let root = existingRoot;
    if (!root) {
      const folder = await this.driveClient.createFolder(token, project.name);
      try {
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
            linkedByUserId,
          },
        });
        created.push(root);
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        root = await this.prisma.db.officeLink.findFirst({
          where: { accountId, entityType: 'PROJECT', entityId: projectId, provider: 'DRIVE', documentType: 'pasta_projeto' },
        });
        if (!root) throw error;
        // A recuperação não veio de existingFolders (lido ANTES da
        // corrida) nem do create acima (que falhou) -- sem isto, root
        // fica correto localmente (usado no loop de fases abaixo) mas
        // desaparece do valor de RETORNO, quebrando archiveFiscalXml
        // (que faz folders.find(documentType === 'pasta_projeto')) pra
        // quem ganhou a corrida e caiu neste ramo.
        created.push(root);
      }
    }

    for (const phase of missingPhases) {
      const label = STAGE_LABELS[phase.stage] ?? phase.stage;
      const folder = await this.driveClient.createFolder(token, label, root.externalId);
      try {
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
            linkedByUserId,
          },
        });
        created.push(link);
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        const link = await this.prisma.db.officeLink.findFirst({
          where: { accountId, provider: 'DRIVE', documentType: 'pasta_fase', phaseId: phase.id },
        });
        if (!link) throw error;
        created.push(link);
      }
    }

    return [...existingFolders, ...created];
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
  }

  // Achado A38 da auditoria de 30 ago 2026: officeLinkInputSchema aceitava
  // qualquer externalId como se fosse um arquivo de verdade, sem nenhuma
  // chamada ao Drive -- OfficeLinksService.createForProject usa isto pra
  // confirmar o arquivo antes de marcar lastCheckedAt (condição que o
  // checklist de documentos obrigatórios agora exige). accessToken aqui é
  // o token EFÊMERO do Picker do próprio navegador (drive.file, só desta
  // sessão) -- nunca persistido, só usado nesta chamada única.
  async verifyFileAccessible(accessToken: string, fileId: string): Promise<boolean> {
    try {
      const file = await this.driveClient.getFile(accessToken, fileId);
      return !!file && !file.trashed;
    } catch {
      return false;
    }
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

    // Achado A33: token de fallback resolvido uma vez (usado só quando um
    // vínculo não tem linkedByUserId ou a credencial dessa pessoa sumiu).
    const fallback = await this.resolveDriveAccessToken(accountId);
    const newlyBroken: string[] = [];
    let checked = 0;

    for (const link of links) {
      // Achado A34: um erro num vínculo (rate limit, 5xx, token expirado
      // no meio da varredura) não pode abortar a conta inteira -- antes
      // disso acontecer, os vínculos já processados ficavam com brokenAt
      // gravado mas a notificação nunca saía (a exceção subia até o cron,
      // que só loga e pula a conta), e o vínculo com erro ficava
      // marcado "quebrado" pra sempre no ciclo seguinte porque
      // `isBroken && !link.brokenAt` já seria falso.
      let file: Awaited<ReturnType<typeof this.driveClient.getFile>>;
      try {
        const token = link.linkedByUserId ? (await this.resolveDriveAccessToken(accountId, link.linkedByUserId)).accessToken : fallback.accessToken;
        file = await this.driveClient.getFile(token, link.externalId);
      } catch {
        // Indeterminado (403/429/5xx) -- não é prova de que o arquivo
        // sumiu, só que esta verificação falhou agora. Não marca quebrado,
        // não aborta a conta: tenta de novo no próximo ciclo.
        continue;
      }
      checked++;
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

    return { checked, newlyBroken };
  }

  // Arquiva um XML fiscal assinado (emissão/cancelamento/substituição de
  // NFS-e, ver NfseService) na pasta raiz do projeto -- pedido direto do
  // usuário: reaproveita o pipeline de Drive já existente em vez do disco
  // `araci-fiscal-xml`, que ficava provisionado sem nenhum código
  // escrevendo nele. `ensureProjectFolderTree` garante a pasta raiz (cria
  // se ainda não existir, idempotente); `visibleToClient: false` sempre
  // -- é arquivo interno/contábil, o cliente já recebe a via dele da
  // própria SEFIN/prefeitura quando a NFS-e é autorizada.
  //
  // Lança em vez de engolir o erro aqui: quem chama (NfseService) decide
  // o que fazer com a falha (nunca bloquear a ação fiscal em si, só
  // registrar) -- este método não sabe nem precisa saber que existe uma
  // Invoice do outro lado.
  async archiveFiscalXml(accountId: string, projectId: string, fileName: string, xmlContent: string) {
    // Resolvido uma vez só e repassado pra ensureProjectFolderTree -- ver
    // comentário lá; esta chamada sempre precisa do token pro upload,
    // então deixar ensureProjectFolderTree resolver de novo por conta
    // própria dobrava a consulta de admin/credencial sem necessidade.
    const resolved = await this.resolveDriveAccessToken(accountId);
    const folders = await this.ensureProjectFolderTree(accountId, projectId, resolved);
    const root = folders.find((f) => f.documentType === 'pasta_projeto');
    if (!root) {
      throw new Error('Pasta raiz do projeto não encontrada/criada no Drive.');
    }

    const file = await this.driveClient.uploadFile(
      resolved.accessToken,
      root.externalId,
      fileName,
      Buffer.from(xmlContent, 'utf-8'),
      'application/xml',
    );

    return this.prisma.db.officeLink.create({
      data: {
        accountId,
        entityType: 'PROJECT',
        entityId: projectId,
        provider: 'DRIVE',
        externalId: file.id,
        url: file.url,
        title: file.name,
        documentType: 'nfse',
        visibleToClient: false,
        linkedByUserId: resolved.userId,
      },
    });
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

    const { accessToken } = await this.resolveDriveAccessToken(accountId, link.linkedByUserId);
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

    const { accessToken } = await this.resolveDriveAccessToken(accountId, link.linkedByUserId);
    const revisions = await this.driveClient.listRevisions(accessToken, link.externalId);
    // Mais recente primeiro -- é o que interessa de cara ("o que mudou
    // por último"), não a ordem cronológica crescente que a API devolve.
    return [...revisions].sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  }
}
