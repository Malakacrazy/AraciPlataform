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
  startDate?: string | null;
  dueDate?: string | null;
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
  // Obrigatório junto de lostAt -- só setado via POST .../mark-lost, ver
  // opportunities.service.ts.
  lostReason?: string | null;
  // Só preenchido quando a oportunidade nasceu do formulário público de
  // captação (POST /v1/leads) -- a mensagem que o visitante escreveu.
  leadMessage?: string | null;
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
  version: number;
  previousVersion?: { version: number } | null;
  // zapsignSignUrl é a página de assinatura hospedada pela própria
  // ZapSign (a plataforma nunca hospeda essa UI) -- preenchida só depois
  // de POST /proposals/:id/send-for-signature. signerName/signedAt só
  // vêm preenchidos pelo webhook confirmando doc_signed de verdade.
  zapsignSignUrl?: string | null;
  signerName?: string | null;
  sentAt?: string | null;
  signedAt?: string | null;
  stages: ProposalStage[];
}

// Só existe quando a fatura foi calculada automaticamente por horas
// apontadas (projeto hora_tecnica) -- ver InvoicesService.createHourlyInvoice.
// Fatura com valor digitado à mão (outros feeModel, ou o carrinho de
// FF&E) vem com lines: [].
export interface InvoiceLine {
  id: string;
  role: string;
  hours: string;
  hourlyRate: string;
  amount: string;
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
  asaasPaymentId?: string | null;
  asaasInvoiceUrl?: string | null;
  lines: InvoiceLine[];
}

export type AccessLevel = "admin" | "staff";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  accessLevel: AccessLevel;
  specialty?: string | null;
  // Ausente (não null) pra quem não é admin -- a API remove o campo da
  // resposta em vez de mandar null, ver UsersController.redactCost.
  costPerHour?: string | null;
  weeklyCapacityHours: string;
  apiKeyHash?: string | null;
}

export interface Me {
  accountId: string;
  userId: string;
  email: string;
  accessLevel: AccessLevel;
}

// Fundação pra sincronização via webhook (ver GoogleCredential no
// schema) -- connected: false não traz scope/updatedAt nenhum.
export type GoogleSyncStatus =
  | { connected: false }
  | { connected: true; scope: string; createdAt: string; updatedAt: string };

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

// Compromisso planejado (não medido) de horas/semana de uma pessoa num
// projeto, entre datas -- usado no planejamento de alocação da equipe,
// diferente de TimeEntry (já trabalhado) e ProjectMember (sem tempo/data).
export interface Allocation {
  id: string;
  userId: string;
  user: User;
  projectId: string;
  project: Project;
  hoursPerWeek: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

// Galeria de fotos extras -- imageUrl continua sendo a capa (campo que o
// Captura já manda). images só vem preenchido em GET /products e
// GET /products/:id, não nos includes leves usados por especificação/
// moodboard (essas telas não precisam da galeria, só da capa).
export interface ProductImage {
  id: string;
  url: string;
  order: number;
}

export interface ProductVariantSummary {
  id: string;
  name: string;
  variantLabel?: string | null;
  price?: string | null;
}

export interface Product {
  id: string;
  name: string;
  supplier?: string | null;
  price?: string | null;
  dimensions?: string | null;
  finish?: string | null;
  leadTimeDays?: number | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  isGeneric: boolean;
  category?: string | null;
  // Variante = outro Product apontando pra este via variantOfId -- ver
  // schema.prisma. variantOf/variants só vêm preenchidos em GET /products
  // e GET /products/:id.
  variantOfId?: string | null;
  variantLabel?: string | null;
  variantOf?: { id: string; name: string } | null;
  variants?: ProductVariantSummary[];
  images?: ProductImage[];
}

export interface Area {
  id: string;
  projectId: string;
  name: string;
}

export interface ProductSpecification {
  id: string;
  areaId: string;
  productId: string;
  product: Product;
  quantity: number;
  unitPrice?: string | null;
  markupPercent?: string | null;
  clientApproved: boolean;
  clientComment?: string | null;
}

export interface MoodboardItem {
  id: string;
  productId: string;
  product: Product;
  order: number;
}

export interface Moodboard {
  id: string;
  projectId: string;
  name: string;
  items: MoodboardItem[];
}

export interface PresentationLink {
  id: string;
  projectId: string;
  token: string;
  createdAt: string;
}

// GET v1/present/:token devolve o Project inteiro (o service não filtra
// campos) -- esta interface lista só os campos que a página de
// apresentação usa, igual ao resto deste arquivo (comentário do topo).
export interface PresentationData {
  id: string;
  name: string;
  client: Client;
  areas: (Area & { specifications: ProductSpecification[] })[];
  moodboards: Moodboard[];
}

export type OfficeLinkProvider = "DRIVE" | "CALENDAR" | "GMAIL";

export interface OfficeLink {
  id: string;
  provider: OfficeLinkProvider;
  externalId: string;
  url: string;
  title: string;
  createdAt: string;
}

export type TaxRegime = "MEI" | "ME";

export interface Account {
  id: string;
  name: string;
  cnpj?: string | null;
  taxRegime: TaxRegime;
  taxRegimeAnexo?: string | null; // "III" | "V" — só relevante quando taxRegime = "ME"
  fatorRPercent?: string | null;
}

export interface FatorRResult {
  fatorR: number;
  anexoRecomendado: "III" | "V";
}

export interface PipelineEstagio {
  estagio: string;
  label: string;
  quantidade: number;
  valorEstimado: number;
}

export interface FaturamentoStatus {
  status: string;
  label: string;
  quantidade: number;
  valorTotal: number;
}

export interface ProjetoResumoFinanceiro {
  projetoId: string;
  nome: string;
  clienteNome: string;
  status: string;
  orcado: number;
  realizado: number;
  recebido: number;
  despesas: number;
  margem: number;
}

export interface VisaoExecutivaKpis {
  pipelineEmAberto: number;
  projetosAtivos: number;
  aReceber: number;
  recebidoNoPeriodo: number;
  pagoNoPeriodo: number;
  margemNoPeriodo: number;
}

export interface TendenciaMes {
  mes: string;
  label: string;
  recebido: number;
  despesas: number;
  margem: number;
  oportunidadesGanhas: number;
}

export interface VisaoExecutiva {
  periodo: { from: string; to: string };
  kpis: VisaoExecutivaKpis;
  pipeline: {
    porEstagio: PipelineEstagio[];
    taxaConversao: number | null;
  };
  faturamento: FaturamentoStatus[];
  despesas: FaturamentoStatus[];
  projetos: ProjetoResumoFinanceiro[];
  tendencia: TendenciaMes[];
}

export interface Expense {
  id: string;
  accountId: string;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  description: string;
  category: string;
  amount: string;
  status: "pendente" | "paga";
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface CapacidadePessoa {
  userId: string;
  nome: string;
  capacidadeSemanal: number;
  horasAlocadasAtualmente: number;
  sobrecarregado: boolean;
  horasApontadas7d: number;
  horasApontadas30d: number;
}

export interface DashboardCapacidade {
  porPessoa: CapacidadePessoa[];
}

export interface FfeProjetoResumo {
  projetoId: string;
  nome: string;
  valorAprovado: number;
  valorPendente: number;
}

export interface FfeProdutoResumo {
  productId: string;
  nome: string;
  quantidadeTotal: number;
}

export interface DashboardFfe {
  porProjeto: FfeProjetoResumo[];
  produtosMaisEspecificados: FfeProdutoResumo[];
  markupMedioPercent: number | null;
  especificacoesSemPreco: number;
}

export interface ActivityAuthor {
  id: string;
  name: string;
  email: string;
}

export interface Activity {
  id: string;
  body: string;
  createdAt: string;
  author: ActivityAuthor;
}

export type TaskStatus = "a_fazer" | "em_andamento" | "concluida";

export interface TaskDependency {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  order: number;
  dueDate?: string | null;
  completedAt?: string | null;
  assignee?: { id: string; name: string; email: string } | null;
  phase: { id: string; stage: PepStage; order: number };
  dependsOn: TaskDependency[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export type AuditChangeValue = string | number | boolean | null;

export interface AuditLogEntry {
  id: string;
  actorType: "user" | "client" | "system";
  actorId?: string | null;
  actorEmail?: string | null;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  changes?: Record<string, { from: AuditChangeValue; to: AuditChangeValue }> | null;
  createdAt: string;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}
