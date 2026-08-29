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
  consentedAt?: string | null;
  anonymizedAt?: string | null;
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
  grossSalary?: string | null;
  payrollBurdenPercent?: string | null;
  billableHoursPerMonth?: string | null;
}

// Lacuna da matriz ("checklist de documentos obrigatórios por fase").
export interface RequiredDocumentType {
  id: string;
  stage: PepStage;
  documentType: string;
}

export interface DocumentChecklistItem {
  documentType: string;
  satisfied: boolean;
}

export interface StudioFixedCost {
  id: string;
  description: string;
  monthlyAmount: string;
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
  // Lacuna da matriz (portal pré-venda) -- pergunta do prospecto sobre a
  // proposta, enviada pelo portal magic link antes de existir Project.
  prospectComment?: string | null;
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

// v1/client-portal/pending-proposals devolve uma projeção própria, sem
// baseCost/adjustedCost/complexityMultiplier/packageDiscountPercent --
// mesmo precedente de C-03/C-04 (composição interna de preço, não o que
// o prospecto vê). Lacuna da matriz (portal pré-venda).
export interface PortalProposalStage {
  stage: PepStage;
  contracted: boolean;
}

export interface PortalProposal {
  id: string;
  value: string;
  status: "draft" | "sent" | "signed" | "expired";
  zapsignSignUrl?: string | null;
  sentAt?: string | null;
  stages: PortalProposalStage[];
}

export interface PortalPendingProposal {
  id: string;
  title: string;
  prospectComment?: string | null;
  proposal: PortalProposal;
}

// Lacuna da matriz ("colaboração com consultores externos") -- projeção
// só-leitura do portal do consultor, deliberadamente sem nada financeiro
// (sem budget de fase, sem Invoice, sem Proposal, sem costPerHour).
export interface CollaboratorProject {
  id: string;
  name: string;
  status: string;
  clientName: string;
}

export interface CollaboratorTask {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  completedAt?: string | null;
  assignee?: { name: string } | null;
}

export interface CollaboratorPhase {
  id: string;
  stage: PepStage;
  order: number;
  contracted: boolean;
  startDate?: string | null;
  dueDate?: string | null;
  approvedAt?: string | null;
  tasks: CollaboratorTask[];
}

export interface CollaboratorActivity {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
}

export interface CollaboratorProjectDetail {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  phases: CollaboratorPhase[];
  activities: CollaboratorActivity[];
}

// Uma linha por convite (CollaboratorProjectAccess) na tela de admin do
// projeto -- ver ProjectCollaboratorsController.
export interface ProjectCollaborator {
  id: string;
  invitedAt: string;
  collaborator: { id: string; name: string; email: string };
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
  nfseChaveAcesso?: string | null;
  nfseIdDps?: string | null;
  nfseAmbienteEmissao?: string | null;
  nfseRejectionReason?: string | null;
  // Lacuna da matriz (NFS-e: cancelamento/substituição) --
  // nfseCanceladaEm presente = nfseChaveAcesso não vale mais (histórico,
  // não apagado). nfseChaveAcessoAnterior só vem preenchido quando a
  // chave atual veio de uma substituição ou reemissão pós-cancelamento.
  nfseCanceladaEm?: string | null;
  nfseMotivoCancelamento?: 1 | 2 | 9 | null;
  nfseJustificativaCancelamento?: string | null;
  nfseChaveAcessoAnterior?: string | null;
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

export interface Absence {
  id: string;
  userId: string;
  user: User;
  startDate: string;
  endDate: string;
  type: string;
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

// Correção "moodboard vira quadro tldraw" -- snapshot é o TLStoreSnapshot
// inteiro (shapes + assets), opaco pra este app (só o tldraw sabe
// desenhar a partir dele). null numa prancha recém-criada, ainda sem
// nenhum traço.
export interface Moodboard {
  id: string;
  projectId: string;
  name: string;
  snapshot: unknown;
}

export type MoodboardCommentAuthorType = "user" | "client" | "guest";

export interface MoodboardComment {
  id: string;
  authorType: MoodboardCommentAuthorType;
  authorName: string;
  body: string;
  createdAt: string;
}

// Nova audiência convidada só pra colaborar num quadro específico (nem
// staff, nem o Client do projeto, nem ExternalCollaborator de projeto
// inteiro), autenticada via Logto -- ver
// app/quadro/login|callback/route.ts e whiteboardGuestPortalApi.ts.
export interface WhiteboardGuestBoard {
  id: string;
  name: string;
  projectName: string;
}

export interface WhiteboardGuestAccess {
  id: string;
  guest: { id: string; name: string; email: string; logtoSubjectId: string | null };
  invitedAt: string;
}

export interface PresentationLink {
  id: string;
  projectId: string;
  token: string;
  createdAt: string;
}

// v1/present/:token (GET e PATCH specifications/:specId) devolve uma
// projeção própria, não o Client/ProductSpecification/Product internos --
// nunca inclui custo, markup ou fornecedor de origem (achado C-03), e
// unitPrice aqui já é o preço com markup aplicado, calculado no service
// (achado C-04), não o unitPrice cru dos tipos internos acima.
export interface PresentationProduct {
  id: string;
  name: string;
  supplier?: string | null;
  imageUrl?: string | null;
}

export interface PresentationSpecification {
  id: string;
  product: PresentationProduct;
  quantity: number;
  unitPrice: string | null;
  clientApproved: boolean;
  clientComment?: string | null;
}

export interface PresentationArea {
  id: string;
  name: string;
  specifications: PresentationSpecification[];
}

// Só id/name aqui -- snapshot é carregado sob demanda por prancha (ver
// getMoodboardBoard/GET .../present/:token/moodboards/:id), não de uma
// vez com o resto da apresentação.
export interface PresentationMoodboard {
  id: string;
  name: string;
}

export interface PresentationMoodboardBoard {
  id: string;
  name: string;
  snapshot: unknown;
}

// Item "grande" da lista de 11 (gestão documental) -- só o que a equipe
// marcou visibleToClient=true e ainda não está quebrado no OfficeLink,
// ver GoogleDriveService.listClientVisibleDocuments.
export interface PresentationDocument {
  id: string;
  title: string;
  documentType: string | null;
  stage: PepStage | null;
}

export interface PresentationData {
  id: string;
  name: string;
  client: { name: string };
  areas: PresentationArea[];
  moodboards: PresentationMoodboard[];
  documents: PresentationDocument[];
}

export type OfficeLinkProvider = "DRIVE" | "CALENDAR" | "GMAIL";

export interface OfficeLink {
  id: string;
  provider: OfficeLinkProvider;
  externalId: string;
  url: string;
  title: string;
  createdAt: string;
  documentType?: string | null;
  phaseId?: string | null;
  visibleToClient: boolean;
  brokenAt?: string | null;
  lastCheckedAt?: string | null;
}

// Lacuna da matriz (gestão documental por projeto, "versionamento") --
// histórico de revisões que o próprio Drive já guarda, só exposto aqui.
// size vem como string (convenção da API do Drive), ausente pra Google
// Doc/Sheet/Slide nativo (não tem bytes).
export interface DriveRevision {
  id: string;
  modifiedTime: string;
  size: string | null;
  lastModifyingUserName: string | null;
  keepForever: boolean;
}

export type TaxRegime = "MEI" | "ME";

export interface Account {
  id: string;
  name: string;
  cnpj?: string | null;
  taxRegime: TaxRegime;
  taxRegimeAnexo?: string | null; // "III" | "V" — só relevante quando taxRegime = "ME"
  fatorRPercent?: string | null;
  pricingMarginPercent: string;
  pricingTaxBurdenPercent: string;
  pricingBusinessDaysPerMonth: number;
  pricingBillableHoursPerDay: string;
  pricingActiveStaffCount: string;
  dataRetentionMonths?: number | null;
  nfseAmbiente: "homologacao" | "producao";
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
  clientId?: string | null;
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
