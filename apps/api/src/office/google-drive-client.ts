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
}
