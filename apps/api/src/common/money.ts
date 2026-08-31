// Achado A4 da auditoria de 30 ago 2026 (auditoria-2026-08-30-detalhada.md):
// nenhum valor monetário era arredondado em ponto algum do caminho
// RoleRate -> Invoice -> Asaas -> NFS-e, então uma tarifa calculada por
// fórmula (ex.: 86.5138461538...) se propagava com todas as casas
// decimais -- a Asaas normaliza pra 2 casas na cobrança (gerando um
// boleto que não bate com o valor exibido da fatura), e a SEFIN rejeita
// vServ com mais de 2 casas na NFS-e. round2 é chamado na FRONTEIRA de
// escrita (quando um valor calculado é persistido), não em toda leitura.
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
