import { calcularFatorR } from './fator-r';

describe('calcularFatorR', () => {
  it('recomenda Anexo III quando a razão folha/receita é maior ou igual a 28%', () => {
    const result = calcularFatorR({ folhaPagamento12m: 30_000, receitaBruta12m: 100_000 });
    expect(result.fatorR).toBeCloseTo(0.3, 5);
    expect(result.anexoRecomendado).toBe('III');
  });

  it('recomenda Anexo V quando a razão folha/receita é menor que 28%', () => {
    const result = calcularFatorR({ folhaPagamento12m: 20_000, receitaBruta12m: 100_000 });
    expect(result.fatorR).toBeCloseTo(0.2, 5);
    expect(result.anexoRecomendado).toBe('V');
  });

  it('usa Anexo III exatamente no limiar de 28% (>=, não >)', () => {
    const result = calcularFatorR({ folhaPagamento12m: 28_000, receitaBruta12m: 100_000 });
    expect(result.anexoRecomendado).toBe('III');
  });

  it('rejeita receita bruta zero ou negativa — divisão sem sentido de negócio', () => {
    expect(() => calcularFatorR({ folhaPagamento12m: 1000, receitaBruta12m: 0 })).toThrow();
    expect(() => calcularFatorR({ folhaPagamento12m: 1000, receitaBruta12m: -500 })).toThrow();
  });
});
