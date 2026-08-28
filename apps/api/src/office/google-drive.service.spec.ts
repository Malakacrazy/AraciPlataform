import { GoogleDriveService } from './google-drive.service';
import type { DriveClient, DriveFolder, DriveFileMetadata } from './google-drive-client';

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
        findMany: async ({ where }: any) => {
          return officeLinks.filter((link) => {
            if (where.accountId && link.accountId !== where.accountId) return false;
            if (where.entityType && link.entityType !== where.entityType) return false;
            if (where.entityId && link.entityId !== where.entityId) return false;
            if (where.provider && link.provider !== where.provider) return false;
            if (where.documentType?.in && !where.documentType.in.includes(link.documentType)) return false;
            return true;
          });
        },
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
