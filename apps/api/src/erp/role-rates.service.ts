import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError, ApiError } from '../common/api-error';
import { StudioFixedCostsService } from './studio-fixed-costs.service';
import { calcularOverheadPorHora, calcularTarifaHora } from '../crm/pricing';

// Duas formas válidas de preencher uma RoleRate: (a) hourlyRate direto
// (ex.: freelancer com valor já fechado, sem salário/encargos que façam
// sentido calcular), ou (b) os três campos de compensação juntos, e o
// backend CALCULA hourlyRate (ver upsertRoleRate) em vez de aceitar o
// valor enviado -- refine garante que não dá pra mandar os dois meio a
// meio (ex.: só salário sem horas faturáveis) nem nenhum dos dois.
export const roleRateInputSchema = z
  .object({
    role: z.string().min(1),
    hourlyRate: z.number().positive().optional(),
    grossSalary: z.number().nonnegative().optional(),
    payrollBurdenPercent: z.number().min(0).max(5).optional(),
    billableHoursPerMonth: z.number().positive().optional(),
  })
  .refine(
    (v) =>
      v.hourlyRate !== undefined ||
      (v.grossSalary !== undefined &&
        v.payrollBurdenPercent !== undefined &&
        v.billableHoursPerMonth !== undefined),
    {
      message:
        'Informe hourlyRate diretamente, ou salário bruto + encargos + horas faturáveis/mês pra calcular a tarifa.',
    },
  );

export type RoleRateInput = z.infer<typeof roleRateInputSchema>;

@Injectable()
export class RoleRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studioFixedCostsService: StudioFixedCostsService,
  ) {}

  listRoleRates(accountId: string) {
    return this.prisma.db.roleRate.findMany({
      where: { accountId },
      orderBy: { role: 'asc' },
    });
  }

  // Upsert por (accountId, role) — "role" continua string livre em vez de
  // enum (nomenclatura canônica de referência em ../roles.ts, não uma
  // trava de banco — ver decisoes-pos-descoberta.md #2).
  async upsertRoleRate(accountId: string, input: RoleRateInput) {
    const hasCompensationInputs =
      input.grossSalary !== undefined &&
      input.payrollBurdenPercent !== undefined &&
      input.billableHoursPerMonth !== undefined;

    let hourlyRate: number;
    if (hasCompensationInputs) {
      hourlyRate = await this.calcularTarifaAPartirDoCusto(accountId, {
        grossSalary: input.grossSalary!,
        payrollBurdenPercent: input.payrollBurdenPercent!,
        billableHoursPerMonth: input.billableHoursPerMonth!,
      });
    } else {
      hourlyRate = input.hourlyRate!;
    }

    // Zera os campos de compensação quando o modo é "hourlyRate direto"
    // -- senão um papel que já foi calculado uma vez e depois trocou pra
    // valor manual ficaria com salário/encargos velhos guardados,
    // sugerindo (errado) que o hourlyRate atual ainda vem daquele cálculo.
    return this.prisma.db.roleRate.upsert({
      where: { accountId_role: { accountId, role: input.role } },
      update: {
        hourlyRate,
        grossSalary: hasCompensationInputs ? input.grossSalary : null,
        payrollBurdenPercent: hasCompensationInputs ? input.payrollBurdenPercent : null,
        billableHoursPerMonth: hasCompensationInputs ? input.billableHoursPerMonth : null,
      },
      create: {
        accountId,
        role: input.role,
        hourlyRate,
        grossSalary: hasCompensationInputs ? input.grossSalary : null,
        payrollBurdenPercent: hasCompensationInputs ? input.payrollBurdenPercent : null,
        billableHoursPerMonth: hasCompensationInputs ? input.billableHoursPerMonth : null,
      },
    });
  }

  // aba 01 + 02 da planilha de precificação, com os inputs reais da
  // conta (Account.pricing*, StudioFixedCost) em vez dos placeholders —
  // reaplica crm/pricing.ts, não reimplementa a fórmula.
  private async calcularTarifaAPartirDoCusto(
    accountId: string,
    compensation: { grossSalary: number; payrollBurdenPercent: number; billableHoursPerMonth: number },
  ): Promise<number> {
    const account = await this.prisma.db.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundError('Conta');
    }

    const totalMonthlyFixedCosts = await this.studioFixedCostsService.sumMonthlyFixedCosts(accountId);
    const studioBillableHoursPerMonth =
      account.pricingBusinessDaysPerMonth *
      Number(account.pricingBillableHoursPerDay) *
      Number(account.pricingActiveStaffCount);

    if (studioBillableHoursPerMonth <= 0) {
      throw new ApiError(
        'PRICING_CONFIG_INVALID',
        'Configuração de capacidade do estúdio inválida (dias úteis × horas/dia × pessoas ativas resultou em zero).',
        422,
      );
    }

    const overheadPorHora = calcularOverheadPorHora({
      totalMonthlyFixedCosts,
      billableHoursPerMonth: studioBillableHoursPerMonth,
    });

    return calcularTarifaHora(
      { role: '', ...compensation },
      overheadPorHora,
      {
        marginTarget: Number(account.pricingMarginPercent),
        taxBurden: Number(account.pricingTaxBurdenPercent),
      },
    );
  }

  async deleteRoleRate(accountId: string, id: string) {
    const rate = await this.prisma.db.roleRate.findFirst({
      where: { id, accountId },
    });
    if (!rate) {
      throw new NotFoundError('Tarifa de papel');
    }
    await this.prisma.db.roleRate.delete({ where: { id } });
  }
}
