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
  draft/sent/signed, e os 6 cenários da aba 06 como templates
  pré-configurados (extraídos da planilha real, não inventados — achado no
  processo: a descrição textual do cenário D diverge da própria matriz de
  estágios da aba 06, matriz usada como fonte já que é o que os valores
  calculados da aba realmente seguem; vale confirmar com a Giulia qual
  está desatualizada).
- **CRM → ERP**: conversão automática de oportunidade ganha em projeto
  (`OpportunitiesService.convertToProject` em `apps/api`) — implementada e
  visível na UI (marcar "Ganho" no pipeline gera o projeto e mostra o link
  direto para ele).
- **ERP — Projetos**: `Project`, os 5 `ProjectPhase` do PEP com
  `contracted`/`order`/`budget` — **API e UI implementadas** (`/projects`,
  `/projects/:id`: orçado por fase e cronograma por fase — o "realizado"
  citado aqui antes não existia de fato até o dashboard executivo da
  Fase 4, ver abaixo; esta tela só mostrava o orçado),
  incluindo as três visões que o plano original citava (Gantt/Kanban/
  Calendário), alternáveis na mesma tela. Exigiu endpoint novo
  (`PATCH .../phases/:phaseId`, só startDate/dueDate/budget — nunca
  approvedAt/stage/order/contracted) que não existia; sem isso não havia
  dado real para Gantt/Calendário mostrarem.
- **ERP — Gates**: campo de aprovação (`approvedAt`/`approvalChannel`) —
  **API e UI implementadas**, com bloqueio de avançar de estágio sem
  aprovação registrada (`GATE_OUT_OF_ORDER`) e faturamento por fase
  aprovada direto na tela do projeto.
- **ERP — Timesheet**: apontamento de horas por projeto/fase — **API e UI
  implementadas** (`/timesheet`): lançamento manual, cronômetro start/stop
  (arredonda para o quarto de hora mais próximo ao parar), e aprovação por
  gestor.
- **ERP — Equipe**: cadastro de equipe/papel e alocação por projeto —
  **implementado** (`users`, `projects/:id/members`), API e UI
  (`/team`, seção Equipe em `/projects/:id`), usando a nomenclatura de
  papel já reconciliada.
- **ERP — Planejamento de capacidade**: **implementado** — modelo
  `Allocation` (compromisso planejado de horas/semana por pessoa/projeto
  entre datas, distinto de `TimeEntry` já trabalhado e de `ProjectMember`
  sem tempo/data) e `User.weeklyCapacityHours` (default 40). API completa
  (`v1/allocations`: GET com filtro por usuário/projeto, POST, DELETE) e
  UI em `/team/planning` (formulário de alocação, visões Lista/Gantt/
  Calendário, carga por pessoa com detecção de pico via sweep-line —
  "sobrecarregado" quando o pico de horas/semana simultâneas excede a
  capacidade — e custo por projeto vs. orçado nas fases). `/team` também
  ganhou um resumo de carga recente por `TimeEntry` (retrospectivo, janela
  rolante de 7/30 dias) para contexto ao lado do cadastro. Verificado:
  build limpo (web+api+db) e 88/88 no smoke test, incluindo os 6 casos
  novos de `/allocations` (default de capacidade, criação com include de
  projeto/fases, validação de intervalo de datas, 404 em projeto
  inexistente, listagem e remoção).
- **ERP — Matching de competências**: **implementado** — o formulário de
  "Nova alocação" em `/team/planning` (`AllocationForm`, componente
  cliente) ordena a lista de colaboradores por disponibilidade (horas
  livres calculadas dentro do período pedido via `peakHoursInWindow`,
  não a carga geral da pessoa — uma sobreposição de pico fora da janela
  não deveria pesar contra alguém livre justamente nesse período) e, se
  uma especialidade é buscada (texto livre — não há campo de
  especialidade requerida no schema, então isso não vira estado
  persistido em lugar nenhum), prioriza quem combina. Não filtra ninguém
  da lista — só reordena — porque especialidade é texto livre e uma
  correspondência exata seria frágil (nomenclatura pode divergir sem que
  a pessoa deixe de servir). `peakHoursInWindow` (`lib/allocations.ts`)
  foi verificado manualmente contra 4 casos (sobreposição total dentro da
  janela, alocação inteiramente fora da janela, sobreposição parcial nos
  limites, e paridade com `peakHoursPerWeek` quando a janela cobre tudo)
  — não há suíte de testes automatizados no `apps/web` (sem script `test`
  no `package.json`, diferente de `apps/api`), então isso não está
  coberto por CI. **Testado num navegador real** (não só a lógica
  isolada): buscar "FF&E" no campo de especialidade eleva os ~20
  colaboradores de teste com esse valor pro topo da lista (marcados com
  `✓`), ordenados entre si por disponibilidade (`ana.costa`, com só 5h
  livres, cai pro fim do grupo combinado mas continua acima de quem não
  combina); ninguém é removido da lista, só reordenado, confirmando o
  comportamento documentado.
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

- **Regime tributário (MEI/ME) e simulador de Fator R — implementado, API
  e UI**, em `/financeiro`. `Account.taxRegime` ("MEI" | "ME") gates o
  simulador: o estúdio é MEI hoje (com migração pra ME prevista), MEI
  tributa por valor fixo (DAS-MEI) e não usa Fator R, então a API rejeita
  a simulação com 422 enquanto o regime for MEI em vez de calcular um
  Anexo que não significaria nada. Depois de ME, a razão folha/receita
  (12 meses) decide Anexo III (>=28%) ou V, persistido em
  `Account.fatorRPercent`/`taxRegimeAnexo`. Achado testando de verdade no
  navegador: o `<select>` do regime usava `defaultValue`, que o React só
  aplica no mount — depois de trocar e revalidar, o dado por trás estava
  certo (o simulador aparecia/sumia certo) mas o próprio dropdown ficava
  mostrando o valor antigo; corrigido com `key={taxRegime}` forçando
  remount. 4 testes unitários (`calcularFatorR`) + 7 casos de smoke test.
- **Integração NFS-e (`@nfewizard/nfse`) — módulo construído e emissão de
  teste autorizada de verdade pela SEFIN Nacional (Homologação)**.
  Instalado e investigado pelo código-fonte instalado, não só o README
  (que tem um bug na própria documentação: o exemplo usa
  `config.nfse.ambiente`, o construtor real exige `config.nfe.ambiente`).
  Dois endpoints em `apps/api/src/erp/fiscal/`: `inspecionar-certificado`
  (só abre o .pfx localmente com `node-forge`, sem chamada externa —
  usado pra ler o CNPJ real do certificado, que precisa bater com o CNPJ
  declarado na DPS) e `emitir-teste` (chama de fato o webservice de
  Homologação da SEFIN Nacional com um DPS de dado fictício, por decisão
  explícita — não a identidade fiscal real do estúdio, que ainda depende
  de confirmação da consultoria contábil). Ambiente de Produção nunca é
  alcançável por variável de ambiente, só por mudança de código
  deliberada.
  - Certificado de teste trocado (`StudioAraci.pfx`, senha nova) depois
    que a senha original foi esquecida; `inspecionar-certificado` leu o
    CNPJ real do certificado (53.554.180/0001-10, titular Giulia Pessanha
    Parente, válido 2026-08-24 a 2027-08-24) sem precisar perguntar pro
    usuário.
  - `emitir-teste` foi disparado de verdade contra o webservice real de
    Homologação só depois de confirmação explícita do usuário. Primeira
    tentativa voltou `502`/`Request failed with status code 400` — o
    catch original só repassava a mensagem genérica do axios, descartando
    o `error.nfseErrorDetail` (codigo/descricao/complemento) que a lib
    anexa de verdade; corrigido pra surfacear esse detalhe (necessário
    pra qualquer diagnóstico futuro de rejeição real da SEFIN).
  - Com o detalhe real visível, quatro rejeições genuínas da SEFIN
    Nacional foram corrigidas uma a uma no DPS de teste
    (`nfse-test-dps.ts`): (1) `totTrib: {}` vazio — precisa de pelo menos
    um sub-elemento (`vTotTrib`/`pTotTrib`/`indTotTrib`/`pTotTribSN`);
    (2) `dhEmi` construído com `toISOString().replace('Z','-03:00')`, que
    só rotula o horário UTC como se já fosse Brasília sem de fato
    subtrair o offset — adiantava a data de emissão declarada em 3h e a
    SEFIN rejeitava por ser "posterior ao processamento"; (3) CPF fictício
    `000.000.000-00` falha o dígito verificador — trocado por
    `111.444.777-35`, o CPF de teste padrão BR com dígitos válidos;
    (4) código de tributação nacional chutado (`070100`, item 07.01 da
    LC116) não existe na lista nacional de 6 dígitos — trocado
    temporariamente por `110101` (o mesmo usado nos testes oficiais da
    própria lib) só pra provar a integração mecânica. Depois dessas
    quatro correções, `emitir-teste` voltou `201` com `chaveAcesso`/
    `idDps` reais da SEFIN Nacional Homologação.
  - **Dado fiscal real confirmado pela Giulia** (ver
    decisoes-pos-descoberta.md #4 para o detalhe completo): endereço do
    estúdio, Inscrição Municipal (não existe), e — o achado mais
    importante — **Arquitetura não pode ser MEI**, então o código de
    serviço válido depende do regime: `170201` (Datilografia) enquanto
    MEI, `070104`/`1520` (nacional/municipal SP) só depois de ME.
    `cTribNac` no DPS de teste trocado do placeholder `110101` pro código
    real do regime atual (`170201`). Endereço real também foi testado —
    rejeitado pela SEFIN (E0128, mesma lógica do E0121 do nome: o
    emitente não declara o que a SEFIN já sabe pelo CNPJ), então fica só
    documentado, não no payload. Re-emitido depois de tudo isso: `201`
    de novo, com `chaveAcesso`/`idDps` novos.
  - O certificado de teste original estava solto na raiz do repo, sem
    gitignore, quando a integração começou — `*.pfx`/`*.p12` adicionados
    ao `.gitignore` antes de qualquer outra coisa. Certificado trocado
    depois (`StudioAraci.pfx`, também gitignored) pelo atual, válido até
    2027-08-24.
- Faturamento por estágio aprovado (`Invoice.phaseId`), não por marco
  genérico — já modelado no schema.
- **Campos da Reforma Tributária (CST-IBS, CST-CBS, cClassTrib) —
  implementado**: `Invoice.cstIbs`/`cstCbs`/`cClassTrib`, preenchidos
  manualmente via `PATCH /v1/invoices/:id` (mesmo endpoint que já seta
  `nfseNumber`), sem lógica de split payment (não obrigatório antes de
  2027, conforme já recomendado). Coberto no smoke test.
- **Boleto/Pix — fornecedor escolhido (Asaas) e integração
  implementada**. A decisão veio de pesquisa comparando Inter, Cora e
  Asaas na mesma profundidade (não só a página de marketing de cada um —
  Inter e Cora pareciam melhores até a API de verdade ser lida): Inter
  bloqueia acesso à API pra contas MEI (a própria conta MEI é livre, a
  API não), exige mTLS tanto na autenticação quanto na entrega do
  webhook, e não tem sandbox; Cora tem auth OAuth2+mTLS do mesmo jeito, e
  a API só está disponível no plano pago CoraPro (R$44,90/mês), não no
  plano grátis que a página inicial sugere. Asaas venceu nos dois
  critérios que mais importavam aqui: autenticação é só uma API key (sem
  certificado, sem OAuth2), e o acesso à API é grátis, sem gate de plano,
  com MEI liberado hoje — sem depender da migração pra ME que o NFS-e via
  certificado A1 não tem esse problema.
  - `billing/asaas-client.ts`: cliente HTTP fino (customers, payments).
    Sandbox por padrão a menos que `ASAAS_ENV=production` seja setado
    explicitamente.
  - `billing.service.ts`: `chargeInvoice()` cria (ou reaproveita, via
    `Client.asaasCustomerId`) um customer na Asaas e uma cobrança
    `billingType: UNDEFINED` (o cliente escolhe Boleto ou Pix na própria
    página da Asaas) pra uma Invoice, gravando
    `asaasPaymentId`/`asaasInvoiceUrl`. `handleWebhookEvent()` marca a
    Invoice como "paga" em `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`,
    idempotente, ignora eventos que não reconhece em vez de dar erro.
  - `billing-webhook.controller.ts`: terceira rota `@Public()` do sistema
    (a Asaas chama isso sem sessão nenhuma) — autenticada comparando o
    header `asaas-access-token` (que a Asaas ecoa de volta) contra
    `ASAAS_WEBHOOK_AUTH_TOKEN`.
  - Achado testando de verdade: `chargeInvoice()` checava o estado da
    fatura (vencimento, já cobrada) antes de checar se a Asaas estava
    configurada — corrigido pra falhar primeiro na configuração ausente.
  - Web: `/projects/:id` ganhou o botão "Cobrar (Boleto/Pix)" e o
    formulário de criar fatura ganhou um campo de vencimento que não
    existia antes (sem ele, toda fatura criada pela tela nasceria
    impossível de cobrar).
  - Build limpo, reinício, e testado de verdade em cada etapa (não só
    typecheck): caminho "não configurado", rejeição de webhook com token
    errado (401), fluxo completo de webhook de pagamento (`asaasPaymentId`
    setado direto via Prisma no lugar do que `chargeInvoice()` teria
    gravado, POST de verdade no endpoint do webhook) confirmando que a
    Invoice vira "paga", `paidAt` é setado, e reenviar o mesmo evento não
    faz nada (idempotente). 106/106 no smoke test. Cliquei em "Cobrar" de
    verdade no navegador e confirmei que o erro esperado aparece pelo
    tratamento padrão (não customizado) de erro de Server Action do
    Next.js, igual toda outra ação da tela.
  - **Com uma chave sandbox real (obtida depois), `createCustomer` e
    `createPayment` também foram exercitados contra a API de verdade da
    Asaas** — não só os caminhos de erro. `chargeInvoice()` criou um
    customer real (`cus_...`) e uma cobrança real (`pay_...`, status
    `PENDING`, `billingType: UNDEFINED`) com `invoiceUrl`/`bankSlipUrl`
    hospedados de verdade em `sandbox.asaas.com`; a resposta batia campo a
    campo com o que a documentação prometia. Confirmado no banco:
    `Invoice.asaasPaymentId`/`asaasInvoiceUrl` e
    `Client.asaasCustomerId` gravados certos, e tentar cobrar a mesma
    fatura de novo rejeitou com `INVOICE_ALREADY_CHARGED` (não duplicou a
    cobrança). Reuso do customer cacheado (segunda fatura do mesmo
    cliente não deveria criar um segundo customer na Asaas) não foi
    reverificado contra a API de verdade — a lógica é um `if` trivial
    (`return client.asaasCustomerId se já existir`), correta por
    inspeção, mas a chamada real esbarrou em ordem de aprovação de gate
    de um projeto de teste sem relação com a integração em si; não valeu
    a pena forçar.

Com isso, a Fase 2 está tecnicamente completa: os dois bloqueios que
existiam (senha do certificado de teste, escolha de fornecedor de
Boleto/Pix) foram resolvidos. O que resta depende só de decisão/dado de
negócio da Giulia — não de código: (a) confirmação da consultoria
contábil sobre o código de tributação nacional real de arquitetura,
município/endereço/inscrição municipal, antes de qualquer emissão de
NFS-e de produção; (b) migração formal MEI→ME quando ela de fato
acontecer (o simulador de Fator R já está pronto pra esse momento).

## Fase 3 — FF&E

Escopo **menor** do que o plano original assumia, por dois motivos
confirmados na descoberta: sem migração da Canoa, e sem construir um
scraper do zero (o Captura já existe e funciona para 18 lojas). O núcleo
de API já está pronto — o que sobra é mais estreito do que o roadmap
original previa:

- **Implementado, API e UI**: catálogo (`Product`, com suporte a
  placeholder genérico — `/products`), especificação por ambiente
  (`Area` → `ProductSpecification` com quantidade/preço/markup —
  `/projects/:id/ffe`), e o carrinho/checkout — `POST
  /projects/:id/ffe-checkout` marca os itens aprovados e gera a fatura de
  FF&E automaticamente (recusa itens sem preço definido). A UI ficou para
  trás do resto da Fase 1 por um bom tempo — o backend já existia de uma
  sessão anterior, mas não tinha nenhuma tela até agora. Achado testando
  de verdade no navegador (não só typecheck): o componente do carrinho
  não reselecionava itens automaticamente depois que um Server Action
  adicionava uma nova especificação sem recarregar a página — o
  `useState` de seleção só inicializa uma vez no mount, e o componente
  nunca remonta nesse fluxo. Corrigido com o padrão do próprio React para
  resetar estado quando uma prop muda (ajustar durante o render, não
  `useEffect`).
- **Integração com o Captura — decidida, implementada e em produção**
  (opção 1 das três em `especificacao-tecnica.md`: a extensão passa a
  enviar os itens capturados para a plataforma, em vez de reimplementar a
  extração no backend). Duas metades, em dois repositórios diferentes:
  - **Nesta plataforma**: autenticação por chave de API, porque a extensão
    roda no navegador do colaborador e não tem como forjar o JWT interno
    de curta duração que só `apps/web` sabe assinar (ver `AuthGuard`). O
    `AuthGuard` global agora aceita `X-Api-Key` como alternativa ao Bearer
    interno — resolve direto para `User`/`Account` sem passar pelo fluxo
    de sessão. `User.apiKeyHash` guarda só o sha-256 da chave (Node
    `crypto`, sem dependência nova); a chave em texto puro só existe na
    resposta de `POST /v1/users/:id/api-key`, nunca mais depois disso —
    regenerar sobrescreve o hash e invalida a anterior implicitamente.
    Gerenciamento (gerar/regenerar/remover, chave exibida uma única vez)
    tem UI em `/team`, por colaborador. `ProductsService.createProduct`
    agora faz upsert por `sourceUrl` (quando presente) em vez de sempre
    criar — achado testando o fluxo de verdade: reenviar o mesmo
    orçamento da extensão duplicava o `Product` no catálogo a cada envio.
    Sem esse identificador (cadastro manual pela própria plataforma)
    sempre cria novo, porque não há como saber se é "o mesmo" produto.
    Comportamento coberto por 7 casos novos no smoke test (5 de chave de
    API, 2 do upsert por `sourceUrl`).
  - **No repositório da extensão** (`Malakacrazy/Captura`) — **três PRs
    merged em `main`, confirmado funcionando pelo usuário num navegador
    real**: #4 (integração inicial), #5 (vincular a projeto/ambiente em
    vez de só o catálogo geral, e deduplicar `ProductSpecification` no
    reenvio) e #6, que corrige uma regressão real e um erro de design que
    só apareceram no teste ao vivo do #5 — entre o #5 e o #6, um commit
    de refatoração do próprio usuário no mesmo branch ("Add Studio Araci
    FF&E library & export features", que separou `library.js` em módulos
    `library-*.js`) sobrescreveu sem conflito o painel de projeto/ambiente
    que o #5 tinha acabado de adicionar, e o botão "☁ Enviar" voltou a
    chamar `sendProductsToPlatform` sem nenhum id de área — sempre
    reportando "0 produtos enviados" (com "sucesso", por um bug
    relacionado: o caminho de retorno antecipado tinha `failed: 0` mesmo
    carregando uma mensagem de erro). O #6 também corrigiu
    `fetchPlatformProjects`/`fetchPlatformAreas`, que engoliam qualquer
    falha (URL errada, chave expirada, API fora do ar) num `[]` silencioso
    — indistinguível de "a conta não tem projeto nenhum" na tela. E,
    a pedido do usuário depois de ver o #5 funcionando mas do jeito
    errado: a direção foi invertida — em vez de escolher um Ambiente já
    cadastrado na plataforma, `sendProductsToPlatform(products, projectId)`
    agora lê o campo "Ambiente" que cada produto já tem na extensão (texto
    livre, aceita múltiplos) e cria/reaproveita a Area correspondente
    nesse projeto automaticamente — produto com dois ambientes gera uma
    `ProductSpecification` em cada área; sem nenhum, cai num bucket
    "Geral". Verificado de ponta a ponta contra a API local de verdade
    (produto com dois ambientes + um sem ambiente, num projeto sem áreas
    ainda): 3 áreas criadas automaticamente, colocação correta em cada
    uma, exatamente 2 `Product` no catálogo (não 4), zero duplicata ao
    reenviar o mesmo lote.
- **Tear sheets, moodboards, modo de apresentação por link — implementado,
  API e UI**, modelados no schema (`Moodboard`, `MoodboardItem`,
  `PresentationLink`), depois deste documento ter sido escrito pela
  primeira vez: ficha técnica de produto em `/products/:id/tear-sheet`;
  pranchas (`v1/projects/:id/moodboards`, `v1/moodboards/:id/items`) com
  UI em `apps/web/src/components/moodboards`; apresentação ao cliente via
  link único e público (`v1/projects/:id/presentation-link` gera/revoga
  token, `GET v1/present/:token` não exige Authorization, aprovação/
  comentário por item também sem Authorization) com página pública em
  `/present/[token]`. Confirmado no schema público do link: o campo de
  preço (`unitPrice`) é ignorado silenciosamente se enviado por essa rota
  — não vira erro nem some o preço já gravado, mantendo o controle de
  visibilidade de preço do plano original. Gerar um novo link troca o
  token e revoga o anterior (404 imediato). Tudo coberto no smoke test.

## Fase 4 — Integrações avançadas, BI & mobile

Sem mudança de escopo identificada na descoberta. Gmail avançado,
exportação CAD/Revit, dashboards de BI, versão mobile para apontamento de
horas e aprovação de FF&E em campo — como no plano original.

- **Dashboard de BI — Visão executiva, implementado, API e UI**. Nenhum
  dos quatro itens desta fase tinha escopo definido (uma linha genérica
  no plano original) — Gmail avançado e visão executiva de BI são
  extensões diretas de padrões já implementados (Office/Google Workspace,
  agregação de dados já existentes), enquanto exportação CAD/Revit e a
  versão mobile exigem decisão técnica prévia (formato de exportação;
  stack mobile) antes de qualquer código, então ficaram de fora desta
  entrega. Giulia escolheu começar pela Visão executiva.
  - `GET /v1/bi/executivo` (`apps/api/src/bi/`) agrega três seções numa
    única chamada, scoped por `accountId` via `@SessionAccount()`:
    **pipeline** (Opportunity por estágio do kanban — mesmo vocabulário
    de `opportunities-board.tsx` — com taxa de conversão ganho/resolvidas,
    `null` em vez de 0% quando não há nada resolvido ainda, pra não
    sugerir uma taxa que não existe); **faturamento** (Invoice por status:
    pendente/emitida/paga, quantidade e valor); e **orçado × realizado
    por projeto**.
  - **Achado ao construir**: "realizado" nunca tinha sido implementado de
    verdade em lugar nenhum do sistema (a Fase 1 dizia "orçado ×
    realizado" na tela de projeto, mas essa tela só mostra o orçado —
    corrigido acima). Implementado agora como
    `TimeEntry.hours × User.costPerHour`, reaproveitando o mesmo padrão
    já usado em `/team/planning` pra custo projetado de `Allocation`
    (`apps/web/src/lib/allocations.ts`), só trocando horas planejadas por
    horas de fato lançadas no timesheet. Verificado contra dado real: os
    únicos `TimeEntry` existentes hoje pertencem a usuários sem
    `costPerHour` cadastrado, então o realizado aparece como R$0 em todo
    lugar agora — não é bug (confirmado consultando o banco direto), é
    reflexo de nenhum colaborador ter esse campo preenchido ainda; a
    lógica ignora custo desconhecido em vez de tratá-lo como zero, que
    subestimaria o realizado assim que alguém preencher `costPerHour`.
  - UI em `/dashboard` (`apps/web/src/app/(dashboard)/dashboard/`), link
    novo na navegação. Barras de progresso simples em CSS (sem lib de
    gráfico nova — o resto do app não usa nenhuma). Verificado no
    navegador contra a API local de verdade e coberto por 5 casos novos
    no smoke test (110/111 no total — a 1 falha é a mesma pré-existente e
    não relacionada, `ASAAS_API_KEY` configurada no `.env` de dev quebra
    a premissa de um teste que espera a Asaas "não configurada").
  - **Feedback da Giulia depois de ver a primeira versão**: "dashboard
    está subdesenvolvido". Especificado o que faltava (KPIs de topo, não
    as três seções de detalhe) e adicionada uma quarta seção, `kpis`, no
    mesmo `GET /v1/bi/executivo` (sem query nova — reaproveita os mesmos
    dados já buscados pra pipeline/faturamento/projetos): **pipeline em
    aberto** (soma de `estimatedValue` de oportunidades ainda não
    resolvidas), **projetos ativos** (`status === 'ativo'`), **a receber**
    (Invoice pendente + emitida) e **recebido este mês** (Invoice paga
    com `paidAt` no mês corrente). UI em 4 cards no topo da página, antes
    das três seções de detalhe. Coberto por 3 casos novos no smoke test
    (114/115 no total, mesma 1 falha pré-existente de sempre) e
    confirmado no navegador com dado real (pipeline em aberto R$22.000,
    3 projetos ativos, R$18.020 a receber, R$902,98 recebido no mês —
    esse último batendo com o pagamento via webhook do próprio run do
    smoke test).
  - **Duas views novas depois de pedido explícito** ("adicionar
    capacidade/FF&E"), cada uma sua própria página em `/dashboard/*` com
    abas pra alternar entre as três (`DashboardTabs`), e seu próprio
    endpoint no mesmo `BiService`:
    - `GET /v1/bi/capacidade`: por pessoa, capacidade semanal
      (`User.weeklyCapacityHours`) × carga **atual** (soma de
      `hoursPerWeek` das `Allocation` ativas hoje — diferente do pico
      histórico via sweep-line que `/team/planning` usa, que mistura
      sobrecarga passada e futura; pra "como está a equipe agora" o
      corte por hoje é mais direto de explicar) e horas de fato apontadas
      nos últimos 7/30 dias (mesma janela rolante de `/team`, duplicada
      aqui porque `apps/api` não depende de `apps/web`, mesmo motivo do
      ADR 0002).
    - `GET /v1/bi/ffe`: valor aprovado × pendente por projeto (mesma
      fórmula de linha do checkout real —
      `quantity × unitPrice × (1 + markupPercent)`, reaplicada, não
      reinventada), top 5 produtos mais especificados, markup médio, e
      contagem de especificações ainda sem preço.
    - **Achado no smoke test**: a primeira versão do teste de
      "produtos mais especificados" checava se o produto criado no
      próprio run aparecia no top 5 — falhou de forma intermitente,
      porque `POST /products` nesse fluxo sempre cria um produto novo
      (sem `sourceUrl`, sem upsert), então depois de muitos runs
      acumulados na mesma conta de dev vários produtos empatam em
      quantidade 1, e qual deles entra no corte de 5 é arbitrário — não
      um bug. Corrigido testando a forma da resposta (≤5 itens, ordem
      decrescente) em vez de depender de qual produto especificamente
      ganha o empate.
    - Ambas verificadas no navegador com dado real e cobertas por 5 casos
      novos no smoke test (120/121 no total, confirmado estável em duas
      execuções seguidas — mesma 1 falha pré-existente de sempre).
  - **Tendência dos últimos 6 meses, adicionada em seguida**: até aqui a
    visão executiva era só foto do agora, sem direção/momento. Nova
    seção `tendencia` em `GET /v1/bi/executivo` (mês corrente incluso,
    sem query nova) com recebido por mês (`Invoice.paidAt`) e
    oportunidades ganhas por mês (`Opportunity.wonAt`) — as duas métricas
    de tendência mais diretas com o dado que já existe (`Invoice` não
    tem `createdAt` próprio, só `dueDate`/`issuedAt`/`paidAt`, então
    "faturas geradas por mês" não dava pra fazer sem ambiguidade;
    ficou fora por decisão, não esquecimento). Gráfico de barras verticais
    em CSS na UI, mesmo padrão sem lib nova do resto do dashboard.
    Coberto por 2 casos novos no smoke test (122/123 no total) e
    confirmado no navegador: mês corrente (ago/2026) mostrando R$903 e 3
    oportunidades ganhas, meses anteriores corretamente zerados (sem
    dado histórico ainda).
- **Gmail avançado — vínculo de e-mail a Project/Client, implementado,
  API e UI**. Terceiro provider do `OfficeLink` (`DRIVE`/`CALENDAR` já
  existiam), reaproveitando 100% da infraestrutura já construída: o
  backend nem precisou de mudança de lógica, só `GMAIL` a mais no enum
  `OfficeLinkProvider` (migração `20260824180000_...`) — `provider` já
  era validado genericamente contra o enum, sem `if` por provider em
  lugar nenhum do `OfficeLinksService`.
  - Mesmo padrão do Calendar (não do Drive): sem Picker — a Picker API
    do Google não cobre Gmail nem Calendar, só Drive/Docs/Fotos. Escopo
    mínimo `gmail.readonly`, token avulso via Google Identity Services
    (não passa pelo login do NextAuth, mesmo fluxo de autorização
    incremental já usado para Drive/Calendar).
  - **Achado**: `users.messages.list` da Gmail API só devolve
    `{id, threadId}`, sem assunto nem link pronto (diferente da Calendar
    API, que já devolve `htmlLink`/`summary` na listagem) — precisou de
    um `GET` por mensagem (`format=metadata&metadataHeaders=Subject`,
    até 10 mensagens, mesmo limite do Calendar) pra montar título/link. O
    link permanente usa `threadId`, não `id` da mensagem — a Gmail API
    não expõe uma URL pronta como a Calendar API.
  - **Atenção regulatória real, não só técnica**: `gmail.readonly` é
    classificado pelo Google como escopo **restrito** (não só
    "sensível", como `calendar.events.readonly`) — sair do modo de teste
    (até 100 usuários de teste) exige uma avaliação de segurança CASA
    antes de qualquer conta Google real fora da allowlist poder usar.
    Não bloqueia o uso interno do estúdio agora, mas é uma etapa a mais
    antes de considerar isso pronto pra qualquer usuário externo.
  - Verificado: build (`api` + `web`) limpo, typecheck limpo, 2 casos
    novos no smoke test (`POST .../office-links` com `provider: GMAIL`,
    contagem de 3 vínculos), botão "Vincular do Gmail" confirmado
    renderizando corretamente no navegador ao lado de Drive/Calendar. O
    fluxo de autorização OAuth em si (popup do Google, consentimento
    real) não foi clicado de ponta a ponta — exigiria uma conta Google
    real do estúdio, que só a Giulia pode autorizar.

## Auditoria da plataforma e Fase 1 da correção (permissões + histórico)

Depois de rodar toda a Fase 4 até aqui, foi feita uma auditoria completa
dos 15 módulos existentes contra o padrão do mercado (Houzz Pro,
DesignFiles), com nota 1–10 por módulo e um plano de correção em 3 fases.
Achado estrutural mais importante: **não existia permissão nenhuma** —
todo login autenticado enxergava e editava tudo, inclusive financeiro e
custo/hora de qualquer pessoa — e **nenhum dos três registros centrais**
(Client, Project, Opportunity) tinha histórico ou nota alguma. A Fase 1
da correção resolve os dois:

- **`User.accessLevel` (admin | staff) — implementado, com enforcement
  de verdade**. Antes deste campo, `role` (usado pra exibição/tarifa,
  tipo "Arquiteto Sênior") não tinha relação nenhuma com permissão — o
  bootstrap de login (`AuthService.ensureAccountAndUser`) dava
  `role: 'admin'` pra QUALQUER conta nova, sem checagem em lugar nenhum
  do código. Corrigido: quem cria a conta pela primeira vez nasce admin;
  todo mundo depois nasce staff e precisa ser promovido.
  - `@AdminOnly()` (mesmo padrão do `@Public()` já existente, checado no
    mesmo `AuthGuard` global) bloqueia com `403 FORBIDDEN`, pra staff:
    `Financeiro`/`Fiscal` (`/v1/account`, `/v1/fiscal/*`), `Invoices` e a
    cobrança Asaas, `RoleRates`, e o `DELETE` de Client/Project/
    Opportunity. `costPerHour` some da resposta de `/v1/users` pra quem
    não é admin (removido na borda HTTP, não no service — `BiService`
    continua lendo o campo direto via Prisma pro cálculo de realizado,
    sem passar pelo controller).
  - **Achado real ao aplicar isso**: duas páginas (`/opportunities/:id`,
    que busca `role-rates` sem tratar erro nenhum; `/projects/:id`, que
    buscava `invoices` no mesmo `Promise.all` do resto) teriam devolvido
    500 pra qualquer staff assim que essas rotas viraram admin-only.
    Corrigido tratando o 403 explicitamente em cada uma (o resto da
    página carrega normal, só a seção afetada mostra aviso de permissão)
    — nenhuma página deveria nunca quebrar por causa de uma permissão
    que a própria plataforma impôs.
  - Endpoint novo, `GET /v1/me` — só ecoa o que o `AuthGuard` já resolve
    por requisição (accountId/userId/email/accessLevel), sem query nova.
    Existe porque a navegação (esconder "Financeiro"/"Tarifas" pra staff)
    e a tela de Equipe (saber se quem está vendo é admin) precisavam
    saber o accessLevel de quem está logado sem depender de uma rota
    admin-only, que bloquearia justamente quem não é admin.
  - Tela de Equipe ganhou um seletor Admin/Staff por pessoa, visível só
    pra admin, com a própria linha do admin logado desabilitada — não dá
    pra se autorrebaixar sem querer. Confirmado no navegador com sessão
    real (Giulia): a linha dela mesma vem desabilitada, as outras não.
  - Verificado: build (api+web) e typecheck limpos, 14 casos novos no
    smoke test cobrindo `/me` como admin e como staff, 403 em cada
    superfície gateada, confirmação de que o cliente/projeto principal
    sobrevive a uma tentativa de delete como staff, redação de
    `costPerHour` nos dois sentidos, e que staff tentando se
    autopromover/setar o próprio custo-hora é silenciosamente ignorado
    (200, sem erro, mas sem efeito) em vez de vazar a possibilidade via
    erro de validação.
- **`Activity` (notas) em Project/Client/Opportunity — implementado, API
  e UI**. Mesmo padrão polimórfico do `OfficeLink` (accountId +
  entityType + entityId, sem FK direta pro alvo, escopo validado na
  service layer) — só que pra texto livre com autor e timestamp, não pra
  um link externo. Um componente único (`ActivityTimeline`) reaproveitado
  nas três páginas de detalhe, cada uma só passando seu próprio
  entityType/entityId. Reenviar remover é restrito a quem escreveu a
  nota (comparado por e-mail, mesmo padrão já usado no `OfficeLinksSection`
  pra decidir quem vê o botão "Remover").
  - Verificado: build+typecheck limpos, 4 casos novos no smoke test
    (criar, listar com autor correto, remover, confirmar que sumiu), e
    testado de ponta a ponta no navegador com sessão real — nota criada,
    renderizada com autor/timestamp corretos, removida.

- **Notificações por e-mail via Resend — implementado e verificado com
  envio real**. Chave de API gerada pela Giulia (não algo que se cria em
  nome de terceiro) — já com um domínio verificado no painel
  (`updates.studioaraci.com.br`, sending habilitado), confirmado direto
  na API da Resend antes de usar, não suposto.
  - Primeiro gatilho real: `PublicPresentationService.updateSpecification`
    (achado da auditoria — nada avisava a equipe quando um cliente de
    fato aprovava algo pelo link de apresentação) notifica todo admin da
    conta por e-mail só na transição pra aprovado (`clientApproved`
    false→true), não a cada re-salvamento. Nunca deixa uma falha de
    e-mail derrubar a aprovação em si, que já foi persistida antes —
    loga e segue.
  - **Cuidado real, não só técnico**: o domínio é de verdade e os admins
    são pessoas de verdade (Giulia + a conta de dev) — antes de qualquer
    envio, perguntado e confirmado explicitamente com a Giulia, mesmo
    padrão de pausa usada antes da emissão real de NFS-e em Produção.
    Envio de teste real disparado só depois dessa confirmação, aceito
    pela Resend (retornou um id de mensagem real).
  - **Decisão deliberada sobre o smoke test**: o fluxo de aprovação via
    link já testado no smoke suite reaproveita a mesma especificação já
    aprovada antes pelo checkout do carrinho FF&E — a re-aprovação não
    cruza a transição false→true, então não dispara e-mail. Nenhum novo
    caso de teste foi escrito pra exercitar a transição de verdade, de
    propósito: isso mandaria um e-mail real pro admin em toda execução
    do smoke test (já rodado dezenas de vezes nesta sessão), o que seria
    spam real pra uma pessoa real. Cobertura desse gatilho específico
    fica por verificação manual (feita acima), não automatizada — mesma
    postura já usada pra fluxos que tocam sistemas externos reais demais
    pra automatizar com segurança (OAuth do Google, emissão de NFS-e).

- **Login de cliente por magic link (`/portal/*`) — implementado e
  verificado de ponta a ponta no navegador**. Último achado da auditoria
  (cliente não tinha acesso nenhum, dependia inteiramente do link de
  apresentação avulso mandado por e-mail/WhatsApp) fechado sem inventar
  autenticação nova: mesmo padrão já validado pelo `PresentationLink` —
  token opaco gerado por `randomUUID()` e guardado no banco (`ClientMagicLink`,
  `ClientSession`), nunca um JWT decodificado no apps/web. O apps/web só
  repassa o token pro apps/api, que é o único verificador — a família
  `v1/client-portal/*` virou o quarto grupo de rotas `@Public()`
  (autorização própria na service layer, não pelo `AuthGuard` global).
  - Fluxo: cliente informa e-mail em `/portal/login` → resposta genérica
    sempre igual, exista ou não o e-mail (`request-link`, sem enumeração)
    → link de 15 minutos, uso único → `/portal/verify?token=...` troca
    por uma sessão de 7 dias → `/portal` lista todos os projetos do
    cliente num dashboard só, cada um com link de apresentação gerado sob
    demanda se ainda não existir.
  - **`Client.email` não tem constraint de unicidade no schema** — achado
    real, não hipotético, ao escrever o teste do magic link: duas linhas
    de Client podem compartilhar o mesmo e-mail, e o login busca por
    e-mail (`findFirst`), então qual cliente loga fica não-determinístico
    nesse caso. Estúdio único hoje torna isso improvável na prática, mas
    é uma lacuna de verdade — registrada aqui, não corrigida agora
    (adicionar a constraint é decisão de produto: o que fazer com
    e-mails duplicados já existentes antes de migrar).
  - **Quatro bugs reais achados rodando o fluxo de verdade** (não em
    revisão de código):
    1. Teste do magic link buscava o link por e-mail em vez de por
       `clientId` — colidia direto com o problema de unicidade acima
       contra o próprio cliente fixo de outra verificação (Asaas) que já
       usa o mesmo e-mail de teste. Corrigido usando e-mail único por
       execução e busca por `clientId`.
    2. `listPortalProjects` gera o link de apresentação sob demanda como
       efeito colateral — rodando cedo demais no smoke suite, isso
       poluía um teste depois que esperava explicitamente "ainda não foi
       gerado". Corrigido só pela ordem: bloco do portal movido pra
       depois do bloco que testa geração de link.
    3. `components/portal/actions.ts` é um arquivo `"use server"` que
       exportava uma constante (`SESSION_COOKIE`) ao lado das server
       actions — Next.js só permite exportar funções assíncronas desse
       tipo de arquivo. Só apareceu como erro de runtime no navegador,
       não no `tsc --noEmit`. Corrigido movendo a constante pro
       `lib/portalApi.ts` (módulo comum, não uma server action).
    4. `/portal/verify` tentava setar o cookie de sessão durante o render
       de uma Server Component page — Next.js só permite isso em Server
       Action ou Route Handler. Corrigido convertendo de `page.tsx` pra
       `route.ts` (redirect com `Set-Cookie`, sem nenhuma página
       renderizada nesse passo).
    5. `logoutPortal` chamava `cookies().delete(SESSION_COOKIE)` sem
       `path` — como o cookie foi setado com `path: "/portal"`, o delete
       (que por padrão usa `path: "/"`) virava um cookie diferente pro
       navegador e não removia nada. Só apareceu testando logout de
       verdade no navegador (voltar pra `/portal` depois de "sair" ainda
       mostrava a sessão ativa). Corrigido passando o mesmo `path` no
       delete.
  - Verificado: build+typecheck limpos (api e web), 11 casos novos no
    smoke test (link genérico com e-mail existente/inexistente sem
    enumeração, persistência no banco, troca por sessão, uso único, 401
    sem header/com token inválido, projetos do cliente certo com link
    gerado sob demanda), e o fluxo completo testado de ponta a ponta no
    navegador com o cliente fixo real (Fernanda Ribeiro): pedir link,
    localizar o token no banco (sem inbox real disponível), verificar,
    ver o dashboard com o projeto, abrir a apresentação, sair — e
    confirmar que sair de fato invalida o acesso (`/portal` depois de
    sair volta pro login).

- **Sino de notificações in-app na Nav — implementado**. As notificações
  até aqui só existiam por e-mail (`NotificationsService`/Resend) — quem
  não estivesse de olho na caixa de entrada não tinha como saber que um
  cliente aprovou algo. Novo modelo `Notification` (uma linha por
  destinatário, não por conta — cada admin marca a sua como lida
  independente das outras); `projectId` fica solto em vez de um par
  entityType/entityId polimórfico como `Activity`/`OfficeLink` porque só
  existe um gatilho hoje (aprovação de especificação) e ele sempre aponta
  pra um Project — generalizar antes de existir um segundo tipo de alvo
  seria abstração sem uso real.
  - `notifySpecificationApproved` agora grava a notificação de cada admin
    no mesmo `try/catch` que já envolvia o envio do e-mail — uma falha em
    qualquer um dos dois nunca derruba a aprovação em si, mesma postura
    de sempre.
  - `GET /v1/notifications` (últimas 20 + contagem de não lidas),
    `PATCH /v1/notifications/:id/read`, `POST /v1/notifications/read-all`
    — todos escopados por `accountId` + `userId` da sessão (nunca por ID
    isolado, mesmo princípio já usado em `deleteActivity`).
  - Sem infra de tempo real (websocket/SSE): o sino (`NotificationBell`,
    client component) faz poll a cada 30s chamando uma server action, o
    mesmo padrão de "mutação sempre por server action, nunca fetch direto
    do navegador contra o proxy BFF" já usado no resto do apps/web — não
    dava pra resolver isso com um Server Component comum porque abrir/
    fechar o dropdown e atualizar o contador em intervalo exige estado no
    cliente.
  - **Achado real ao testar no navegador**: o smoke suite original desta
    sessão evita de propósito cruzar a transição `clientApproved`
    false→true pra não mandar e-mail real repetido pro admin a cada
    execução (ver seção de notificações acima). Testar o sino pelo
    gatilho de verdade reabriria exatamente esse problema, já que os dois
    ficam no mesmo bloco de código. Os 6 casos novos no smoke test
    inserem a `Notification` direto via prisma (mesmo espírito de "achar
    o token no banco em vez de ler o inbox" já usado no teste do magic
    link) e testam só o CRUD/escopo do sino — listar, isolamento entre
    usuários, marcar uma como lida, marcar todas — ortogonal a como a
    notificação nasce.
  - Verificado: build+typecheck limpos (api e web), 6 casos novos no
    smoke test, e testado de ponta a ponta no navegador com a conta real
    da Giulia — notificação inserida direto no banco, sino mostra o
    badge "1", dropdown lista título/corpo/hora, clique navega pro
    projeto certo e marca como lida (confirmado sobrevivendo a um reload
    completo da página, não só otimista no cliente).

Com isso fecham as quatro peças da Fase 1 do plano de correção
(permissões, histórico, notificações, login de cliente). Capacidade/FF&E
das outras duas views do dashboard e o resto do plano de 3 fases ficam
registrados no artifact da auditoria, não duplicados aqui.

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
