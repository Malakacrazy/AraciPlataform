# Modelo de dados

Schema completo em `packages/db/prisma/schema.prisma` — **40 modelos, 4
enums, 38 migrações lineares e aditivas**. Este documento explica as
escolhas e, mais importante, o que **ainda não está modelado** — para não
passar a falsa impressão de que o modelo está fechado.

> Revisado em 30 ago 2026 contra o schema real. "Estrutura por módulo" e
> "Campos fiscais" descrevem o núcleo original; o que entrou depois está em
> "Modelado depois que este documento foi escrito".

## Estrutura por módulo

- **Tenancy**: `Account` é a raiz de tudo (a firma/escritório). Todas as
  entidades de domínio referenciam `accountId`, direta ou indiretamente,
  seguindo o princípio "dados organizados por conta/empresa desde o
  início" do plano.
- **CRM**: `Client` → `Opportunity` (pipeline) → `Proposal`. `Opportunity`
  ganha vira `Project` via `opportunityId` único (mapeia a conversão
  automática lead→projeto descrita no plano). `Proposal` carrega o
  resultado do motor de precificação real do estúdio (`complexityMultiplier`,
  `packageDiscountPercent`) e `ProposalStage` espelha, linha a linha, o
  "Configurador" da planilha de precificação — ver
  `especificacao-tecnica.md` para o pipeline completo do cálculo.
- **ERP Arquitetura**: `Project` → `ProjectPhase` → `Task`; `ProjectMember`
  liga `User` a `Project`; `TimeEntry` é o apontamento de horas;
  `Invoice` é o faturamento por projeto (opcionalmente por `ProjectPhase`,
  já que o PEP fatura por estágio concluído e aprovado). `ProjectPhase.stage`
  usa o enum `ProjectStageName` com os 5 estágios reais do PEP do estúdio
  (Captação e Alinhamento → Briefing → Criação e Conceito → Detalhamento de
  Acabamentos → Executivo), não os 3 nomes genéricos do plano original —
  ver `decisoes-pos-descoberta.md` #1. `approvedAt`/`approvalChannel`
  existem porque a aprovação de gate do PEP é formal (e-mail, nunca
  WhatsApp) e condiciona o faturamento daquele estágio.
- **FF&E**: `Area` (ambiente do projeto) → `ProductSpecification` (linha do
  carrinho) → `Product` (catálogo). A soma das `ProductSpecification` com
  `clientApproved = true` é o orçamento/planilha final — não existe uma
  tabela "Cart" separada porque a especificação aprovada já é o carrinho.
- **Office**: `OfficeLink` (Drive/Calendar) → `Project`/`Client` polimórfico
  (`entityType`/`entityId`, sem FK direta — validado na service layer, não
  no banco). Guarda só a referência externa (id/url/título), nunca o
  conteúdo — o plano é explícito que a plataforma não deve recriar o
  Workspace. `entityId` sem FK é uma escolha deliberada: Prisma não modela
  bem "pertence a um de vários tipos" sem uma tabela por tipo (o que
  dobraria o schema para um vínculo que é só metadado de exibição).
  Gmail entrou depois como terceiro valor de `OfficeLinkProvider` — não
  exigiu mudança de lógica, porque `provider` já era validado
  genericamente contra o enum. E o vínculo deixou de ser "só metadado":
  hoje carrega taxonomia (tipo de documento, fase, visibilidade ao
  cliente) e alimenta o checklist que trava o gate do PEP.

## RoleRate: por que a tarifa/hora é dado, mas a fórmula não é

`RoleRate.hourlyRate` guarda o resultado final do cálculo de tarifa/hora
por papel (custo direto + overhead, com margem e impostos aplicados). O
cálculo em si — overhead mensal do estúdio, margem-alvo, carga tributária
— não vira tabela: são poucos números que mudam raramente, calculados uma
vez e aplicados como função em `apps/api/src/crm/pricing.ts`. Guardar cada
etapa intermediária do cálculo como linha de banco criaria estado
duplicado sem necessidade (a mesma razão pela qual não existe uma tabela
"Cart" separada em FF&E).

## Campos fiscais incluídos de propósito

`Account.taxRegimeAnexo` e `Account.fatorRPercent` existem desde já porque
o plano cita a simulação de Fator R como diferencial competitivo real
(nenhum concorrente pesquisado oferece isso). `Invoice.nfseNumber` marca o
ponto de integração com o parceiro fiscal (Fase 2).

## Modelado depois que este documento foi escrito

O schema cresceu muito além do que a seção "Estrutura por módulo" acima
descreve — hoje são **40 modelos e 38 migrações**. Estes entraram depois e
não estavam documentados em lugar nenhum:

- **Precificação e custo:** `StudioFixedCost` (custo fixo do estúdio,
  rateado em overhead/hora) e `ProposalStage`; os parâmetros de
  capacidade, margem e carga tributária ficam no próprio `Account`.
- **Financeiro:** `Expense` (contas a pagar) e `InvoiceLine` (uma linha
  por papel na fatura por hora).
- **Equipe:** `Allocation` (horas/semana planejadas por pessoa/projeto,
  distinto de `TimeEntry` já trabalhado), `User.weeklyCapacityHours` e
  `Absence` (férias/licença/atestado — saiu da lista de pendências).
- **FF&E e apresentação:** `ProductImage`, variantes por auto-relação em
  `Product`, `Moodboard`/`MoodboardComment` (pranchas colaborativas em
  tldraw) e `PresentationLink`.
- **Portal do cliente:** `ClientMagicLink` (15 min, uso único) e
  `ClientSession` (7 dias, token opaco).
- **Consultor externo:** `ExternalCollaborator`,
  `CollaboratorProjectAccess`, `CollaboratorMagicLink` e
  `CollaboratorSession` — identidade separada de `User`, com escopo por
  projeto negado por padrão.
- **Convidado de quadro:** `WhiteboardGuest`, `WhiteboardGuestAccess`,
  `WhiteboardGuestSession`.
- **Operação:** `Activity` (notas polimórficas), `Notification`,
  `AuditLog` (diff campo a campo por extensão do Prisma Client),
  `GoogleCredential` (refresh token cifrado em AES-256-GCM) e
  `RequiredDocumentType` (checklist que trava o gate do PEP).
- **Fiscal:** os campos da Reforma Tributária (`Invoice.cstIbs`,
  `cstCbs`, `cClassTrib`) e o estado completo da emissão de NFS-e
  (`nfseChaveAcesso` com `@unique`, `nfseIdDps`, `nfseNumeroDps`,
  `nfseAmbienteEmissao`, `nfseChaveAcessoAnterior`, `nfseCanceladaEm`,
  `nfseRejectionReason`, `nfseXmlArchiveError`).
- **Office:** `OfficeLinkProvider` inclui `GMAIL`, e `OfficeLink` ganhou
  taxonomia documental (tipo, fase, visibilidade ao cliente).

## O que NÃO está modelado (revisado em 30 ago 2026)

Auditado contra o schema — ver `../auditoria-2026-08-30.md`. Continua fora:

- Cálculo/retenções de RPA para freelancers (INSS, IRRF, ISS)
- Checklist de RRT e vínculo com SICCAU/CAU
- Indicador de sustentabilidade/pegada de carbono por produto
- Tear sheets como entidade própria — a ficha existe como página gerada a
  partir de `Product` (`/products/:id/tear-sheet`), como este documento
  previa; o layout/template continua não modelado
- **Acesso escopado por projeto para o staff interno.** `User.accessLevel`
  só tem `admin`/`staff`, e `ProjectMember` é lista de equipe, não regra
  de acesso — qualquer staff alcança todo projeto da conta. O escopo por
  projeto que existe hoje vale só para o **consultor externo**
  (`CollaboratorProjectAccess`).
- **Mecanismos de LGPD do titular** além da exportação: não há modelo de
  consentimento versionado nem de pedido de exclusão/anonimização.
- Nomenclatura de papel/função da equipe — reconciliada (ver
  `decisoes-pos-descoberta.md` #2 e `apps/api/src/roles.ts`);
  `RoleRate.role` continua string livre por design, não por pendência
- Migração de dados da Canoa Supply: **removida do escopo** — a resposta
  11 do questionário de descoberta confirmou que não é necessária

## Três lacunas no que já está modelado

Achadas na auditoria de 30 ago 2026. Não são "o que falta modelar" — são
defeito no que existe:

- **`Client.email` ganhou `@unique`, mas a migração não normalizou nem
  deduplicou** os registros anteriores, e a busca do magic link deixou de
  ser case-insensitive.
- **`Invoice.phaseId` não tem `@@unique`**, embora `invoices.service.ts`
  apoie a corretude do faturamento por hora no invariante "uma fatura por
  estágio". Hoje isso é `check-then-act`: duas requisições concorrentes
  criam duas faturas cobrindo as mesmas `TimeEntry`.
- **Índices de FK regrediram nas tabelas novas.** A migração
  `20260828005223` adicionou 19 índices; a `20260828132000` criou as cinco
  tabelas do quadro sem nenhum. Mesmo caso em `OfficeLink.phaseId` (a
  coluna que o checklist do gate consulta isoladamente) e em
  `ClientMagicLink.clientId`/`ClientSession.clientId`.

## Multi-tenancy: decisão pendente

O schema usa `accountId` em cada tabela (row-level tenancy num banco
único), adequado para uma única firma hoje com caminho de crescimento. Se
o produto vier a atender múltiplas firmas simultaneamente, vale reavaliar
isolamento mais forte (schema por tenant ou banco por tenant) — não é uma
decisão para a Fase 0 do projeto da Giulia, mas fica registrada aqui para
não ser esquecida se o produto for revendido no futuro.
