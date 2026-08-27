"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

// Duas formas válidas de preencher uma tarifa: hourlyRate direto, ou
// salário bruto + encargos% + horas faturáveis/mês (o backend calcula a
// tarifa nesse caso — ver RoleRatesService.upsertRoleRate). O form no
// cliente decide qual conjunto mandar; aqui só valida que pelo menos um
// dos dois veio completo antes de tentar a chamada.
export async function upsertRoleRate(formData: FormData) {
  const role = String(formData.get("role") ?? "").trim();
  if (!role) {
    throw new Error("Papel é obrigatório.");
  }

  const hourlyRateRaw = String(formData.get("hourlyRate") ?? "").trim();
  const grossSalaryRaw = String(formData.get("grossSalary") ?? "").trim();
  const payrollBurdenPercentRaw = String(formData.get("payrollBurdenPercent") ?? "").trim();
  const billableHoursPerMonthRaw = String(formData.get("billableHoursPerMonth") ?? "").trim();

  const hasCompensationInputs = grossSalaryRaw && payrollBurdenPercentRaw && billableHoursPerMonthRaw;
  if (!hourlyRateRaw && !hasCompensationInputs) {
    throw new Error("Informe a tarifa/hora direto, ou salário + encargos + horas faturáveis pra calcular.");
  }

  const body: Record<string, unknown> = { role };
  if (hasCompensationInputs) {
    body.grossSalary = Number(grossSalaryRaw);
    // Formulário coleta encargos em % (ex.: "42"); API espera fração (0.42).
    body.payrollBurdenPercent = Number(payrollBurdenPercentRaw) / 100;
    body.billableHoursPerMonth = Number(billableHoursPerMonthRaw);
  } else {
    body.hourlyRate = Number(hourlyRateRaw);
  }

  const res = await apiFetch("role-rates", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message ?? "Não foi possível salvar a tarifa.");
  }
  revalidatePath("/role-rates");
}

export async function deleteRoleRate(id: string) {
  const res = await apiFetch(`role-rates/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover a tarifa.");
  }
  revalidatePath("/role-rates");
}

export async function createStudioFixedCost(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  const monthlyAmountRaw = String(formData.get("monthlyAmount") ?? "").trim();
  if (!description || !monthlyAmountRaw) {
    throw new Error("Descrição e valor mensal são obrigatórios.");
  }

  const res = await apiFetch("studio-fixed-costs", {
    method: "POST",
    body: JSON.stringify({ description, monthlyAmount: Number(monthlyAmountRaw) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível salvar o custo fixo.");
  }
  revalidatePath("/role-rates");
}

export async function deleteStudioFixedCost(id: string) {
  const res = await apiFetch(`studio-fixed-costs/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível remover o custo fixo.");
  }
  revalidatePath("/role-rates");
}

// Percentuais chegam do form em % (ex.: "30"), API espera fração (0.30).
export async function updatePricingConfig(formData: FormData) {
  const marginPercentRaw = String(formData.get("pricingMarginPercent") ?? "").trim();
  const taxBurdenPercentRaw = String(formData.get("pricingTaxBurdenPercent") ?? "").trim();
  const businessDaysRaw = String(formData.get("pricingBusinessDaysPerMonth") ?? "").trim();
  const hoursPerDayRaw = String(formData.get("pricingBillableHoursPerDay") ?? "").trim();
  const staffCountRaw = String(formData.get("pricingActiveStaffCount") ?? "").trim();

  if (!marginPercentRaw || !taxBurdenPercentRaw || !businessDaysRaw || !hoursPerDayRaw || !staffCountRaw) {
    throw new Error("Todos os campos de configuração são obrigatórios.");
  }

  const res = await apiFetch("account", {
    method: "PATCH",
    body: JSON.stringify({
      pricingMarginPercent: Number(marginPercentRaw) / 100,
      pricingTaxBurdenPercent: Number(taxBurdenPercentRaw) / 100,
      pricingBusinessDaysPerMonth: Number(businessDaysRaw),
      pricingBillableHoursPerDay: Number(hoursPerDayRaw),
      pricingActiveStaffCount: Number(staffCountRaw),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Não foi possível salvar a configuração.");
  }
  revalidatePath("/role-rates");
}
