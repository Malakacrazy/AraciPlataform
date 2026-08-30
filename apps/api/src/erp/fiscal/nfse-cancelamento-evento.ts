// Evento de cancelamento (e101101) ou cancelamento por substituição
// (e105102) da SEFIN Nacional -- contraparte de nfse-invoice-dps.ts pro
// Pedido de Registro de Evento (pedRegEvento), não a DPS de autorização
// em si. Mesma correção de fuso que dhEmi já usa lá (toISOString()
// sempre UTC, subtrai o offset ANTES de formatar).
import type { LayoutPedRegEvento } from '@nfewizard/types';

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

// Achado real em teste (Homologação, E1235): dhEvento é do tipo
// TSDateTimeUTC no schema da SEFIN Nacional, que NÃO aceita fração de
// segundo -- diferente de dhEmi na DPS (mesmo padrão .toISOString(), mas
// tipo XSD diferente), que aceita milissegundos sem reclamar. .slice(0,19)
// corta a parte ".SSS" antes de trocar "Z" por "-03:00".
function dhEventoAgora(): string {
  const agora = new Date();
  const emBrasilia = new Date(agora.getTime() - BRASILIA_OFFSET_MS);
  return `${emBrasilia.toISOString().slice(0, 19)}-03:00`;
}

export interface CancelamentoEventoInput {
  ambiente: 1 | 2; // ambiente ONDE A NFS-e VIVE (nfseAmbienteEmissao), não necessariamente o da conta hoje
  prestadorCnpj: string;
  chaveAcesso: string;
  motivo: 1 | 2 | 9; // 1 erro na emissão, 2 serviço não prestado, 9 outros -- código fixo da SEFIN Nacional
  justificativa: string;
}

// Cancelamento simples -- não emite nada novo, só invalida a NFS-e atual.
export function buildCancelamentoEvento(input: CancelamentoEventoInput): LayoutPedRegEvento {
  return {
    infPedReg: {
      tpAmb: input.ambiente,
      verAplic: 'araci-fatura-1.0',
      dhEvento: dhEventoAgora(),
      CNPJAutor: input.prestadorCnpj,
      chNFSe: input.chaveAcesso,
      e101101: {
        xDesc: 'Cancelamento de NFS-e',
        cMotivo: input.motivo,
        xMotivo: input.justificativa,
      },
    },
  };
}

// e105102 (cancelamento por substituição) NÃO tem mais uma função
// builder aqui -- achado rodando de verdade contra Homologação: SEFIN
// Nacional rejeita esse evento vindo do prestador com E1861 ("não é
// aceito pelo método POST da API Eventos"), não importa o payload. É
// evento gerado pelo próprio sistema municipal quando uma NFS-e nova
// referencia a antiga via `subst` na DPS (TCSubstituicao, ver
// nfse-invoice-dps.ts/InvoiceDpsInput.substituicao) -- nunca algo que o
// contribuinte registra diretamente. Chegamos a corrigir dois bugs reais
// tentando forçar esse caminho (mapeamento de campo hardcoded errado em
// @nfewizard/nfse, e o enum errado de cMotivo aqui), mas o caminho em si
// é impossível -- documentados só pra quem for investigar de novo no
// futuro não repetir a mesma investigação.
