// Porta (DriveClient) + implementação real contra a Drive API v3.
// Separado de GoogleDriveService de propósito -- é o que permite o
// "porta fake do Drive" pedido pela auditoria: google-drive.service.spec.ts
// implementa DriveClient em memória, sem chamar o Google em teste nenhum
// (mesmo raciocínio de PrismaService ser injetado, nunca instanciado
// direto, nos outros services).
export interface DriveFolder {
  id: string;
  name: string;
  url: string;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  trashed: boolean;
}

export interface DriveFileContent {
  name: string;
  mimeType: string;
  data: Buffer;
}

// Lacuna da matriz (gestão documental por projeto, item adiado da rodada
// de gestão documental) -- "hoje não dá pra ver quem mudou o quê" numa
// ART/contrato/planta linkada. size vem como string na API do Drive
// (pode passar de Number.MAX_SAFE_INTEGER em teoria) e é ausente pra
// Google Doc/Sheet/Slide nativo (não tem bytes, ver downloadFile).
export interface DriveRevision {
  id: string;
  modifiedTime: string;
  size: string | null;
  lastModifyingUserName: string | null;
  keepForever: boolean;
}

// Token de injeção do Nest -- DriveClient é uma interface (não existe em
// runtime), então precisa de um token explícito pra @Inject(). Mesmo
// espírito de qualquer outra porta/adapter: GoogleDriveService depende da
// interface, o módulo decide qual implementação injetar (real em
// produção, fake em google-drive.service.spec.ts).
export const DRIVE_CLIENT = Symbol('DRIVE_CLIENT');

// Mesmo valor de DRIVE_SCOPE em apps/web/src/lib/google-client.ts -- não
// importável de lá (ADR 0002), cópia deliberada como STAGE_LABELS em
// pep-stage-labels.ts.
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface DriveClient {
  // Escopo drive.file: a Picker já dá acesso aos arquivos que o usuário
  // escolheu; criar uma pasta pelo servidor dá acesso a ela (e a tudo
  // criado dentro dela) automaticamente, sem precisar de escopo mais
  // amplo. parentId omitido cria na raiz do Meu Drive de quem possui o
  // access_token.
  createFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFolder>;
  // Usado por GoogleDriveService.checkBrokenLinks -- 404/erro aqui é o
  // sinal de "arquivo movido/renomeado/excluído" (achado da auditoria:
  // hoje isso apodrece em silêncio). trashed:true conta como quebrado
  // também (arquivo ainda existe tecnicamente, mas não é mais acessível
  // do jeito que o vínculo promete).
  getFile(accessToken: string, fileId: string): Promise<DriveFileMetadata | null>;
  // Lacuna da matriz (item "grande" adiado na rodada de gestão
  // documental) -- o cliente nunca tem conta Google/Workspace do
  // estúdio, então não dá pra simplesmente linkar pro Drive e torcer;
  // o servidor baixa o conteúdo com a credencial de um admin e devolve
  // pra API repassar (ver PublicPresentationService.downloadDocument).
  // Google Doc/Sheet/Slide nativo não tem bytes pra baixar via
  // alt=media -- exportado como PDF em vez disso, mesma decisão de
  // produto implícita de "o cliente só precisa visualizar", nunca
  // editar pelo portal.
  downloadFile(accessToken: string, fileId: string): Promise<DriveFileContent>;
  // O Drive já guarda o histórico de revisões de qualquer jeito (edição
  // colaborativa nativa do Google Docs/Sheets, ou upload de uma versão
  // nova por cima do mesmo arquivo) -- isto só expõe o que o Drive já
  // sabe, não implementa versionamento nenhum por conta própria.
  listRevisions(accessToken: string, fileId: string): Promise<DriveRevision[]>;
  // Cria um arquivo NOVO com conteúdo (não uma pasta) -- usado hoje só
  // pelo arquivamento do XML assinado da NFS-e (ver
  // GoogleDriveService.archiveFiscalXml). Nenhum outro fluxo de Drive
  // deste app cria arquivo: os demais sempre linkam algo que já existe
  // (Picker) ou uma pasta (createFolder acima).
  uploadFile(
    accessToken: string,
    parentFolderId: string,
    fileName: string,
    content: Buffer,
    mimeType: string,
  ): Promise<DriveFolder>;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

export class GoogleDriveApiClient implements DriveClient {
  async createFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFolder> {
    const res = await fetch(`${DRIVE_API_BASE}/files?fields=id,name,webViewLink`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      }),
    });
    const body: { id?: string; name?: string; webViewLink?: string; error?: { message?: string } } =
      await res.json();
    if (!res.ok || !body.id) {
      throw new Error(body.error?.message ?? `Falha ao criar pasta "${name}" no Drive.`);
    }
    return { id: body.id, name: body.name ?? name, url: body.webViewLink ?? `https://drive.google.com/drive/folders/${body.id}` };
  }

  async getFile(accessToken: string, fileId: string): Promise<DriveFileMetadata | null> {
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=id,name,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) {
      return null;
    }
    const body: { id?: string; name?: string; trashed?: boolean; error?: { message?: string } } = await res.json();
    if (!res.ok || !body.id) {
      throw new Error(body.error?.message ?? `Falha ao consultar o arquivo ${fileId} no Drive.`);
    }
    return { id: body.id, name: body.name ?? '', trashed: body.trashed ?? false };
  }

  async downloadFile(accessToken: string, fileId: string): Promise<DriveFileContent> {
    const metaRes = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta: { id?: string; name?: string; mimeType?: string; trashed?: boolean; error?: { message?: string } } =
      await metaRes.json();
    if (!metaRes.ok || !meta.id || meta.trashed) {
      throw new Error(meta.error?.message ?? `Arquivo ${fileId} não está mais disponível no Drive.`);
    }

    const isGoogleNative = meta.mimeType?.startsWith('application/vnd.google-apps.') ?? false;
    const contentRes = isGoogleNative
      ? await fetch(`${DRIVE_API_BASE}/files/${fileId}/export?mimeType=application/pdf`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      : await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
    if (!contentRes.ok) {
      const body: { error?: { message?: string } } | null = await contentRes.json().catch(() => null);
      throw new Error(body?.error?.message ?? `Falha ao baixar o arquivo ${fileId} do Drive.`);
    }

    return {
      name: isGoogleNative ? `${meta.name}.pdf` : (meta.name ?? fileId),
      mimeType: isGoogleNative ? 'application/pdf' : (meta.mimeType ?? 'application/octet-stream'),
      data: Buffer.from(await contentRes.arrayBuffer()),
    };
  }

  // Multipart upload (metadata JSON + bytes num corpo só) é o formato mais
  // simples da Drive API pra criar arquivo com conteúdo numa chamada --
  // resumable upload existe pra arquivo grande, sem necessidade aqui (XML
  // de NFS-e é poucos KB). Boundary fixo: não há risco de colisão porque o
  // conteúdo é XML/texto, nunca contém esta sequência específica.
  async uploadFile(
    accessToken: string,
    parentFolderId: string,
    fileName: string,
    content: Buffer,
    mimeType: string,
  ): Promise<DriveFolder> {
    const boundary = 'araci-drive-upload-boundary';
    const metadata = JSON.stringify({ name: fileName, parents: [parentFolderId] });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    const resBody: { id?: string; name?: string; webViewLink?: string; error?: { message?: string } } =
      await res.json();
    if (!res.ok || !resBody.id) {
      throw new Error(resBody.error?.message ?? `Falha ao subir o arquivo "${fileName}" pro Drive.`);
    }
    return {
      id: resBody.id,
      name: resBody.name ?? fileName,
      url: resBody.webViewLink ?? `https://drive.google.com/file/d/${resBody.id}/view`,
    };
  }

  async listRevisions(accessToken: string, fileId: string): Promise<DriveRevision[]> {
    const res = await fetch(
      `${DRIVE_API_BASE}/files/${fileId}/revisions?fields=revisions(id,modifiedTime,size,keepForever,lastModifyingUser(displayName))`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body: {
      revisions?: Array<{
        id: string;
        modifiedTime?: string;
        size?: string;
        keepForever?: boolean;
        lastModifyingUser?: { displayName?: string };
      }>;
      error?: { message?: string };
    } = await res.json();
    if (!res.ok) {
      throw new Error(body.error?.message ?? `Falha ao listar versões do arquivo ${fileId} no Drive.`);
    }
    return (body.revisions ?? []).map((r) => ({
      id: r.id,
      modifiedTime: r.modifiedTime ?? '',
      size: r.size ?? null,
      lastModifyingUserName: r.lastModifyingUser?.displayName ?? null,
      keepForever: r.keepForever ?? false,
    }));
  }
}
