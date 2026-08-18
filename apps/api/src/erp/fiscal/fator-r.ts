// Simulador de Fator R (Simples Nacional): razão entre folha de pagamento
// e receita bruta, ambos nos últimos 12 meses. >= 28% enquadra o
// prestador de serviços no Anexo III (tarifas mais baixas para quem
// mantém folha proporcional maior); abaixo disso, Anexo V. Ver
// docs/fase-0/decisoes-pos-descoberta.md #4.
//
// Só se aplica a quem já é ME optante pelo Simples Nacional — MEI
// tributa por valor fixo mensal (DAS-MEI) e não usa Fator R; a checagem
// de regime fica em fiscal.service.ts (é uma regra de negócio "esta
// conta pode simular?", não faz parte da conta matemática em si).
//
// Não confundir com a carga tributária de 6% usada na fórmula de
// tarifa/hora (apps/api/src/crm/pricing.ts) — são dois conceitos fiscais
// diferentes que só coincidem por estarem no mesmo domínio.
const FATOR_R_THRESHOLD = 0.28;

export interface FatorRInput {
  folhaPagamento12m: number; // salários + encargos pagos nos últimos 12 meses
  receitaBruta12m: number; // faturamento bruto nos últimos 12 meses
}

export interface FatorRResult {
  fatorR: number; // razão folha/receita, ex.: 0.31
  anexoRecomendado: 'III' | 'V';
}

export function calcularFatorR(input: FatorRInput): FatorRResult {
  if (input.receitaBruta12m <= 0) {
    throw new Error(
      'Receita bruta dos últimos 12 meses deve ser maior que zero para calcular o Fator R.',
    );
  }
  const fatorR = input.folhaPagamento12m / input.receitaBruta12m;
  return {
    fatorR,
    anexoRecomendado: fatorR >= FATOR_R_THRESHOLD ? 'III' : 'V',
  };
}
