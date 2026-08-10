# Roadmap atualizado — do que falta de Fase 0 até o go-live

O roadmap original (no `.docx`) tinha 6 fases genéricas com durações
estimadas antes de qualquer descoberta real. Agora temos o PEP real do
estúdio, o motor de precificação, o domínio Google Workspace, e sabemos
que a Canoa não precisa de migração e que já existe um capturador de
produtos funcionando. Este documento reescopa o que falta com base nisso.
Não reproduz estimativas de semana por fase do plano original — sem
composição de equipe confirmada, um número de semanas seria um chute, e
seria "adivinhar decisão que é da Giulia" (mesmo erro que
`especificacao-tecnica.md` já evita). Onde a descoberta muda o tamanho
relativo do escopo de uma fase (maior ou menor que o plano original
assumia), isso é dito explicitamente.

## Fase 0 — o que já está pronto e o que ainda falta

**Pronto:**
- Stack decidido e scaffolded (`adr-0001-stack.md`, repo funcional, build
  passando): Next.js + Prisma/Postgres + Auth.js.
- Modelo de dados cobrindo CRM/ERP/FF&E com os 5 estágios reais do PEP,
  motor de precificação (`RoleRate`, `ProposalStage`), e billing por
  estágio aprovado.
- Especificação técnica (limites de módulo, formato de API, fluxos
  automáticos, regras de gate/change request).
- Protótipo navegável de baixa fidelidade (9 telas — Equipe/Financeiro do
  projeto, Timesheet e Catálogo de Produtos entraram depois, cobrindo o
  que faltava de CRM/ERP/FF&E). A navegação em si tinha um bug real (todas
  as folhas ficavam visíveis ao mesmo tempo, empate de especificidade CSS
  entre `[hidden]` e `.sheet{display:flex}`) — corrigido; o arquivo não
  era de fato "navegável" antes disso.
- Questionário de descoberta respondido; domínio Google Workspace
  (`studioaraci.com.br`) e carga tributária (6%) confirmados e já
  aplicados no código/docs.
- Capturador de FF&E localizado e avaliado (`Malakacrazy/Captura`).

**Ainda falta (bloqueiam Fase 1, nenhum é tarefa de código):**
- Validar a especificação técnica e o protótipo com a Giulia formalmente
  — é o entregável "plano de projeto validado" que a Fase 0 do plano
  original pedia, e ainda não aconteceu.
- Montar a equipe (ou decidir modelo: CLT/PJ, software house, freelancers
  — o plano original já apontava esse trade-off, segue em aberto).
- Calibrar os números da planilha de precificação (custos fixos reais do
  estúdio, horas base reais por papel/estágio) — hoje são placeholders.
- Obter o certificado A1 do estúdio antes da Fase 2 (emissão de NFS-e via
  `nfewizard-io`, já decidido — ver `decisoes-pos-descoberta.md` #4).
  Boleto/Pix segue em aberto separadamente.

## Fase 1 — MVP: ERP + CRM

Escopo **maior** do que o plano original assumia: "Builder de propostas"
não é mais um formulário com um campo de valor — é o motor de
precificação inteiro (custo/hora por papel, complexidade, configurador de
estágios, desconto de pacote, cenários comparativos). Isso é trabalho de
produto real (a aba 06 já tem os 6 cenários nomeados com notas de venda),
não um detalhe de implementação.

- **Auth**: SSO Google — **implementado e verificado com credenciais OAuth
  reais** (não é mais um item em aberto; ver "Office inicial" abaixo, que
  reaproveita o mesmo login).
- **CRM — Pipeline**: `Client`, `Opportunity`, captação multicanal, kanban
  por estágio — **API e UI implementadas** (`/clients`, `/opportunities`),
  incluindo o fluxo de conversão automática (ver abaixo) visível na tela.
- **CRM — Motor de precificação**: **API e UI implementadas**
  (`/opportunities/:id`) — configuração de `RoleRate` por papel
  (`/role-rates`), formulário de scores de complexidade (5 dimensões),
  configurador de estágios contratados computando `ProposalStage` (horas
  base × multiplicador, desconto de pacote), transição de status
  draft/sent/signed. Não incluído: os 6 cenários da aba 06 como templates
  pré-configurados no builder — fica para uma iteração futura, não bloqueia
  o uso real do motor.
- **CRM → ERP**: conversão automática de oportunidade ganha em projeto
  (`OpportunitiesService.convertToProject` em `apps/api`) — implementada e
  visível na UI (marcar "Ganho" no pipeline gera o projeto e mostra o link
  direto para ele).
- **ERP — Projetos**: `Project`, os 5 `ProjectPhase` do PEP com
  `contracted`/`order`/`budget` — **API e UI implementadas** (`/projects`,
  `/projects/:id`: orçado × realizado por projeto, cronograma por fase).
  Visão só em lista/detalhe, não Gantt/Kanban/Calendário — o plano original
  citava as três, nenhuma construída ainda.
- **ERP — Gates**: campo de aprovação (`approvedAt`/`approvalChannel`) —
  **API e UI implementadas**, com bloqueio de avançar de estágio sem
  aprovação registrada (`GATE_OUT_OF_ORDER`) e faturamento por fase
  aprovada direto na tela do projeto.
- **ERP — Timesheet**: apontamento de horas por projeto/fase — **API e UI
  implementadas** (`/timesheet`): lançamento manual (sem cronômetro
  start/stop ainda) e aprovação por gestor.
- **ERP — Equipe**: cadastro de equipe/papel e alocação por projeto —
  **implementado** (`users`, `projects/:id/members`), API e UI
  (`/team`, seção Equipe em `/projects/:id`), usando a nomenclatura de
  papel já reconciliada. Sem planejamento de capacidade/matching de
  competências ainda — só cadastro e alocação direta.
- **Office inicial**: Drive/Calendar vinculados a projeto/cliente (Gmail
  fica para a Fase 4, conforme o plano original) — **implementado e
  verificado com credenciais OAuth reais**, ponta a ponta. API
  (`OfficeLink` em `apps/api`, endpoints em `v1/projects/:id/office-links`
  e `v1/clients/:id/office-links`) e UI mínima (`apps/web`, páginas
  `/projects/:id` e `/clients/:id`) prontas. Autorização incremental via
  Google Identity Services (fora do login do NextAuth, só quando o
  usuário ativa Drive ou Calendar, escopo mínimo por recurso —
  `drive.file` e `calendar.events.readonly`) — não usa o token de sessão
  do login principal. Drive usa a Picker API real (confirmado: arquivo
  selecionado aparece corretamente na lista). Calendar não tem Picker do
  Google (a API só cobre Drive/Docs/Fotos/etc.) — construída uma listagem
  própria dos próximos eventos via Calendar API; consulta e autorização
  confirmadas contra uma conta real (retornou lista vazia porque a agenda
  de teste não tinha evento futuro, não por bug — o clique em "Vincular"
  de um evento específico ainda não foi exercido com um evento real).

## Fase 2 — Financeiro & Fiscal

Sem mudança de escopo em relação ao plano original, mas com inputs reais
agora disponíveis em vez de hipotéticos:

- Integração com `nfewizard-io` para NFS-e (decidido, self-hosted,
  certificado A1 do estúdio) atrás de um módulo fiscal dedicado a
  construir em `apps/api` (ainda não implementado); boleto/Pix segue
  como fornecedor separado, ainda não escolhido.
- Faturamento por estágio aprovado (`Invoice.phaseId`), não por marco
  genérico — já modelado no schema.
- Simulador de Fator R: usa Anexo III e receita média ~R$ 7.000/mês como
  ponto de partida, mas precisa calcular a razão folha/receita
  dinamicamente conforme a equipe cresce — não é o mesmo número que a
  carga tributária de 6% usada na fórmula de tarifa/hora (são dois
  conceitos fiscais diferentes, não confundir um com o outro no código).
- Campos da Reforma Tributária (CST-IBS, CST-CBS, cClassTrib) — só a
  partir desta fase, conforme já recomendado.

## Fase 3 — FF&E

Escopo **menor** do que o plano original assumia, por dois motivos
confirmados na descoberta: sem migração da Canoa, e sem construir um
scraper do zero (o Captura já existe e funciona para 18 lojas). O núcleo
de API já está pronto — o que sobra é mais estreito do que o roadmap
original previa:

- **Implementado**: catálogo (`Product`, com suporte a placeholder
  genérico), especificação por ambiente (`Area` → `ProductSpecification`
  com quantidade/preço/markup), e o carrinho/checkout —
  `POST /projects/:id/ffe-checkout` marca os itens aprovados e gera a
  fatura de FF&E automaticamente (recusa itens sem preço definido).
- Decidir e implementar a integração com o Captura — das três opções em
  `especificacao-tecnica.md`, a que menos retrabalho gera é a extensão
  passar a enviar para `POST /api/v1/products` (exige autenticar a
  extensão contra a API própria, ainda não desenhado).
- Tear sheets, moodboards, modo de apresentação por link — ainda não
  modelados no schema (ver `data-model.md`), ficam para o desenho desta
  fase.

## Fase 4 — Integrações avançadas, BI & mobile

Sem mudança de escopo identificada na descoberta. Gmail avançado,
exportação CAD/Revit, dashboards de BI, versão mobile para apontamento de
horas e aprovação de FF&E em campo — como no plano original.

## Fase 5 — Beta & go-live

Sem mudança de escopo. Vale só registrar que "migração de dados
existentes" não inclui mais a Canoa Supply (removida do escopo na Fase
3) — o item de migração desta fase fica mais leve do que o plano
original previa.

## Decisões que ainda faltam antes de motivar prazos

Estimar duração por fase de forma responsável exige, no mínimo: equipe
confirmada (tamanho e regime de contratação) e a decisão de integração do
Captura (emissão de NFS-e já decidida — ver `decisoes-pos-descoberta.md`
#4). Nenhum desses é uma lacuna de informação técnica — são decisões de
negócio da Giulia, então ficam como
próximos passos, não como suposições deste documento.
