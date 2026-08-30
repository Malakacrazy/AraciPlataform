// DPS a partir de uma fatura REAL do estúdio -- contraparte de
// nfse-test-dps.ts (dado 100% fictício, só valida a mecânica). Mesma
// estrutura verificada contra a Homologação da SEFIN Nacional (mesma
// correção de fuso, mesmo formato de totTrib com sub-elementos -- ver
// comentários lá para o porquê de cada um), variando o que precisa
// variar por fatura: tomador, valor, o código de serviço do regime
// tributário real da conta, e a alíquota efetiva de CBS/IBS da conta.
import type { LayoutDPS } from '@nfewizard/types';

// Mesmo município usado no DPS de teste -- o estúdio presta o serviço de
// projeto a partir do próprio endereço em São Paulo (Rua Poetisa
// Colombina, confirmado com a Giulia em decisoes-pos-descoberta.md #4),
// não do endereço do cliente. ISS de serviço de arquitetura recai sobre o
// município do prestador na prática do estúdio (o escopo não inclui
// acompanhamento de obra no local -- ver decisoes-pos-descoberta.md #5),
// então não varia por fatura.
const MUNICIPIO_ESTUDIO_IBGE = '3550308'; // São Paulo

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface InvoiceDpsInput {
  prestadorCnpj: string;
  taxRegime: 'MEI' | 'ME';
  ambiente: 1 | 2; // mesmo valor passado a createNfseClient — tpAmb declarado no DPS precisa bater com o ambiente de fato chamado
  invoiceId: string;
  valorServico: number;
  tomador: { documento: string; nome: string };
  // Account.cbsIbsEffectiveRatePercent -- fração (0.007 = 0,70%), ver
  // schema.prisma para a origem e o porquê de ser configurável por conta.
  cbsIbsEffectiveRatePercent: number;
  // Lacuna da matriz (NFS-e: substituição) -- a DPS da NFS-e substituta
  // precisa de um nDPS DIFERENTE do original (mesma fatura, mas é uma
  // autorização nova; reusar o nDPS faria a SEFIN rejeitar como
  // duplicata da primeira). Omitido = emissão normal/reemissão do zero.
  nDpsVariant?: string;
  // Substituição de verdade acontece AQUI, não num evento separado --
  // achado em teste real contra Homologação (E1861: SEFIN Nacional
  // rejeita e105102/RegistrarEvento vindo do prestador; é evento
  // gerado pelo sistema municipal, não algo que o contribuinte possa
  // registrar). O jeito correto, confirmado no XSD oficial
  // (NFSe-ESQUEMAS_XSD-v1.01, TCSubstituicao): a NOVA DPS referencia a
  // NFS-e antiga aqui, e a SEFIN cancela a antiga como efeito colateral
  // da autorização desta. cMotivo fixo em '99' (Outros) -- nenhum dos
  // códigos específicos (01 desenquadramento Simples Nacional .. 05
  // rejeição pelo tomador) descreve "corrigi um erro no valor/descrição
  // da fatura", o único cenário real de substituição do estúdio.
  substituicao?: { chaveAcessoAntiga: string; xMotivo?: string };
}

// Confirmado com a Giulia (decisoes-pos-descoberta.md #4): Arquitetura
// não pode ser MEI (exige registro profissional/CAU, fora da lista de
// atividades permitidas ao MEI). Enquanto o regime real da conta for MEI,
// o único código válido é 170201 (Datilografia, a atividade de fato
// registrada hoje) -- 070104 (Arquitetura, nacional) + 1520 (municipal de
// SP) só entram em uso depois da migração para ME. Nunca hardcoded: lido
// de Account.taxRegime a cada emissão, não de um valor fixo no código.
function servicoPorRegime(taxRegime: 'MEI' | 'ME') {
  if (taxRegime === 'MEI') {
    return {
      opSimpNac: 2 as const,
      cTribNac: '170201',
      cTribMun: undefined as string | undefined,
      xDescServ: 'Servico de datilografia (MEI) - projeto ' /* + segue com o id da fatura, ver abaixo */,
    };
  }
  return {
    opSimpNac: 3 as const,
    cTribNac: '070104',
    cTribMun: '1520',
    xDescServ: 'Servico de projeto de arquitetura',
  };
}

// nDPS estável por Invoice (ao contrário do DPS de teste, que usa
// timestamp) -- uma tentativa que falhar por queda de rede e for
// reenviada tem que cair no MESMO nDPS, pra SEFIN rejeitar como
// duplicata em vez de autorizar duas DPS diferentes pra mesma fatura.
// Espaço de 32 bits é mais que suficiente pro volume de faturas de um
// estúdio pequeno -- uma colisão rara só geraria uma rejeição de
// duplicata a mais pra investigar manualmente, nunca uma emissão errada.
export function stableNumeroDps(invoiceId: string, variant?: string): string {
  const seed = variant ? `${invoiceId}:${variant}` : invoiceId;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return String(hash || 1);
}

function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function buildInvoiceDps(input: InvoiceDpsInput): LayoutDPS {
  const agora = new Date();
  // toISOString() sempre devolve UTC -- subtrai o offset do instante
  // ANTES de formatar (mesma correção do DPS de teste; só relabelar "Z"
  // como "-03:00" adianta o dhEmi declarado em 3h de verdade e a SEFIN
  // Nacional rejeita isso, achado real em teste: E0008).
  const emBrasilia = new Date(agora.getTime() - BRASILIA_OFFSET_MS);
  const dhEmi = emBrasilia.toISOString().replace('Z', '-03:00');
  const dCompet = emBrasilia.toISOString().slice(0, 10);
  const nDPS = stableNumeroDps(input.invoiceId, input.nDpsVariant);
  const servico = servicoPorRegime(input.taxRegime);
  const documento = apenasDigitos(input.tomador.documento);
  const toma = documento.length > 11 ? { CNPJ: documento } : { CPF: documento };

  return {
    infDps: {
      tpAmb: input.ambiente,
      dhEmi,
      verAplic: 'araci-fatura-1.0',
      serie: '1',
      nDPS,
      dCompet,
      tpEmit: 1, // Prestador
      cLocEmi: MUNICIPIO_ESTUDIO_IBGE,
      prest: {
        CNPJ: input.prestadorCnpj,
        // xNome/end omitidos de propósito -- a SEFIN Nacional rejeita
        // (E0121/E0128) quando o emitente é o próprio prestador, porque
        // já resolve os dois pelo CNPJ cadastrado (mesmo achado do DPS de
        // teste). Sem Inscrição Municipal -- confirmado que o estúdio não
        // tem uma hoje.
        regTrib: {
          opSimpNac: servico.opSimpNac,
          regEspTrib: 0, // nenhum regime especial
        },
      },
      toma: {
        ...toma,
        xNome: input.tomador.nome,
      },
      serv: {
        locPrest: {
          cLocPrestacao: MUNICIPIO_ESTUDIO_IBGE,
        },
        cServ: {
          cTribNac: servico.cTribNac,
          ...(servico.cTribMun ? { cTribMun: servico.cTribMun } : {}),
          xDescServ: `${servico.xDescServ} (fatura ${input.invoiceId})`,
        },
      },
      valores: {
        vServPrest: {
          vServ: input.valorServico,
        },
        trib: {
          tribMun: {
            tribISSQN: 1, // operação tributável
            tpRetISSQN: 1, // não retido
          },
          // totTrib é só disclosure (Lei da Transparência Fiscal
          // 12.741/2012 -- não muda vServ nem o que é recolhido), calculado
          // a partir de Account.cbsIbsEffectiveRatePercent (ver
          // schema.prisma pro cronograma/fonte). Reportado inteiro em
          // vTotTribFed: CBS é federal e é o componente dominante da fase
          // de teste 2026 (0,9 dos 1,0 p.p. do cronograma, antes da
          // redução); IBS (estadual+municipal) é uma fração pequena do
          // total e a divisão exata Est/Mun depende de Resolução do
          // Senado ainda não definida -- não inventamos esse split aqui,
          // mesmo espírito de "não confiável" que já valia pro zero total.
          totTrib: {
            vTotTrib: {
              vTotTribFed: Math.round(input.valorServico * input.cbsIbsEffectiveRatePercent * 100) / 100,
              vTotTribEst: 0,
              vTotTribMun: 0,
            },
          },
        },
      },
      ...(input.substituicao
        ? {
            subst: {
              chSubstda: input.substituicao.chaveAcessoAntiga,
              cMotivo: '99',
              ...(input.substituicao.xMotivo ? { xMotivo: input.substituicao.xMotivo } : {}),
            },
          }
        : {}),
    },
  };
}
