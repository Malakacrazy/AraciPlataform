// Escritos à mão em vez de importar de @araci/db: a ADR 0002 tirou de
// propósito a dependência de apps/web em @araci/db/Postgres ("apps/web
// não toca mais em @araci/db/Postgres diretamente"), então tipar contra
// o pacote do Prisma reabriria esse acoplamento só para type-checking.
// Cobre só os campos que as páginas mínimas de projeto/cliente usam, não
// o shape completo que apps/api devolve.

export interface Client {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
}

export interface ProjectPhase {
  id: string;
  stage: PepStage;
  contracted: boolean;
  order: number;
  budget?: string | null;
  approvedAt?: string | null;
  approvalChannel?: string | null;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  feeModel: string;
  client: Client;
  phases: ProjectPhase[];
}

export interface RoleRate {
  id: string;
  role: string;
  hourlyRate: string;
}

export interface Opportunity {
  id: string;
  clientId: string;
  client: Client;
  title: string;
  stage: string;
  feeModel: string;
  estimatedValue?: string | null;
  wonAt?: string | null;
  lostAt?: string | null;
  project?: { id: string } | null;
}

export type PepStage =
  | "CAPTACAO_ALINHAMENTO"
  | "BRIEFING"
  | "CRIACAO_CONCEITO"
  | "DETALHAMENTO_ACABAMENTOS"
  | "EXECUTIVO";

export interface ProposalStage {
  id: string;
  stage: PepStage;
  contracted: boolean;
  baseHours: string;
  adjustedHours: string;
  baseCost: string;
  adjustedCost: string;
}

export interface Proposal {
  id: string;
  opportunityId: string;
  value: string;
  status: "draft" | "sent" | "signed" | "expired";
  complexityMultiplier: string;
  packageDiscountPercent: string;
  sentAt?: string | null;
  signedAt?: string | null;
  stages: ProposalStage[];
}

export interface Invoice {
  id: string;
  projectId: string;
  phaseId?: string | null;
  amount: string;
  status: "pendente" | "emitida" | "paga";
  nfseNumber?: string | null;
  dueDate?: string | null;
  issuedAt?: string | null;
  paidAt?: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  specialty?: string | null;
  costPerHour?: string | null;
}

export interface ProjectMember {
  id: string;
  userId: string;
  roleOnProject?: string | null;
  user: User;
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string;
  phaseId?: string | null;
  date: string;
  hours: string;
  billable: boolean;
  activityType: "projeto" | "administrativo" | "comercial";
  approvedAt?: string | null;
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
