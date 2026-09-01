// Tipos compartilhados pelas seções de smoke-test.ts extraídas pra cá
// (revisão de qualidade de código: o arquivo tinha 4000+ linhas numa
// função main() só). Cada seção extraída recebe api/report/prisma/
// smokeUser como parâmetros explícitos em vez de importar de volta
// smoke-test.ts -- evita import circular e deixa claro, ao ler só o
// arquivo da seção, exatamente do que ela depende do resto do script.
// Mesmo estilo frouxo de tipagem do arquivo original (body: any) --
// isto é um script de smoke test, não código de produção.
export type ApiFn = (path: string, init?: RequestInit) => Promise<{ status: number; body: any }>;
export type ReportFn = (name: string, ok: boolean, detail?: unknown) => void;
