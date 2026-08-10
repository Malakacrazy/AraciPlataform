import { ProjectStageName } from '@araci/db';
import { PEP_STAGE_ORDER } from '../pep';

// Implements the studio's real pricing pipeline documented in
// docs/fase-0/especificacao-tecnica.md ("Motor de precificação") and
// docs/fase-0/decisoes-pos-descoberta.md #2 — ported from
// docs/fase-0/Base_Precificacao (fazer cópia).xlsx (abas 01–06).

export interface StudioFixedCosts {
  totalMonthlyFixedCosts: number; // aba 01 — TOTAL CUSTO FIXO MENSAL
  billableHoursPerMonth: number; // aba 01 — TOTAL HORAS FATURÁVEIS/MÊS do estúdio
}

// Overhead é distribuído sobre horas faturáveis efetivas, não sobre horas
// totais trabalhadas (nota metodológica da própria planilha, aba 00).
export function calcularOverheadPorHora(fixedCosts: StudioFixedCosts): number {
  return fixedCosts.totalMonthlyFixedCosts / fixedCosts.billableHoursPerMonth;
}

export interface RoleCompensation {
  role: string;
  grossSalary: number; // Salário Bruto
  payrollBurden: number; // Encargos
  billableHoursPerMonth: number; // horas faturáveis/mês desse papel
}

export interface RateFormulaInputs {
  marginTarget: number; // margem-alvo, ex.: 0.3
  taxBurden: number; // carga tributária, ex.: 0.06
}

// aba 02 — tarifa/hora final por papel, já com overhead, margem e
// impostos aplicados. Este é o valor que vira RoleRate.hourlyRate.
export function calcularTarifaHora(
  role: RoleCompensation,
  overheadPorHora: number,
  formula: RateFormulaInputs,
): number {
  const custoTotalMes = role.grossSalary + role.payrollBurden;
  const custoDiretoHora = custoTotalMes / role.billableHoursPerMonth;
  const custoTotalHora = custoDiretoHora + overheadPorHora;
  return (
    (custoTotalHora * (1 + formula.marginTarget)) / (1 - formula.taxBurden)
  );
}

export interface ComplexityScores {
  tipologia: number;
  programaEscopo: number;
  terreno: number;
  regulatorio: number;
  ambicaoDesign: number;
}

// aba 04 — score composto é a média das 5 dimensões (1–5); o
// multiplicador é linear entre os pontos de referência da planilha
// (1.0 → 0.70x ... 5.0 → 1.50x). Multiplica HORAS, nunca a tarifa/hora:
// projeto complexo demanda mais iteração, não justifica cobrar mais caro
// por hora (nota da própria planilha).
export function calcularMultiplicadorComplexidade(
  scores: ComplexityScores,
): number {
  const scoreMedio =
    (scores.tipologia +
      scores.programaEscopo +
      scores.terreno +
      scores.regulatorio +
      scores.ambicaoDesign) /
    5;
  return 0.5 + 0.2 * scoreMedio;
}

export interface RoleStageHours {
  role: string;
  stage: ProjectStageName;
  hours: number;
}

export interface RoleRateInput {
  role: string;
  hourlyRate: number;
}

export interface ProposalStageResult {
  stage: ProjectStageName;
  contracted: boolean;
  baseHours: number;
  adjustedHours: number;
  baseCost: number;
  adjustedCost: number;
}

export interface ProposalResult {
  complexityMultiplier: number;
  stages: ProposalStageResult[];
  packageDiscountPercent: number;
  value: number;
}

const PACKAGE_DISCOUNT_MIN_STAGES = 4;
const PACKAGE_DISCOUNT_PERCENT = 0.1;

// aba 03 + 04 + 05 — o "Configurador": horas base por papel/estágio,
// ajustadas pela complexidade, precificadas pela tarifa/hora do papel, com
// desconto de 10% quando 4+ estágios são contratados juntos (premia
// contratação integral; avulso não recebe desconto — compensa overhead de
// setup não amortizado, nota da planilha).
export function calcularProposta(input: {
  roleHours: RoleStageHours[];
  complexityScores: ComplexityScores;
  contractedStages: ProjectStageName[];
  roleRates: RoleRateInput[];
}): ProposalResult {
  const multiplier = calcularMultiplicadorComplexidade(input.complexityScores);
  const rateByRole = new Map(
    input.roleRates.map((r) => [r.role, r.hourlyRate]),
  );
  const contractedSet = new Set(input.contractedStages);

  const stages: ProposalStageResult[] = PEP_STAGE_ORDER.map((stage) => {
    const hoursForStage = input.roleHours.filter((rh) => rh.stage === stage);
    const baseHours = hoursForStage.reduce((sum, rh) => sum + rh.hours, 0);
    const baseCost = hoursForStage.reduce((sum, rh) => {
      const rate = rateByRole.get(rh.role);
      if (rate === undefined) {
        throw new Error(
          `Nenhuma RoleRate encontrada para o papel "${rh.role}"`,
        );
      }
      return sum + rh.hours * rate;
    }, 0);
    return {
      stage,
      contracted: contractedSet.has(stage),
      baseHours,
      adjustedHours: baseHours * multiplier,
      baseCost,
      adjustedCost: baseCost * multiplier,
    };
  });

  const subtotal = stages
    .filter((s) => s.contracted)
    .reduce((sum, s) => sum + s.adjustedCost, 0);
  const contractedCount = stages.filter((s) => s.contracted).length;
  const packageDiscountPercent =
    contractedCount >= PACKAGE_DISCOUNT_MIN_STAGES
      ? PACKAGE_DISCOUNT_PERCENT
      : 0;

  return {
    complexityMultiplier: multiplier,
    stages,
    packageDiscountPercent,
    value: subtotal * (1 - packageDiscountPercent),
  };
}
