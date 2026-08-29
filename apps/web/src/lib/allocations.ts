import type { Absence, Allocation, Project } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function weeksBetween(startIso: string, endIso: string): number {
  return Math.max((Date.parse(endIso) - Date.parse(startIso)) / (7 * DAY_MS), 0);
}

// null (não 0) quando a pessoa não tem costPerHour cadastrado -- 0
// diria "esse trabalho é de graça", que é diferente de "não sei calcular
// o custo disso ainda" (mesma distinção que ffe-cart.tsx faz pra
// specs sem unitPrice).
export function allocationCost(alloc: Allocation): number | null {
  if (alloc.user.costPerHour === null || alloc.user.costPerHour === undefined) return null;
  return Number(alloc.hoursPerWeek) * Number(alloc.user.costPerHour) * weeksBetween(alloc.startDate, alloc.endDate);
}

export function formatCost(cost: number | null): string {
  if (cost === null) return "sem custo-hora";
  return `R$ ${cost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function sweepPeak(events: Array<[number, number]>): number {
  // Empate no mesmo instante (fim de uma alocação = início da próxima,
  // caso comum de agenda "encostada") tem que processar o fim (delta
  // negativo) antes do início (delta positivo) -- senão a ordem de
  // inserção no array (irrelevante pro negócio) decide se as duas contam
  // como simultâneas por um instante, inflando o pico sem sobreposição
  // real nenhuma.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let running = 0;
  let peak = 0;
  for (const [, delta] of events) {
    running += delta;
    peak = Math.max(peak, running);
  }
  return peak;
}

// Pico de horas/semana simultâneas de uma pessoa: sweep-line sobre início
// (+horas) e fim (-horas) de cada alocação -- o maior total ao longo da
// linha do tempo é o momento em que ela está mais sobrecarregada, não a
// soma de tudo (alocações que não se sobrepõem não competem pela mesma
// semana).
export function peakHoursPerWeek(allocations: Allocation[]): number {
  const events: Array<[number, number]> = [];
  for (const alloc of allocations) {
    events.push([Date.parse(alloc.startDate), Number(alloc.hoursPerWeek)]);
    events.push([Date.parse(alloc.endDate), -Number(alloc.hoursPerWeek)]);
  }
  return sweepPeak(events);
}

// Igual a peakHoursPerWeek, mas só considera o comprometimento dentro de
// uma janela específica -- usado para sugerir quem alocar num período
// futuro: uma sobreposição de pico fora da janela pedida não deveria
// competir pela disponibilidade que importa agora. Alocações que não
// tocam a janela são descartadas antes do sweep; as que tocam têm seus
// eventos recortados nos limites da janela.
export function peakHoursInWindow(
  allocations: Allocation[],
  windowStartIso: string,
  windowEndIso: string,
): number {
  const windowStart = Date.parse(windowStartIso);
  const windowEnd = Date.parse(windowEndIso);
  const events: Array<[number, number]> = [];
  for (const alloc of allocations) {
    const allocStart = Date.parse(alloc.startDate);
    const allocEnd = Date.parse(alloc.endDate);
    if (allocEnd < windowStart || allocStart > windowEnd) continue;
    events.push([Math.max(allocStart, windowStart), Number(alloc.hoursPerWeek)]);
    events.push([Math.min(allocEnd, windowEnd), -Number(alloc.hoursPerWeek)]);
  }
  return sweepPeak(events);
}

// Lacuna da matriz ("calendário de férias"): entra na mesma máquina de
// sweep-line -- não soma nada, só responde se alguma ausência da pessoa
// toca a janela pedida, pra AllocationForm não sugerir (ou pelo menos
// avisar) alguém que não vai estar disponível no período. Sem janela
// (nenhuma data ainda escolhida no formulário), cai pra "está de férias
// agora" -- mesmo espírito de peakHoursPerWeek vs. peakHoursInWindow.
export function isOnAbsence(absences: Absence[], windowStartIso?: string, windowEndIso?: string): boolean {
  const windowStart = windowStartIso ? Date.parse(windowStartIso) : Date.now();
  const windowEnd = windowEndIso ? Date.parse(windowEndIso) : windowStart;
  return absences.some((ab) => Date.parse(ab.startDate) <= windowEnd && Date.parse(ab.endDate) >= windowStart);
}

export function phasesBudget(project: Project): number {
  return project.phases.reduce((sum, phase) => sum + Number(phase.budget ?? 0), 0);
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
