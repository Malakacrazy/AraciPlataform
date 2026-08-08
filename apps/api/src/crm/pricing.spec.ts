import { ProjectStageName } from '@araci/db';
import {
  calcularMultiplicadorComplexidade,
  calcularOverheadPorHora,
  calcularProposta,
  calcularTarifaHora,
} from './pricing';

// Reference numbers below come from the studio's real pricing spreadsheet
// (docs/fase-0/Base_Precificacao (fazer cópia).xlsx, abas 01–06), with the
// tax burden updated to the confirmed 6% (the spreadsheet had 0% when
// captured). These are golden values tied to the studio's actual
// commercial scenarios, not arbitrary numbers — if the pricing formula
// changes shape, these should fail.

describe('calcularOverheadPorHora', () => {
  it("distributes fixed costs over the studio's billable hours (aba 01)", () => {
    const overhead = calcularOverheadPorHora({
      totalMonthlyFixedCosts: 1279.56,
      billableHoursPerMonth: 168, // 21 dias úteis × 8h/dia × 1 pessoa ativa
    });
    expect(overhead).toBeCloseTo(7.6164, 4);
  });
});

describe('calcularTarifaHora', () => {
  it('applies overhead, margin and tax on top of direct cost per hour (aba 02)', () => {
    const overhead = calcularOverheadPorHora({
      totalMonthlyFixedCosts: 1279.56,
      billableHoursPerMonth: 168,
    });
    const tarifa = calcularTarifaHora(
      {
        role: 'Arquiteto Líder (RT)',
        grossSalary: 6500,
        payrollBurden: 0,
        billableHoursPerMonth: 168,
      },
      overhead,
      { marginTarget: 0.3, taxBurden: 0.06 },
    );
    // custoDireto=38.6905, custoTotal=46.3069, ×1.3/0.94 ≈ 64.04
    expect(tarifa).toBeCloseTo(64.04, 2);
  });

  it('a role with no salary configured still carries the studio overhead', () => {
    // Placeholder roles in the spreadsheet (salário=0) aren't free labor —
    // they still absorb overhead/margin/tax, which is why every role in
    // the sheet shows a non-zero tarifa/h even with grossSalary=0.
    const overhead = calcularOverheadPorHora({
      totalMonthlyFixedCosts: 1279.56,
      billableHoursPerMonth: 168,
    });
    const tarifa = calcularTarifaHora(
      { role: 'Estagiário', grossSalary: 0, payrollBurden: 0, billableHoursPerMonth: 120 },
      overhead,
      { marginTarget: 0.3, taxBurden: 0.06 },
    );
    expect(tarifa).toBeGreaterThan(0);
  });
});

describe('calcularMultiplicadorComplexidade', () => {
  it('maps the reference points from aba 04 (score médio → multiplicador)', () => {
    const allScored = (score: number) =>
      calcularMultiplicadorComplexidade({
        tipologia: score,
        programaEscopo: score,
        terreno: score,
        regulatorio: score,
        ambicaoDesign: score,
      });

    expect(allScored(1)).toBeCloseTo(0.7, 5);
    expect(allScored(2)).toBeCloseTo(0.9, 5);
    expect(allScored(3)).toBeCloseTo(1.1, 5);
    expect(allScored(4)).toBeCloseTo(1.3, 5);
    expect(allScored(5)).toBeCloseTo(1.5, 5);
  });

  it('multiplies hours, not the hourly rate — complexity means more iteration, not a pricier hour', () => {
    // This is the business rule the spreadsheet's instructions call out
    // explicitly. calcularProposta's own tests assert the mechanism; this
    // test just pins the multiplier itself to the documented formula.
    const multiplier = calcularMultiplicadorComplexidade({
      tipologia: 3,
      programaEscopo: 3,
      terreno: 3,
      regulatorio: 3,
      ambicaoDesign: 3,
    });
    expect(multiplier).toBe(0.5 + 0.2 * 3);
  });
});

describe('calcularProposta', () => {
  const LEAD_ROLE = 'Arquiteto Líder (RT)';
  const overhead = calcularOverheadPorHora({
    totalMonthlyFixedCosts: 1279.56,
    billableHoursPerMonth: 168,
  });
  const tarifaLead = calcularTarifaHora(
    { role: LEAD_ROLE, grossSalary: 6500, payrollBurden: 0, billableHoursPerMonth: 168 },
    overhead,
    { marginTarget: 0.3, taxBurden: 0.06 },
  );

  // Baseline hours per stage from aba 03 ("Horas Base por Estágio"), the
  // only role with real hours filled in the reference spreadsheet.
  const roleHours = [
    { role: LEAD_ROLE, stage: ProjectStageName.CAPTACAO_ALINHAMENTO, hours: 10 },
    { role: LEAD_ROLE, stage: ProjectStageName.BRIEFING, hours: 10 },
    { role: LEAD_ROLE, stage: ProjectStageName.CRIACAO_CONCEITO, hours: 20 },
    { role: LEAD_ROLE, stage: ProjectStageName.DETALHAMENTO_ACABAMENTOS, hours: 20 },
    { role: LEAD_ROLE, stage: ProjectStageName.EXECUTIVO, hours: 15 },
  ];
  const roleRates = [{ role: LEAD_ROLE, hourlyRate: tarifaLead }];
  // Maximum complexity (score 5 em todas as dimensões), como no cenário
  // registrado na aba 04/05 da planilha.
  const maxComplexity = {
    tipologia: 5,
    programaEscopo: 5,
    terreno: 5,
    regulatorio: 5,
    ambicaoDesign: 5,
  };

  it('Cenário A — pacote completo (5 estágios): aplica o desconto de 10%', () => {
    const result = calcularProposta({
      roleHours,
      complexityScores: maxComplexity,
      contractedStages: [
        ProjectStageName.CAPTACAO_ALINHAMENTO,
        ProjectStageName.BRIEFING,
        ProjectStageName.CRIACAO_CONCEITO,
        ProjectStageName.DETALHAMENTO_ACABAMENTOS,
        ProjectStageName.EXECUTIVO,
      ],
      roleRates,
    });

    expect(result.complexityMultiplier).toBeCloseTo(1.5, 5);
    expect(result.stages).toHaveLength(5);
    expect(result.stages.every((s) => s.contracted)).toBe(true);
    expect(result.packageDiscountPercent).toBeCloseTo(0.1, 5);
    expect(result.value).toBeCloseTo(6484.2, 1);
  });

  it('Cenário B — 4 estágios (sem Stage 0): ainda cruza o limiar de desconto', () => {
    const result = calcularProposta({
      roleHours,
      complexityScores: maxComplexity,
      contractedStages: [
        ProjectStageName.BRIEFING,
        ProjectStageName.CRIACAO_CONCEITO,
        ProjectStageName.DETALHAMENTO_ACABAMENTOS,
        ProjectStageName.EXECUTIVO,
      ],
      roleRates,
    });

    expect(result.packageDiscountPercent).toBeCloseTo(0.1, 5);
    expect(result.value).toBeCloseTo(5619.64, 1);
  });

  it('Cenário C — 3 estágios: contratação avulsa não recebe desconto', () => {
    const result = calcularProposta({
      roleHours,
      complexityScores: maxComplexity,
      contractedStages: [
        ProjectStageName.CRIACAO_CONCEITO,
        ProjectStageName.DETALHAMENTO_ACABAMENTOS,
        ProjectStageName.EXECUTIVO,
      ],
      roleRates,
    });

    expect(result.packageDiscountPercent).toBe(0);
    expect(result.value).toBeCloseTo(5283.42, 1);
  });

  it('Cenário F — só o estágio Executivo: horas e custo de outros estágios não entram na proposta', () => {
    const result = calcularProposta({
      roleHours,
      complexityScores: maxComplexity,
      contractedStages: [ProjectStageName.EXECUTIVO],
      roleRates,
    });

    const nonContracted = result.stages.filter((s) => !s.contracted);
    expect(nonContracted).toHaveLength(4);
    expect(result.packageDiscountPercent).toBe(0);
    expect(result.value).toBeCloseTo(1440.93, 1);
  });

  it('falha alto se um papel com horas lançadas não tem RoleRate — não deve tratar como mão de obra grátis', () => {
    expect(() =>
      calcularProposta({
        roleHours: [{ role: 'Arquiteto Pleno', stage: ProjectStageName.BRIEFING, hours: 5 }],
        complexityScores: maxComplexity,
        contractedStages: [ProjectStageName.BRIEFING],
        roleRates: [], // nenhuma tarifa cadastrada para "Arquiteto Pleno"
      }),
    ).toThrow(/Arquiteto Pleno/);
  });
});
