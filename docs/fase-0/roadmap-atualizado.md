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
- Protótipo navegável de baixa fidelidade (7 telas).
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
- Reconciliar nomes de papel da equipe entre `PEP_Interior.md` e a
  planilha de precificação (afeta como `RoleRate.role` é populado).
- Calibrar os números da planilha de precificação (custos fixos reais do
  estúdio, horas base reais por papel/estágio) — hoje são placeholders.
- Escolher parceiro fiscal (Asaas, eNotas, NFE.io, Focus NFe) — bloqueia
  o início real da Fase 2, não precisa ser decidido antes disso.

## Fase 1 — MVP: ERP + CRM

Escopo **maior** do que o plano original assumia: "Builder de propostas"
não é mais um formulário com um campo de valor — é o motor de
precificação inteiro (custo/hora por papel, complexidade, configurador de
estágios, desconto de pacote, cenários comparativos). Isso é trabalho de
produto real (a aba 06 já tem os 6 cenários nomeados com notas de venda),
não um detalhe de implementação.

- **Auth**: SSO Google já funciona no código; falta só credenciais OAuth
  reais (`GOOGLE_CLIENT_ID`/`SECRET`) provisionadas no Google Cloud
  Console do domínio `studioaraci.com.br`.
- **CRM — Pipeline**: `Client`, `Opportunity`, captação multicanal,
  kanban por estágio.
- **CRM — Motor de precificação**: tela de configuração de `RoleRate` por
  papel; formulário de scores de complexidade (5 dimensões); configurador
  de estágios contratados computando `ProposalStage` (horas base ×
  multiplicador, desconto de pacote); os 6 cenários da aba 06 como
  templates pré-configurados no builder de propostas.
- **CRM → ERP**: conversão automática de oportunidade ganha em projeto
  (`modules/crm/convertOpportunityToProject`), já especificada.
- **ERP — Projetos**: `Project`, os 5 `ProjectPhase` do PEP com
  `contracted`/`order`/`budget`; visão de cronograma (Gantt/Kanban/
  Calendário conforme o plano original, sem mudança aqui).
- **ERP — Gates**: campo de aprovação (`approvedAt`/`approvalChannel`) na
  UI de cada fase, com o prazo de 7 dias úteis do PEP visível; bloqueio
  de avançar de estágio sem aprovação registrada.
- **ERP — Timesheet**: apontamento de horas por projeto/fase — greenfield,
  nada a migrar (resposta 6 do questionário confirma que não existe
  registro de horas hoje).
- **ERP — Equipe**: cadastro de equipe e papel — depende da reconciliação
  de nomenclatura de papel pendente na Fase 0.
- **Office inicial**: Drive/Calendar vinculados a projeto/cliente (Gmail
  fica para a Fase 4, conforme o plano original).

## Fase 2 — Financeiro & Fiscal

Sem mudança de escopo em relação ao plano original, mas com inputs reais
agora disponíveis em vez de hipotéticos:

- Integração com o parceiro fiscal escolhido (NFS-e/boleto/Pix) atrás da
  interface única já especificada em `modules/erp/fiscal/`.
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
scraper do zero (o Captura já existe e funciona para 18 lojas). O que
sobra de trabalho real:

- Decidir e implementar a integração com o Captura — das três opções em
  `especificacao-tecnica.md`, a que menos retrabalho gera é a extensão
  passar a enviar para `POST /api/v1/products` (exige autenticar a
  extensão contra a API própria, ainda não desenhado).
- Catálogo (`Product`), especificação por ambiente (`Area` →
  `ProductSpecification`), já modelados.
- Tear sheets, moodboards, modo de apresentação por link — ainda não
  modelados no schema (ver `data-model.md`), ficam para o desenho desta
  fase.
- Carrinho/aprovação do cliente e o fluxo automático para rascunho de
  fatura no ERP (`modules/ffe/approveCartToInvoiceDraft`) — já
  especificado.

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
confirmada (tamanho e regime de contratação), parceiro fiscal escolhido,
e a decisão de integração do Captura. Nenhum desses é uma lacuna de
informação técnica — são decisões de negócio da Giulia, então ficam como
próximos passos, não como suposições deste documento.
