// DPS de teste com dado fictício — NÃO representa uma prestação de
// serviço real do Studio Araci. Existe só para validar a integração
// mecânica (certificado, assinatura, chamada ao webservice da SEFIN
// Nacional em Homologação) descrita em decisoes-pos-descoberta.md #4,
// não para emitir uma NFS-e de verdade. Município, endereço, código de
// serviço e regime tributário reais ainda dependem de confirmação da
// consultoria contábil antes de qualquer emissão de produção — ver
// docs/fase-0/roadmap-atualizado.md, Fase 2.
//
// CNPJ e UF do prestador são os ÚNICOS campos que precisam bater com a
// identidade do certificado (a SEFIN autentica pelo certificado A1 e
// provavelmente rejeita se o CNPJ declarado não for o mesmo) — por isso
// vêm como parâmetro, resolvidos a partir do próprio certificado
// (ver nfse-certificate-info.ts), não hardcoded aqui como o resto.
import type { LayoutDPS } from '@nfewizard/types';

const MUNICIPIO_TESTE_IBGE = '3550308'; // São Paulo — só um código válido para o teste passar da validação de schema

export function buildTestDps(prestadorCnpj: string): LayoutDPS {
  const agora = new Date();
  const dhEmi = agora.toISOString().replace('Z', '-03:00');
  const dCompet = agora.toISOString().slice(0, 10);
  const nDPS = String(Math.floor(agora.getTime() / 1000)); // sequencial simples, só precisa ser único no teste

  return {
    infDps: {
      tpAmb: 2, // Homologação
      dhEmi,
      verAplic: 'araci-teste-1.0',
      serie: '1',
      nDPS,
      dCompet,
      tpEmit: 1, // Prestador
      cLocEmi: MUNICIPIO_TESTE_IBGE,
      prest: {
        CNPJ: prestadorCnpj,
        xNome: 'DADO FICTICIO PARA TESTE',
        regTrib: {
          opSimpNac: 2, // MEI — regime real do estúdio hoje (ver Account.taxRegime)
          regEspTrib: 0, // nenhum regime especial
        },
      },
      toma: {
        CPF: '00000000000',
        xNome: 'CLIENTE FICTICIO PARA TESTE',
      },
      serv: {
        locPrest: {
          cLocPrestacao: MUNICIPIO_TESTE_IBGE,
        },
        cServ: {
          // 07.01 (Anexo I da LC 116/2003): "Engenharia, agronomia,
          // agrimensura, arquitetura, geologia, urbanismo, paisagismo e
          // congêneres" — item mais provável para o estúdio, mas não
          // confirmado com a consultoria contábil ainda.
          cTribNac: '070100',
          xDescServ: 'Servico de teste - dado ficticio, nao representa prestacao real.',
        },
      },
      valores: {
        vServPrest: {
          vServ: 1,
        },
        trib: {
          tribMun: {
            tribISSQN: 1, // operação tributável
            tpRetISSQN: 1, // não retido
          },
          totTrib: {},
        },
      },
    },
  };
}
