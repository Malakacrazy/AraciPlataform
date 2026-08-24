// DPS de teste com dado fictício — NÃO representa uma prestação de
// serviço real do Studio Araci. Existe só para validar a integração
// mecânica (certificado, assinatura, chamada ao webservice da SEFIN
// Nacional em Homologação) descrita em decisoes-pos-descoberta.md #4,
// não para emitir uma NFS-e de verdade. Identidade do prestador
// (endereço, código de serviço do regime atual) já confirmada com a
// Giulia -- ver decisoes-pos-descoberta.md #4. O que ainda falta é só
// pra quando o estúdio virar ME e passar a emitir Arquitetura de
// verdade (código/alíquota real do serviço prestado, valor real) — ver
// docs/fase-0/roadmap-atualizado.md, Fase 2. Cliente e valor aqui
// continuam 100% fictícios por decisão explícita.
//
// CNPJ e UF do prestador são os ÚNICOS campos que precisam bater com a
// identidade do certificado (a SEFIN autentica pelo certificado A1 e
// provavelmente rejeita se o CNPJ declarado não for o mesmo) — por isso
// vêm como parâmetro, resolvidos a partir do próprio certificado
// (ver nfse-certificate-info.ts), não hardcoded aqui como o resto.
import type { LayoutDPS } from '@nfewizard/types';

const MUNICIPIO_TESTE_IBGE = '3550308'; // São Paulo — só um código válido para o teste passar da validação de schema

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

export function buildTestDps(prestadorCnpj: string): LayoutDPS {
  const agora = new Date();
  // toISOString() sempre devolve UTC. Só trocar "Z" por "-03:00" não
  // converte o instante — relabela o mesmo relógio UTC como se já fosse
  // hora de Brasília, adiantando o dhEmi declarado em 3h de verdade. A
  // SEFIN Nacional rejeitou isso em teste real (E0008: "data de emissão
  // da DPS não pode ser posterior à data do seu processamento"). Correto
  // é subtrair o offset do instante ANTES de formatar.
  const emBrasilia = new Date(agora.getTime() - BRASILIA_OFFSET_MS);
  const dhEmi = emBrasilia.toISOString().replace('Z', '-03:00');
  const dCompet = emBrasilia.toISOString().slice(0, 10);
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
        // xNome e end (endereço) do prestador são rejeitados pela SEFIN
        // Nacional (E0121/E0128) quando tpEmit=1 (emitente é o próprio
        // prestador) -- ela já conhece nome e endereço pelo CNPJ
        // cadastrado, não precisa (e não aceita) repetir na DPS. Endereço
        // real do estúdio (Rua Poetisa Colombina 143, apto 184, Jardim
        // Bonfiglioli, São Paulo/SP, CEP 05593-010, confirmado pela
        // Giulia) fica registrado aqui só como referência -- não entra no
        // payload por não ser aceito, não por esquecimento.
        // Sem Inscrição Municipal -- confirmado que o estúdio não tem uma
        // hoje (N/A), não omissão por falta de pergunta.
        regTrib: {
          opSimpNac: 2, // MEI — regime real do estúdio hoje (ver Account.taxRegime)
          regEspTrib: 0, // nenhum regime especial
        },
      },
      toma: {
        // 000.000.000-00 falha o dígito verificador (E0206 real da SEFIN).
        // 111.444.777-35 é o CPF fictício padrão usado em ambientes de
        // teste BR por ter dígitos verificadores válidos sem pertencer a
        // ninguém de verdade.
        CPF: '11144477735',
        xNome: 'CLIENTE FICTICIO PARA TESTE',
      },
      serv: {
        locPrest: {
          cLocPrestacao: MUNICIPIO_TESTE_IBGE,
        },
        cServ: {
          // Confirmado pela Giulia: Arquitetura NÃO pode ser MEI (exige
          // registro profissional/CAU, fora da lista de atividades
          // permitidas ao MEI) -- por isso o código nacional real de
          // Arquitetura ('070104') só entra em uso depois da migração pra
          // ME (junto com o código municipal de SP, '1520', também
          // ME-only). Enquanto o regime real do estúdio for MEI
          // (Account.taxRegime), o código nacional válido pra essa DPS é
          // '170201' (Datilografia -- a atividade de fato registrada no
          // MEI hoje). '070100'/'110101' usados antes eram só chutes/
          // placeholders pra passar da validação de schema; este aqui é o
          // código real do regime atual, não mais um placeholder.
          cTribNac: '170201',
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
          // totTrib vazio foi rejeitado pela SEFIN Nacional em teste real
          // (E1235: "incomplete content... vTotTrib, pTotTrib, indTotTrib,
          // pTotTribSN") — precisa de pelo menos um sub-elemento. Zerado
          // porque vServ é só R$1 fictício, não representa carga tributária
          // real (ver nota no topo do arquivo).
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
