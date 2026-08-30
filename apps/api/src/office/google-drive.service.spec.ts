import { GoogleDriveService } from './google-drive.service';
import type { DriveClient, DriveFolder, DriveFileMetadata, DriveFileContent, DriveRevision } from './google-drive-client';

// Lacuna da matriz (gestão documental por projeto) -- "cobertura com uma
// porta fake do Drive, sem chamar o Google no teste", pedido explícito da
// auditoria. FakeDriveClient/fakePrisma abaixo são o suficiente da
// interface real pra exercitar GoogleDriveService de ponta a ponta sem
// rede nem banco de verdade -- mesmo espírito dos outros specs deste
// projeto (fator-r.spec.ts, pricing.spec.ts), só que testando uma classe
// com dependências em vez de uma função pura.
class FakeDriveClient implements DriveClient {
  private nextId = 1;
  public createdFolders: { name: string; parentId?: string }[] = [];
  // fileId -> null significa "não existe mais" (404)
  public files = new Map<string, DriveFileMetadata | null>();

  async createFolder(_accessToken: string, name: string, parentId?: string): Promise<DriveFolder> {
    this.createdFolders.push({ name, parentId });
    const id = `folder-${this.nextId++}`;
    return { id, name, url: `https://drive.example/${id}` };
  }

  async getFile(_accessToken: string, fileId: string): Promise<DriveFileMetadata | null> {
    return this.files.has(fileId) ? this.files.get(fileId)! : null;
  }

  public downloads = new Map<string, DriveFileContent>();

  async downloadFile(_accessToken: string, fileId: string): Promise<DriveFileContent> {
    const content = this.downloads.get(fileId);
    if (!content) {
      throw new Error(`Arquivo ${fileId} não está mais disponível no Drive.`);
    }
    return content;
  }

  public revisions = new Map<string, DriveRevision[]>();

  async listRevisions(_accessToken: string, fileId: string): Promise<DriveRevision[]> {
    return this.revisions.get(fileId) ?? [];
  }

  public uploadedFiles: { parentFolderId: string; fileName: string; content: Buffer; mimeType: string }[] = [];
  // Setar isto num teste simula upload falhando (ex.: credencial revogada
  // entre a autorização da NFS-e e o arquivamento) sem precisar mockar o
  // fetch de verdade.
  public uploadShouldFail = false;

  async uploadFile(
    _accessToken: string,
    parentFolderId: string,
    fileName: string,
    content: Buffer,
    mimeType: string,
  ): Promise<DriveFolder> {
    if (this.uploadShouldFail) {
      throw new Error('Falha simulada de upload pro Drive.');
    }
    this.uploadedFiles.push({ parentFolderId, fileName, content, mimeType });
    const id = `file-${this.nextId++}`;
    return { id, name: fileName, url: `https://drive.example/${id}` };
  }
}

interface FakeOfficeLink {
  id: string;
  accountId: string;
  entityType: string;
  entityId: string;
  provider: string;
  externalId: string;
  url: string;
  title: string;
  documentType: string | null;
  phaseId: string | null;
  visibleToClient: boolean;
  brokenAt: Date | null;
  lastCheckedAt: Date | null;
}

function matchesOfficeLinkWhere(link: FakeOfficeLink, where: any): boolean {
  if (where.id && link.id !== where.id) return false;
  if (where.accountId && link.accountId !== where.accountId) return false;
  if (where.entityType && link.entityType !== where.entityType) return false;
  if (where.entityId && link.entityId !== where.entityId) return false;
  if (where.provider && link.provider !== where.provider) return false;
  if (where.documentType?.in && !where.documentType.in.includes(link.documentType)) return false;
  if (where.visibleToClient !== undefined && link.visibleToClient !== where.visibleToClient) return false;
  if (where.brokenAt === null && link.brokenAt !== null) return false;
  return true;
}

// Só o recorte de PrismaService.db que GoogleDriveService de fato chama --
// findMany/create/update em memória, findFirst simplificado (primeiro que
// bater no where). Suficiente pra exercitar a lógica real sem Postgres.
function createFakePrisma(seed: {
  project?: { id: string; accountId: string; name: string; phases: { id: string; stage: string; order: number; contracted: boolean }[] };
  admins?: { id: string; accountId: string }[];
  credentials?: { userId: string; scope: string }[];
  officeLinks?: FakeOfficeLink[];
}) {
  const officeLinks = seed.officeLinks ?? [];
  let nextLinkId = 1;

  return {
    db: {
      project: {
        findFirst: async ({ where }: any) => {
          if (!seed.project || seed.project.id !== where.id || seed.project.accountId !== where.accountId) {
            return null;
          }
          return {
            ...seed.project,
            phases: seed.project.phases.filter((p) => p.contracted),
          };
        },
      },
      user: {
        findMany: async ({ where }: any) =>
          (seed.admins ?? []).filter((a) => a.accountId === where.accountId),
      },
      googleCredential: {
        findFirst: async ({ where }: any) => {
          const userIds: string[] = where.userId.in;
          return (seed.credentials ?? []).find(
            (c) => userIds.includes(c.userId) && c.scope.includes(where.scope.contains),
          ) ?? null;
        },
      },
      officeLink: {
        findMany: async ({ where }: any) => officeLinks.filter((link) => matchesOfficeLinkWhere(link, where)),
        findFirst: async ({ where }: any) => officeLinks.find((link) => matchesOfficeLinkWhere(link, where)) ?? null,
        create: async ({ data }: any) => {
          const link: FakeOfficeLink = {
            id: `link-${nextLinkId++}`,
            documentType: null,
            phaseId: null,
            visibleToClient: false,
            brokenAt: null,
            lastCheckedAt: null,
            ...data,
          };
          officeLinks.push(link);
          return link;
        },
        update: async ({ where, data }: any) => {
          const link = officeLinks.find((l) => l.id === where.id)!;
          Object.assign(link, data);
          return link;
        },
      },
    },
  };
}

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

describe('GoogleDriveService.ensureProjectFolderTree', () => {
  const project = {
    id: 'proj-1',
    accountId: 'acc-1',
    name: 'Apto Vila Madalena',
    phases: [
      { id: 'phase-1', stage: 'CAPTACAO_ALINHAMENTO', order: 1, contracted: true },
      { id: 'phase-2', stage: 'BRIEFING', order: 2, contracted: true },
      { id: 'phase-3', stage: 'EXECUTIVO', order: 3, contracted: false }, // não contratada -- não deve ganhar pasta
    ],
  };
  const admins = [{ id: 'user-1', accountId: 'acc-1' }];
  const credentials = [{ userId: 'user-1', scope: DRIVE_FILE_SCOPE }];

  it('cria a pasta raiz + uma por fase contratada, ignorando a não contratada', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ project, admins, credentials });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    const links = await service.ensureProjectFolderTree('acc-1', 'proj-1');

    expect(drive.createdFolders).toHaveLength(3); // raiz + 2 fases contratadas
    expect(drive.createdFolders[0]).toEqual({ name: 'Apto Vila Madalena', parentId: undefined });
    expect(drive.createdFolders[1].name).toBe('Captação/Alinhamento');
    expect(drive.createdFolders[2].name).toBe('Briefing');
    expect(links.some((l) => l.documentType === 'pasta_projeto')).toBe(true);
    expect(links.filter((l) => l.documentType === 'pasta_fase')).toHaveLength(2);
  });

  it('é idempotente -- rodar de novo não recria pasta nenhuma', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ project, admins, credentials });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    await service.ensureProjectFolderTree('acc-1', 'proj-1');
    const secondRun = await service.ensureProjectFolderTree('acc-1', 'proj-1');

    expect(drive.createdFolders).toHaveLength(3); // não dobrou na 2ª chamada
    expect(secondRun).toHaveLength(3);
  });

  it('cria só a pasta que falta quando uma fase nova passa a existir', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ project, admins, credentials });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    await service.ensureProjectFolderTree('acc-1', 'proj-1');
    project.phases[2].contracted = true; // Executivo passa a ser contratada
    const afterNewPhase = await service.ensureProjectFolderTree('acc-1', 'proj-1');
    project.phases[2].contracted = false; // não vazar estado pro próximo teste

    expect(drive.createdFolders).toHaveLength(4); // 3 de antes + 1 nova
    expect(drive.createdFolders[3].name).toBe('Executivo');
    expect(afterNewPhase.filter((l) => l.documentType === 'pasta_fase')).toHaveLength(3);
  });

  it('recusa provisionar sem nenhum admin com o Drive conectado', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ project, admins, credentials: [] }); // ninguém conectou
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    await expect(service.ensureProjectFolderTree('acc-1', 'proj-1')).rejects.toMatchObject({
      code: 'GOOGLE_DRIVE_NOT_CONNECTED',
    });
    expect(drive.createdFolders).toHaveLength(0);
  });
});

describe('GoogleDriveService.checkBrokenLinksForAccount', () => {
  const admins = [{ id: 'user-1', accountId: 'acc-1' }];
  const credentials = [{ userId: 'user-1', scope: DRIVE_FILE_SCOPE }];

  it('marca brokenAt só pro arquivo que sumiu do Drive, mantém o saudável intacto', async () => {
    const drive = new FakeDriveClient();
    drive.files.set('file-ok', { id: 'file-ok', name: 'Contrato.pdf', trashed: false });
    // 'file-sumiu' nunca é setado em drive.files -- getFile devolve null (404)

    const officeLinks: FakeOfficeLink[] = [
      {
        id: 'link-ok', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
        provider: 'DRIVE', externalId: 'file-ok', url: 'https://drive.example/file-ok', title: 'Contrato.pdf',
        documentType: null, phaseId: null, visibleToClient: false, brokenAt: null, lastCheckedAt: null,
      },
      {
        id: 'link-quebrado', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
        provider: 'DRIVE', externalId: 'file-sumiu', url: 'https://drive.example/file-sumiu', title: 'ART.pdf',
        documentType: null, phaseId: null, visibleToClient: false, brokenAt: null, lastCheckedAt: null,
      },
    ];
    const prisma = createFakePrisma({ admins, credentials, officeLinks });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    const result = await service.checkBrokenLinksForAccount('acc-1');

    expect(result.checked).toBe(2);
    expect(result.newlyBroken).toEqual(['link-quebrado']);
    expect(officeLinks.find((l) => l.id === 'link-ok')!.brokenAt).toBeNull();
    expect(officeLinks.find((l) => l.id === 'link-quebrado')!.brokenAt).not.toBeNull();
  });

  it('não reavisa (newlyBroken) um link que já estava quebrado antes', async () => {
    const drive = new FakeDriveClient(); // 'file-sumiu' continua sem entrada -- getFile devolve null
    const jaQuebradoDesde = new Date('2026-01-01');
    const officeLinks: FakeOfficeLink[] = [
      {
        id: 'link-quebrado', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
        provider: 'DRIVE', externalId: 'file-sumiu', url: 'https://drive.example/file-sumiu', title: 'ART.pdf',
        documentType: null, phaseId: null, visibleToClient: false, brokenAt: jaQuebradoDesde, lastCheckedAt: null,
      },
    ];
    const prisma = createFakePrisma({ admins, credentials, officeLinks });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    const result = await service.checkBrokenLinksForAccount('acc-1');

    expect(result.newlyBroken).toEqual([]); // já quebrado antes -- não é "novo"
    expect(officeLinks[0].brokenAt).toEqual(jaQuebradoDesde); // preserva a data original
  });
});

describe('GoogleDriveService — documentos visíveis ao cliente (item "grande" adiado)', () => {
  const admins = [{ id: 'user-1', accountId: 'acc-1' }];
  const credentials = [{ userId: 'user-1', scope: DRIVE_FILE_SCOPE }];
  const officeLinks: FakeOfficeLink[] = [
    {
      id: 'link-visivel', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
      provider: 'DRIVE', externalId: 'file-visivel', url: 'https://drive.example/file-visivel', title: 'Contrato.pdf',
      documentType: 'contrato', phaseId: null, visibleToClient: true, brokenAt: null, lastCheckedAt: null,
    },
    {
      id: 'link-nao-marcado', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
      provider: 'DRIVE', externalId: 'file-interno', url: 'https://drive.example/file-interno', title: 'Rascunho interno.pdf',
      documentType: null, phaseId: null, visibleToClient: false, brokenAt: null, lastCheckedAt: null,
    },
    {
      id: 'link-quebrado-visivel', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
      provider: 'DRIVE', externalId: 'file-quebrado', url: 'https://drive.example/file-quebrado', title: 'ART.pdf',
      documentType: 'art', phaseId: null, visibleToClient: true, brokenAt: new Date('2026-01-01'), lastCheckedAt: null,
    },
  ];

  it('lista só o vínculo marcado visível ao cliente e ainda não quebrado', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ admins, credentials, officeLinks: [...officeLinks] });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    const documents = await service.listClientVisibleDocuments('acc-1', 'proj-1');

    expect(documents.map((d: any) => d.id)).toEqual(['link-visivel']);
  });

  it('baixa o conteúdo de um documento visível, com a credencial de um admin conectado', async () => {
    const drive = new FakeDriveClient();
    drive.downloads.set('file-visivel', { name: 'Contrato.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf-bytes') });
    const prisma = createFakePrisma({ admins, credentials, officeLinks: [...officeLinks] });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    const content = await service.downloadClientVisibleDocument('acc-1', 'proj-1', 'link-visivel');

    expect(content).toEqual({ name: 'Contrato.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf-bytes') });
  });

  it('recusa baixar um vínculo que a equipe nunca marcou visível ao cliente (404, não vaza que existe)', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ admins, credentials, officeLinks: [...officeLinks] });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    await expect(service.downloadClientVisibleDocument('acc-1', 'proj-1', 'link-nao-marcado')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('recusa baixar um vínculo visível mas já quebrado (404, mesmo escopo de listClientVisibleDocuments)', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ admins, credentials, officeLinks: [...officeLinks] });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    await expect(service.downloadClientVisibleDocument('acc-1', 'proj-1', 'link-quebrado-visivel')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('GoogleDriveService.listRevisions (item "versionamento" adiado na rodada de gestão documental)', () => {
  const admins = [{ id: 'user-1', accountId: 'acc-1' }];
  const credentials = [{ userId: 'user-1', scope: DRIVE_FILE_SCOPE }];
  const officeLinks: FakeOfficeLink[] = [
    {
      id: 'link-drive', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
      provider: 'DRIVE', externalId: 'file-com-historico', url: 'https://drive.example/file-com-historico', title: 'Contrato.pdf',
      documentType: null, phaseId: null, visibleToClient: false, brokenAt: null, lastCheckedAt: null,
    },
    {
      id: 'link-calendar', accountId: 'acc-1', entityType: 'PROJECT', entityId: 'proj-1',
      provider: 'CALENDAR', externalId: 'evt-1', url: 'https://calendar.example/evt-1', title: 'Reunião',
      documentType: null, phaseId: null, visibleToClient: false, brokenAt: null, lastCheckedAt: null,
    },
  ];

  it('lista as revisões mais recentes primeiro, mesmo a API do Drive devolvendo em ordem crescente', async () => {
    const drive = new FakeDriveClient();
    drive.revisions.set('file-com-historico', [
      { id: 'rev-1', modifiedTime: '2026-01-01T00:00:00.000Z', size: '1000', lastModifyingUserName: 'Ana', keepForever: false },
      { id: 'rev-2', modifiedTime: '2026-03-01T00:00:00.000Z', size: '1200', lastModifyingUserName: 'Beto', keepForever: true },
    ]);
    const prisma = createFakePrisma({ admins, credentials, officeLinks: [...officeLinks] });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    const revisions = await service.listRevisions('acc-1', 'link-drive');

    expect(revisions.map((r) => r.id)).toEqual(['rev-2', 'rev-1']);
  });

  it('recusa listar revisões de um vínculo que não é do Drive (Calendar não tem revisão) -- 404', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ admins, credentials, officeLinks: [...officeLinks] });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    await expect(service.listRevisions('acc-1', 'link-calendar')).rejects.toMatchObject({ status: 404 });
  });

  it('recusa sem nenhum admin com o Drive conectado', async () => {
    const drive = new FakeDriveClient();
    const prisma = createFakePrisma({ admins, credentials: [], officeLinks: [...officeLinks] });
    const credentialsService = { getAccessToken: async () => 'fake-access-token' } as any;
    const service = new GoogleDriveService(prisma as any, credentialsService, drive);

    await expect(service.listRevisions('acc-1', 'link-drive')).rejects.toMatchObject({
      code: 'GOOGLE_DRIVE_NOT_CONNECTED',
    });
  });
});
