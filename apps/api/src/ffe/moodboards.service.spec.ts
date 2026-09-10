import { moodboardSnapshotInputSchema } from './moodboards.service';

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
