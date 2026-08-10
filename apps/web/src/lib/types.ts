// Escritos à mão em vez de importar de @araci/db: a ADR 0002 tirou de
// propósito a dependência de apps/web em @araci/db/Postgres ("apps/web
// não toca mais em @araci/db/Postgres diretamente"), então tipar contra
// o pacote do Prisma reabriria esse acoplamento só para type-checking.
// Cobre só os campos que as páginas mínimas de projeto/cliente usam, não
// o shape completo que apps/api devolve.

export interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  client: Client;
}

export type OfficeLinkProvider = "DRIVE" | "CALENDAR";

export interface OfficeLink {
  id: string;
  provider: OfficeLinkProvider;
  externalId: string;
  url: string;
  title: string;
  createdAt: string;
}
