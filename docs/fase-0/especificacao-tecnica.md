# Especificação técnica detalhada — Fase 0

Complementa `adr-0001-stack.md` (por que a base do stack — Postgres,
Prisma, Auth.js) e `adr-0002-nestjs-turborepo.md` (por que backend
separado, revertendo a decisão original de monólito) e `data-model.md` (o
que o schema cobre). Este documento descreve como os módulos se
comunicam, o formato da API própria, e os requisitos não-funcionais.
Como o resto da Fase 0, é uma proposta a validar — não uma decisão
fechada, exceto onde já implementado (marcado abaixo).

## Limites dos módulos

Desde a ADR 0002, os quatro módulos vivem em `apps/api` (NestJS), não
mais no mesmo app que a UI. `apps/web` só tem login (NextAuth) e um
proxy BFF — nenhuma lógica de negócio.

```
apps/api/src/
  <modulo>/*.controller.ts   rotas HTTP
  <modulo>/*.service.ts      regras de negócio e acesso a dados (via PrismaService)
  <modulo>/<modulo>.module.ts
```

Regra: um módulo só acessa dados de outro através de um Service
exportado pelo `@Module` dono (injetado via DI do Nest — ex.:
`OpportunitiesService` injeta `ProjectsService` para a conversão
automática), nunca importando `PrismaService` para consultar uma tabela
"de fora" do módulo dono. Isso mantém a promessa da Fase 0 do plano —
extrair um módulo para um serviço separado no futuro (ex. Procurement)
sem reescrever os outros três; agora é reforçado pelo próprio grafo de
DI do Nest, não só convenção.

O módulo Office não tem módulo próprio com tabelas — ele é uma camada de
integração (Google APIs) chamada pelos outros módulos quando precisam
vincular um arquivo/e-mail/evento a um registro.

## Formato da API própria

REST sob `/v1/<recurso>` em `apps/api` (porta 3001 em dev), JSON.
`apps/web` expõe o mesmo formato em `/api/v1/<recurso>` (porta 3000) via
proxy — o navegador nunca fala com `apps/api` diretamente.

Autenticação: `apps/web` confirma a sessão NextAuth real e forja um
token interno de vida curta (JWT HS256, `INTERNAL_API_SECRET`) por
requisição; `apps/api` valida esse token com um `AuthGuard` global (toda
rota exige autenticação por padrão, `@Public()` é a única exceção — hoje
só `/health`). Ver `adr-0002-nestjs-turborepo.md` para o raciocínio de
segurança completo (por que BFF em vez de `apps/api` ter login próprio).

Todo recurso é implicitamente escopado à `Account` do usuário autenticado
— nenhum endpoint aceita `accountId` como parâmetro do cliente, ele vem
do token. Isso evita a classe de bug mais comum em SaaS multi-tenant
(vazamento de dado entre contas por um filtro esquecido).

Endpoints previstos por módulo (nomes de recurso, não a lista final de
verbos — a detalhar por tela na Fase 0/1):

| Módulo | Recursos |
|---|---|
| CRM | `clients`, `opportunities`, `proposals`, `proposals/:id/stages`, `role-rates` — **implementado** |
| ERP Arquitetura | `projects`, `projects/:id/phases`, `projects/:id/phases/:phaseId/approve`, `projects/:id/phases/:phaseId/invoice`, `invoices`, `time-entries`, `time-entries/:id/approve`, `projects/:id/members`, `users` — **implementado** (núcleo de ERP completo para Fase 1) |
| FF&E | `products`, `projects/:id/areas`, `areas/:id/specifications`, `specifications/:id`, `projects/:id/ffe-checkout` — **implementado** |

Os recursos de CRM e o núcleo de ERP (projetos, gates, faturamento,
timesheet) já têm rota real (`apps/web/src/app/api/v1/`) e regra de
negócio em `modules/crm/` e `modules/erp/`, incluindo o fluxo automático
#1 (`convertOpportunityToProject`), o #4 (aprovação de gate, sequencial —
não dá pra aprovar o gate de um estágio antes do anterior, e o canal é
restrito a e-mail/reunião presencial, nunca WhatsApp), e "por estágio
concluído e aprovado" para faturamento — `POST
.../phases/:phaseId/invoice` recusa (422) se o gate daquele estágio ainda
não tiver `approvedAt`. `TimeEntry` segue a mesma lógica de trava: uma
vez aprovado (`POST /time-entries/:id/approve`), não pode mais ser
editado ou apagado — só existe o registro histórico. Não existe um
endpoint para criar `Project` do zero — nasce só via `Opportunity.wonAt`.
`Invoice` tem dois pontos de criação, os dois automáticos, nunca um POST
genérico: gate de estágio aprovado (`modules/erp/invoices.ts`) e checkout
do carrinho de FF&E (fluxo #3, `modules/ffe/specifications.ts` —
`approveCartToInvoiceDraft`, sem `phaseId` porque não é um estágio do
PEP). `userId` de um `TimeEntry` vem sempre da sessão (quem lança é quem
está autenticado), nunca do corpo da requisição.

O módulo FF&E segue o mesmo padrão: `Product` é catálogo por conta,
`Area` pertence a um `Project`, `ProductSpecification` liga os dois com
quantidade/preço/markup. `POST /projects/:id/ffe-checkout` recebe uma
lista de `specificationIds`, recusa (422 `MISSING_PRICE`) se algum item
não tiver `unitPrice` definido — não dá pra somar orçamento com preço em
aberto — marca os itens como `clientApproved` e gera a fatura numa
transação (`prisma.$transaction`) para não deixar itens aprovados sem
fatura correspondente se algo falhar no meio.

Verificado com um smoke test HTTP real (`npm run smoke-test`, ver README)
contra Postgres local de verdade — não só build/typecheck (51 checks,
incluindo gate fora de ordem, canal inválido, faturar um estágio sem
gate aprovado, editar um lançamento de horas já aprovado, adicionar o
mesmo membro duas vezes num projeto, e fazer checkout de um item sem
preço). O
smoke test encontrou e corrigiu um bug real: violação de FK constraint
com o driver adapter do Prisma 7 chega como `P2039`, não o `P2003`
clássico do query engine antigo — `errorResponse()` em
`apps/web/src/lib/api.ts` trata os dois.

Convenção de resposta de erro (a fixar como padrão desde o primeiro
endpoint real, para não divergir entre módulos):

```json
{ "error": { "code": "NOT_FOUND", "message": "..." } }
```

## Conversões automáticas entre módulos (sem redigitação)

Os três fluxos que o plano descreve como automáticos viram funções
internas, não só um desejo de produto:

1. `Opportunity.wonAt` setado → cria `Project` com `clientId`,
   `feeModel` e `accountId` já copiados da oportunidade
   (`modules/crm/convertOpportunityToProject`) — **implementado**,
   disparado pelo `PATCH /api/v1/opportunities/:id` quando o corpo seta
   `wonAt`. `Opportunity` ganhou um campo `title` que faltava no schema
   original (sem ele não havia como nomear o `Project` criado). As 5
   `ProjectPhase` do PEP são semeadas com `contracted: true` por padrão —
   ainda não puxam quais estágios a Proposal assinada realmente contratou
   (não há hoje um jeito de identificar "a proposta aceita" de uma
   oportunidade); fica como próximo passo.
2. `Project` criado → módulo FF&E passa a permitir criar `Area` para
   aquele projeto (não há cópia de dado, só a FK já existir).
3. `ProductSpecification.clientApproved = true` em lote (checkout do
   carrinho) → gera um `Invoice` no ERP com o total aprovado
   (`modules/ffe/specifications.ts`, `approveCartToInvoiceDraft`) —
   **implementado**, `POST /projects/:id/ffe-checkout`.
4. `ProjectPhase.approvedAt` setado (gate aprovado por e-mail, conforme o
   PEP) → gera o `Invoice` daquele estágio, respeitando "forma de medição:
   por estágio concluído e aprovado" (`modules/erp/invoices.ts`,
   `createInvoiceForPhase`) — **implementado**,
   `POST /projects/:id/phases/:phaseId/invoice`. Um gate sem `approvedAt`
   não é faturável — a API recusa (422), não só a UI sugere.

## Motor de precificação (CRM)

A resposta 4 do questionário de descoberta confirmou que hora técnica é o
único modelo de honorário em uso real hoje — mas "hora técnica" aqui
significa um cálculo bottom-up específico do estúdio
(`docs/fase-0/Base_Precificacao (fazer cópia).xlsx`), não um valor
digitado à mão. Fica como função pura em `modules/crm/pricing.ts`:

```
calcularProposta(input: {
  roleHours: { role: string; stage: ProjectStageName; hours: number }[] // aba 03, calibrado por projeto baseline
  complexityScores: { tipologia, programaEscopo, terreno, regulatorio, ambicaoDesign: number } // 1–5 cada, aba 04
  contractedStages: ProjectStageName[]
  roleRates: RoleRate[] // aba 02, já persistido por Account
}): {
  complexityMultiplier: number       // score médio → 0.70x..1.50x
  stages: ProposalStageResult[]      // baseHours/adjustedHours/baseCost/adjustedCost por estágio, aba 05
  packageDiscountPercent: number     // 10% se 4+ estágios contratados juntos
  value: number                      // preço final
}
```

Os inputs (`RoleRate`, os scores de complexidade de uma oportunidade, as
horas base por papel/estágio) são dados reais a persistir; o overhead
mensal do estúdio, a margem-alvo (30%) e a carga tributária (6%) que
compõem `RoleRate.hourlyRate` ficam calibrados fora do produto por
enquanto (a própria planilha) até valer a pena construir uma tela de
configuração para isso — não é prioridade de Fase 1.

**Números da planilha hoje são placeholders**, não dados reais do estúdio
(a própria aba de instruções da planilha diz isso) — aluguel, software e
hardware aparecem como R$0 e "pessoas ativas" como 1. A estrutura do
cálculo é real; os valores de entrada ainda não foram calibrados.

## Requisitos não-funcionais

- **Multi-tenancy**: toda query de domínio filtra por `accountId` da
  sessão no nível do módulo (não confiar em RLS do Postgres nesta fase —
  ver `data-model.md` sobre a decisão de tenancy pendente).
- **LGPD**: `Client` guarda dado pessoal (CPF, e-mail, telefone). Acesso
  a exportação/exclusão desses dados deve existir antes de qualquer
  cliente real ser cadastrado em produção — não é um "depois".
- **Localização**: moeda BRL e formato de data pt-BR fixos desde o MVP,
  não configuráveis (não há requisito multi-país no plano).
- **Disponibilidade**: sem SLA formal na Fase 1–3 (uso interno da
  Giulia); reavaliar antes de vender a outros escritórios.
- **Navegadores**: últimas duas versões de Chrome/Edge/Safari; sem
  suporte a IE/navegadores legados — o plano não pede isso.

## Pontos de integração externa

- **Google Workspace**: OAuth (Auth.js, já wired), Drive API (arquivos
  vinculados), Gmail API (captura de e-mail), Calendar API (sync de
  marcos). Cada integração é um escopo OAuth incremental — não pedir
  todos os escopos no login inicial, só o mínimo (perfil) e solicitar
  Drive/Gmail/Calendar quando o usuário ativar aquele recurso. O estúdio
  usa só Google Workspace (resposta 14); o login já restringe por `hd` ao
  domínio `studioaraci.com.br` (resposta 15) em `apps/web/src/lib/auth.ts`.
- **NFS-e**: decidido —
  [nfewizard-io](https://github.com/nfewizard-org/nfewizard-io), biblioteca
  Node.js open source (GPL-3.0) que fala direto com SEFAZ/SEFIN Nacional
  via certificado A1 próprio do estúdio (hospedado por nós, não um SaaS
  terceiro). O módulo de NFSe (`@nfewizard/nfse`) segue em fase de testes
  — ver `decisoes-pos-descoberta.md` #4 para os riscos conhecidos (issue
  aberta sobre perfil de assinatura XML da SEFIN Nacional) e os
  requisitos operacionais que essa escolha traz (custódia do `.pfx` como
  segredo, nunca em `.env.example`/commitado/logado; renovação anual do
  certificado). Sabemos o regime (Simples Nacional, Anexo III) e a
  receita média (~R$ 7.000/mês, resposta 8), o que já ajuda a calibrar o
  simulador de Fator R. A integração fica atrás de uma interface única em
  `modules/erp/fiscal/` mesmo assim — não porque o provedor possa trocar,
  mas para manter o módulo financeiro isolado de detalhe de biblioteca
  externa (schema XML, formato de retorno).
- **Boleto/Pix**: nfewizard-io resolve emissão de NFS-e, não cobrança —
  continua em aberto, não decidir junto com NFS-e por engano (são dois
  fornecedores/mecanismos possivelmente diferentes).
- **Captura de produtos (FF&E)**: já existe um protótipo funcional —
  [Malakacrazy/Captura](https://github.com/Malakacrazy/Captura), extensão
  de Chrome (Manifest V3, JS puro) que injeta um botão em páginas de
  produto de 18 lojas brasileiras (Leroy Merlin, Tok&Stok, Camicado,
  Dexco, Deca, Electrolux, Brastemp, entre outras), extrai nome/marca/
  SKU/preço/imagem via seletor por loja com fallback JSON-LD/Open
  Graph/varredura de texto, e já gera PDF de orçamento com a identidade
  "Studio Araci" — tudo local no navegador, sem backend. Isso muda o
  desenho original ("job assíncrono no backend capturando por URL"): a
  captura já acontece no navegador do usuário, não em um worker do
  servidor. Três caminhos possíveis para a Fase 3, nenhum decidido ainda:
  1. a extensão passa a enviar os itens capturados para `POST /api/v1/products`
     em vez de (ou além de) salvar só no Chrome Storage;
  2. a plataforma reimplementa a extração no backend, usando a lista de
     18 lojas e os seletores da extensão como ponto de partida;
  3. os dois convivem — extensão para captura ad-hoc durante navegação,
     backend para reprocessar/atualizar itens já cadastrados.
  A opção 1 é a que menos retrabalho gera (reaproveita a extração já
  validada nas 18 lojas), mas exige autenticação da extensão contra a
  API própria — não avaliado ainda.
- **Migração da Canoa Supply**: removida do escopo (resposta 11) — não é
  mais um ponto de integração a construir.

## Regras de gate e change request (do PEP real do estúdio)

Substituem a suposição genérica de fases do plano original — ver
`docs/fase-0/PEP_Interior.md` e `decisoes-pos-descoberta.md` #1 para a
fonte completa:

- Aprovação de gate é só por escrito (e-mail); WhatsApp não conta.
- Cliente tem 7 dias úteis para revisar cada entrega antes do gate.
- Mudança após gate aprovado: coordenador avalia impacto em 1 dia útil;
  impacto acima de 4h de trabalho ao valor vigente da hora do Arquiteto
  Líder, ou acima de 50% do valor já aprovado da etapa, exige aditivo
  formal antes de entrar em produção.
- Aprovação de item de FF&E dentro de um estágio já aprovado é mais
  informal (WhatsApp serve para itens pequenos, e-mail após reunião para
  itens maiores — resposta 13) — não precisa do mesmo rigor de canal que
  um gate de estágio.

## O que fica para depois desta especificação

O questionário de descoberta foi respondido — ver
`docs/fase-0/decisoes-pos-descoberta.md` para o que mudou e o que ainda
está em aberto (parceiro fiscal, carga tributária da fórmula de
precificação, nomenclatura de papel da equipe, e como a extensão Captura
se conecta à plataforma na Fase 3). Contrato exato de request/response por
endpoint, wireframes atualizados com o motor de precificação real e
diagramas de sequência dos quatro fluxos automáticos ficam para depois
que esses últimos itens forem resolvidos.
