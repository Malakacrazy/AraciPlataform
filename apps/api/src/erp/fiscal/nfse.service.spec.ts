import { gzipSync } from 'node:zlib';
import { NfseService } from './nfse.service';

function gzipB64(xml: string): string {
  return gzipSync(Buffer.from(xml, 'utf-8')).toString('base64');
}

// archiveXmlBestEffort é privado, chamado de dentro de emitir/cancelar/
// substituirParaFatura -- testado direto via cast (service as any),
// não através de um fluxo fiscal completo (exigiria certificado real +
// client SEFIN, fora do escopo de um teste unitário; ver
// verify-nfse-invoice.ts pra isso). O contrato que importa aqui, achado
// como gap real de revisão: nunca lança, sempre devolve null (sucesso)
// ou uma mensagem (falha) -- se isso quebrar, a ação fiscal em si (já
// autorizada/cancelada de verdade na SEFIN) passaria a falhar por causa
// só do arquivamento no Drive.
describe('NfseService.archiveXmlBestEffort (contrato "nunca bloqueia a ação fiscal")', () => {
  function buildService(archiveFiscalXml: jest.Mock) {
    return new NfseService({} as any, {} as any, { archiveFiscalXml } as any);
  }

  it('devolve null quando o arquivamento no Drive dá certo', async () => {
    const archiveFiscalXml = jest.fn().mockResolvedValue({ id: 'link-1' });
    const service = buildService(archiveFiscalXml);

    const result = await (service as any).archiveXmlBestEffort(
      'acc-1',
      'proj-1',
      'NFS-e 1.xml',
      gzipB64('<xml/>'),
    );

    expect(result).toBeNull();
    expect(archiveFiscalXml).toHaveBeenCalledWith('acc-1', 'proj-1', 'NFS-e 1.xml', '<xml/>');
  });

  it('devolve uma mensagem em vez de lançar quando o Drive falha', async () => {
    const archiveFiscalXml = jest.fn().mockRejectedValue(new Error('GOOGLE_DRIVE_NOT_CONNECTED'));
    const service = buildService(archiveFiscalXml);

    const result = await (service as any).archiveXmlBestEffort(
      'acc-1',
      'proj-1',
      'NFS-e 1.xml',
      gzipB64('<xml/>'),
    );

    expect(result).toBe('Falha ao arquivar o XML no Drive: GOOGLE_DRIVE_NOT_CONNECTED.');
  });

  it('devolve uma mensagem sem sequer chamar o Drive quando a SEFIN não devolveu XML nenhum', async () => {
    const archiveFiscalXml = jest.fn();
    const service = buildService(archiveFiscalXml);

    const result = await (service as any).archiveXmlBestEffort('acc-1', 'proj-1', 'NFS-e 1.xml', undefined);

    expect(result).toBe('A SEFIN não devolveu o XML assinado nesta resposta -- nada pra arquivar.');
    expect(archiveFiscalXml).not.toHaveBeenCalled();
  });
});
