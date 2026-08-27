"use client";

import { useState } from "react";
import { upsertRoleRate } from "./actions";

// Lista canônica espelhada de apps/api/src/roles.ts (CANONICAL_ROLES) —
// apps/web não importa de apps/api (ADR 0002), então é uma cópia
// deliberada, não uma referência viva. Usada só como sugestão no
// datalist; RoleRate.role continua string livre no backend.
const CANONICAL_ROLES = [
  "Arquiteto Líder (RT)",
  "Coordenador de Projeto",
  "Arquiteto Sênior",
  "Arquiteto Pleno",
  "Arquiteto Júnior",
  "Estagiário",
  "Lead 3D / Visualização",
];

// overheadPorHora/marginPercent/taxBurdenPercent vêm calculados no
// servidor (mesma fórmula de crm/pricing.ts, duplicada aqui em JS puro
// só pra prévia ao vivo -- apps/web não importa de apps/api, ADR 0002).
// A tarifa de verdade é sempre recalculada no backend no submit; esta
// prévia existe só pra mostrar o número antes de salvar.
export function RoleRateForm({
  overheadPorHora,
  marginPercent,
  taxBurdenPercent,
}: {
  overheadPorHora: number;
  marginPercent: number;
  taxBurdenPercent: number;
}) {
  const [mode, setMode] = useState<"direto" | "calculado">("calculado");
  const [grossSalary, setGrossSalary] = useState("");
  const [payrollBurdenPercent, setPayrollBurdenPercent] = useState("");
  const [billableHoursPerMonth, setBillableHoursPerMonth] = useState("");

  const salaryNum = Number(grossSalary);
  const encargosNum = Number(payrollBurdenPercent) / 100;
  const horasNum = Number(billableHoursPerMonth);
  const preview =
    mode === "calculado" && salaryNum > 0 && horasNum > 0
      ? (((salaryNum * (1 + encargosNum)) / horasNum + overheadPorHora) * (1 + marginPercent)) /
        (1 - taxBurdenPercent)
      : null;

  return (
    <form action={upsertRoleRate} className="mt-3 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">Papel</span>
        <input
          name="role"
          required
          list="canonical-roles"
          className="w-64 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        />
        <datalist id="canonical-roles">
          {CANONICAL_ROLES.map((role) => (
            <option key={role} value={role} />
          ))}
        </datalist>
      </label>

      <div className="flex gap-4 text-xs text-zinc-700 dark:text-zinc-300">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "calculado"} onChange={() => setMode("calculado")} />
          Calcular a partir de salário + encargos
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "direto"} onChange={() => setMode("direto")} />
          Digitar tarifa/hora direto
        </label>
      </div>

      {mode === "calculado" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Salário bruto (R$/mês)</span>
            <input
              name="grossSalary"
              type="number"
              min="0"
              step="0.01"
              required
              value={grossSalary}
              onChange={(e) => setGrossSalary(e.target.value)}
              className="w-36 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Encargos (%)</span>
            <input
              name="payrollBurdenPercent"
              type="number"
              min="0"
              step="0.1"
              required
              value={payrollBurdenPercent}
              onChange={(e) => setPayrollBurdenPercent(e.target.value)}
              className="w-24 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Horas faturáveis/mês</span>
            <input
              name="billableHoursPerMonth"
              type="number"
              min="0"
              step="1"
              required
              value={billableHoursPerMonth}
              onChange={(e) => setBillableHoursPerMonth(e.target.value)}
              className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          {preview !== null && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Tarifa/hora resultante:{" "}
              <span className="font-mono text-zinc-900 dark:text-zinc-50">
                R$ {preview.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </p>
          )}
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">R$/hora</span>
          <input
            name="hourlyRate"
            type="number"
            min="0"
            step="0.01"
            required
            className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
      )}

      <button
        type="submit"
        className="w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Salvar
      </button>
    </form>
  );
}
