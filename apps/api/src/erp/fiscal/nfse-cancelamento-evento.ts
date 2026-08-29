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

export interface CancelamentoPorSubstituicaoEventoInput {
  ambiente: 1 | 2;
  prestadorCnpj: string;
  chaveAcessoAntiga: string;
  chaveAcessoNova: string;
}

// Substituição: a NFS-e nova (corrigida) já foi autorizada antes disto
// (ver NfseService.substituirParaFatura) -- este evento só cancela a
// antiga, referenciando a nova como quem a substitui.
// EventoCancelamentoSubstituicao (e105102) não tem cMotivo/xMotivo livre
// como o e101101 -- a SEFIN Nacional trata "foi substituída" como
// motivo suficiente por si só.
export function buildCancelamentoPorSubstituicaoEvento(
  input: CancelamentoPorSubstituicaoEventoInput,
): LayoutPedRegEvento {
  return {
    infPedReg: {
      tpAmb: input.ambiente,
      verAplic: 'araci-fatura-1.0',
      dhEvento: dhEventoAgora(),
      CNPJAutor: input.prestadorCnpj,
      chNFSe: input.chaveAcessoAntiga,
      e105102: {
        xDesc: 'Cancelamento de NFS-e por Substituição',
        chNFSeSubst: input.chaveAcessoNova,
      },
    },
  };
}
