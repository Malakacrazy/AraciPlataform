// DPS a partir de uma fatura REAL do estúdio -- contraparte de
// nfse-test-dps.ts (dado 100% fictício, só valida a mecânica). Mesma
// estrutura verificada contra a Homologação da SEFIN Nacional (mesma
// correção de fuso, mesmo totTrib zerado com sub-elementos -- ver
// comentários lá para o porquê de cada um), variando só o que precisa
// variar por fatura: tomador, valor e o código de serviço do regime
// tributário real da conta.
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
export function stableNumeroDps(invoiceId: string): string {
  let hash = 0;
  for (let i = 0; i < invoiceId.length; i++) {
    hash = (hash * 31 + invoiceId.charCodeAt(i)) >>> 0;
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
  const nDPS = stableNumeroDps(input.invoiceId);
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
          // totTrib zerado por decisão já registrada em Invoice.cstIbs/
          // cstCbs/cClassTrib: o cálculo real de carga tributária federal/
          // estadual/municipal por nota (via tabela IBPT ou similar) "ainda
          // não estabilizou" no ecossistema da Reforma Tributária -- não é
          // uma lacuna nova desta emissão, é a mesma simplificação já
          // documentada no schema. totTrib vazio (sem nenhum sub-elemento)
          // é rejeitado pela SEFIN Nacional (E1235); zerado é o mínimo que
          // passa da validação sem inventar um cálculo não confiável.
          totTrib: {
            vTotTrib: {
              vTotTribFed: 0,
              vTotTribEst: 0,
              vTotTribMun: 0,
            },
          },
        },
      },
    },
  };
}
