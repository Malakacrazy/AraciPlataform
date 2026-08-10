// Datas de calendário (ProjectPhase.startDate/dueDate, TimeEntry.date) são
// dias, não momentos — chegam como meia-noite UTC. Formatar com o fuso
// local (padrão do toLocaleDateString) desloca um dia para trás em fusos
// negativos (ex.: 2026-08-01T00:00:00.000Z vira "31/07/2026" em UTC-3).
// timeZone: "UTC" mantém o dia exatamente como veio da API.
export function formatDateUTC(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
