import { moodboardSnapshotInputSchema } from './moodboards.service';
import { normalizeImageMimeType } from './moodboard-files.service';

// Contrato do achado A59 (janela de troca tldraw->Excalidraw, achado B5
// da revisão do plano de migração, §5.1.1/§7): a validação nunca volta a
// ser z.unknown() (rejeita primitivo), aceita os dois formatos de
// snapshot durante toda a janela (abas de /present anônimas não podem
// ser forçadas a recarregar), e rejeita `files` no formato novo -- bytes
// de imagem saem do snapshot por conta própria (moodboard-files.service),
// aceitar `files` aqui reabriria o estouro de SNAPSHOT_BODY_LIMIT que a
// aritmética do plano (§5.2) resolveu tirando as imagens daqui.
describe('moodboardSnapshotInputSchema', () => {
  const tldrawSnapshot = {
    store: { 'shape:abc': { id: 'shape:abc', typeName: 'shape' } },
    schema: { schemaVersion: 2, storeVersion: 4 },
  };

  const excalidrawSnapshot = {
    schemaVersion: 1,
    elements: [{ id: 'el1', type: 'rectangle', version: 3, x: 0, y: 0 }],
    appState: { viewBackgroundColor: '#ffffff' },
  };

  it('accepts a tldraw-shaped snapshot (formato antigo, janela de troca)', () => {
    const result = moodboardSnapshotInputSchema.safeParse({ snapshot: tldrawSnapshot });
    expect(result.success).toBe(true);
  });

  it('accepts an Excalidraw-shaped snapshot (formato novo)', () => {
    const result = moodboardSnapshotInputSchema.safeParse({ snapshot: excalidrawSnapshot });
    expect(result.success).toBe(true);
  });

  it('keeps an unrecognised extra field (marker), matching the smoke-test fixtures', () => {
    const result = moodboardSnapshotInputSchema.safeParse({
      snapshot: { ...excalidrawSnapshot, marker: 'smoke-test' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.snapshot as { marker?: string }).marker).toBe('smoke-test');
    }
  });

  it('rejects a top-level `files` key on the new format (achado B5 -- imagens saem do snapshot)', () => {
    const result = moodboardSnapshotInputSchema.safeParse({
      snapshot: { ...excalidrawSnapshot, files: { file1: { id: 'file1', dataURL: 'data:image/png;base64,AAAA' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a primitive snapshot (achado A59 -- nunca mais z.unknown())', () => {
    expect(moodboardSnapshotInputSchema.safeParse({ snapshot: 123 }).success).toBe(false);
    expect(moodboardSnapshotInputSchema.safeParse({ snapshot: { lixo: true } }).success).toBe(false);
  });

  it('rejects an element missing the minimum shape (id/type/version)', () => {
    const result = moodboardSnapshotInputSchema.safeParse({
      snapshot: { schemaVersion: 1, elements: [{ id: 'el1' }] },
    });
    expect(result.success).toBe(false);
  });
});

// Achados A32/A45 aplicados às imagens de prancha: esta função é a
// ÚNICA coisa entre um upload de convidado (/present, portal do
// convidado -- rotas @Public()) e um Content-Type servido de volta na
// mesma origem do dashboard autenticado. Os casos abaixo não são
// hipotéticos: a versão anterior era um denylist consultado com o header
// CRU, então cada um deles passava enquanto o raw() do express (type-is,
// case-insensitive, ignora parâmetros) aceitava o corpo do mesmo jeito.
describe('normalizeImageMimeType', () => {
  it('aceita os rasters e devolve o tipo canônico', () => {
    expect(normalizeImageMimeType('image/png')).toBe('image/png');
    expect(normalizeImageMimeType('image/webp')).toBe('image/webp');
  });

  it('descarta parâmetros e normaliza a caixa antes de comparar', () => {
    expect(normalizeImageMimeType('IMAGE/PNG')).toBe('image/png');
    expect(normalizeImageMimeType('image/png; charset=binary')).toBe('image/png');
    expect(normalizeImageMimeType('  image/JPEG ')).toBe('image/jpeg');
  });

  it('canonicaliza os aliases que o navegador manda', () => {
    expect(normalizeImageMimeType('image/jpg')).toBe('image/jpeg');
    expect(normalizeImageMimeType('image/jfif')).toBe('image/jpeg');
    expect(normalizeImageMimeType('image/vnd.microsoft.icon')).toBe('image/x-icon');
  });

  it('recusa SVG mesmo disfarçado com parâmetro ou caixa', () => {
    expect(normalizeImageMimeType('image/svg+xml')).toBeNull();
    expect(normalizeImageMimeType('image/SVG+XML')).toBeNull();
    expect(normalizeImageMimeType('image/svg+xml; charset=utf-8')).toBeNull();
  });

  it('recusa qualquer coisa que não seja imagem raster da allowlist', () => {
    expect(normalizeImageMimeType('text/html')).toBeNull();
    expect(normalizeImageMimeType('application/pdf')).toBeNull();
    expect(normalizeImageMimeType('image/')).toBeNull();
    expect(normalizeImageMimeType(undefined)).toBeNull();
    expect(normalizeImageMimeType('')).toBeNull();
  });
});

// Achado da revisão: a guarda contra index/version forjados existia só no
// caminho do canal (isSaneRemoteElement em apps/web), então este PATCH era
// um desvio aberto em volta dela -- e o que passa por aqui é PERSISTIDO,
// vencendo o reconcile de todo peer para sempre. Os limites abaixo são
// deliberadamente os MESMOS de initial-scene.ts; se um lado mudar sem o
// outro, é aqui que aparece.
describe('excalidrawSnapshotSchema -- index/version forjados', () => {
  const el = { id: 'el1', type: 'rectangle', version: 3, index: 'a1', x: 0, y: 0 };
  const scene = (elements: unknown[]) => ({
    snapshot: { schemaVersion: 1, elements, appState: { viewBackgroundColor: '#fff' } },
  });

  it('aceita um elemento normal', () => {
    expect(moodboardSnapshotInputSchema.safeParse(scene([el])).success).toBe(true);
  });

  it('aceita um elemento sem index -- nem todo salvo passou por syncInvalidIndices', () => {
    const noIndex = { id: el.id, type: el.type, version: el.version, x: el.x, y: el.y };
    expect(moodboardSnapshotInputSchema.safeParse(scene([noIndex])).success).toBe(true);
  });

  it('rejeita version acima do teto plausível (o vetor de envenenamento permanente)', () => {
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, version: 9e15 }])).success).toBe(false);
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, version: 10_000_001 }])).success).toBe(false);
  });

  it('rejeita version não inteira ou negativa', () => {
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, version: -1 }])).success).toBe(false);
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, version: 1.5 }])).success).toBe(false);
  });

  it('rejeita index fora do formato de fractional-indexing', () => {
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, index: 'z'.repeat(64) }])).success).toBe(false);
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, index: 'tem espaço' }])).success).toBe(false);
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, index: '' }])).success).toBe(false);
  });

  it('rejeita id vazio ou absurdamente longo', () => {
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, id: '' }])).success).toBe(false);
    expect(moodboardSnapshotInputSchema.safeParse(scene([{ ...el, id: 'x'.repeat(300) }])).success).toBe(false);
  });
});
