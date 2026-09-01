// Extraído de revisão de qualidade de código: ActivitiesService e
// NotificationsService tinham cinco métodos quase idênticos
// (getLastActivityAtByOpportunityIds/ClientIds/ProjectIds,
// getLastStalledNotificationAtByOpportunityIds, getLastNotifiedAtByClientIds)
// -- cada um rodava seu próprio findMany (modelo e where diferentes, isso
// continua em cada service) e depois reduzia as linhas pro mesmo padrão:
// "a primeira ocorrência de cada chave, ordenado desc, já é a mais
// recente". Só esse pedaço final está duplicado; a query em si não muda.
export function latestByKey<T extends { createdAt: Date }>(
  rows: T[],
  keyOf: (row: T) => string | null,
): Map<string, Date> {
  const result = new Map<string, Date>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key && !result.has(key)) {
      result.set(key, row.createdAt);
    }
  }
  return result;
}
