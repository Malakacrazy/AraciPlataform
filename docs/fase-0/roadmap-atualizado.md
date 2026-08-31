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
- Calibrar os números da planilha de precificação (custos fixos reais do
  estúdio, horas base reais por papel/estágio) — hoje são placeholders.
  A ferramenta pra isso já existe (`/role-rates`, ver correção "Custos
  fixos e salários" abaixo); falta só a Giulia digitar os valores reais.

**Resolvido:**
- ~~Montar a equipe (ou decidir modelo: CLT/PJ, software house,
  freelancers)~~ — decidido: modelo misto, usa os três (CLT, PJ e
  agência), não um único.
- ~~Obter o certificado A1 do estúdio~~ — certificado real obtido e
  configurado (`NFSE_CERTIFICATE_PATH`/`_PASSWORD`/`_CPFCNPJ`/`_UF` no
  `.env` de dev), verificado direto do arquivo `.pfx`
  (`readCertificateInfo`, sem depender do que o `.env` afirma): CNPJ
  53554180000110, titular Giulia Pessanha Parente, válido 24/08/2026 a
  24/08/2027, batendo com `NFSE_CERTIFICATE_CPFCNPJ`. NFS-e de teste
  contra a Homologação da SEFIN já emitida com sucesso com este
  certificado (`POST /v1/fiscal/nfse/emitir-teste`, 24/08/2026) --
  confirmado direto no retorno salvo em `os.tmpdir()/araci-nfse/retorno/`
  (`sucesso: true`, `statusHttp: 200`, `cStat: "107"` = autorizada,
  `nNFSe: "94"`), não só no que a API respondeu na hora. Boleto/Pix (Asaas) segue resolvido
  separadamente desde a Fase 2 original.

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

Com isso, os dois bloqueios que existiam (senha do certificado de teste,
escolha de fornecedor de Boleto/Pix) foram resolvidos.

> **Atualização de 30 ago 2026** (ver `../auditoria-2026-08-30.md`). Este
> parágrafo afirmava que a Fase 2 estava "tecnicamente completa" e que o
> que restava não era código. Estava errado: a emissão existia só como
> endpoint de teste, sem nenhum caminho da `Invoice` até a DPS. Vale
> registrar o erro porque é fácil de repetir — uma emissão autorizada em
> Homologação foi lida como "integração pronta", quando o que ela prova é
> que certificado, assinatura e webservice funcionam.
>
> **Construído depois, e hoje existe de verdade:**
> `POST /v1/invoices/:id/nfse` → `NfseService.emitirParaFatura`, com DPS
> montada a partir da fatura real, guarda de idempotência *antes* da chamada
> à SEFIN, `@unique` em `Invoice.nfseChaveAcesso`, rejeição persistida em
> `nfseRejectionReason`, gate de ambiente por `Account.nfseAmbiente`
> (admin-only, com fallback seguro para homologação — não por variável de
> ambiente), cancelamento, substituição e arquivamento do XML no Drive.
>
> **Defeitos que a auditoria encontrou nesse caminho** — nenhum invalida a
> emissão simples; todos afetam os fluxos em volta dela:
>
> - Emitir sobre fatura **já paga** regride o status para `emitida` e apaga
>   a receita realizada dos números do BI (`nfse.service.ts:245`).
> - ~~A substituição deriva o `nDPS` de `Date.now()`, abandonando a
>   idempotência de reenvio que o comentário na mesma classe documenta como
>   invariante.~~ **Corrigido em 31 ago 2026** — semeado de `chaveAntiga`
>   em vez de `Date.now()`, re-verificado contra a Homologação real da
>   SEFIN Nacional (ver seção "Correção — revisão de código externa" mais
>   abaixo).
> - A substituição não atualiza `nfseNumber`: a tela segue exibindo a chave
>   da nota substituída (cancelada).
> - A substituição usa o ambiente **atual** da conta em vez do ambiente onde
>   a nota substituída vive (`nfse.service.ts:388`).
> - Nota emitida em homologação é registrada como emissão real e apaga o
>   sinal de "falta emitir NFS-e".
> - Resposta perdida depois da autorização deixa a fatura irreconciliável:
>   não há caminho de consulta, e o arquivamento no Drive roda *entre* a
>   autorização e o `update`.
> - Certificado e CNPJ do emissor são globais de processo, nunca derivados
>   da `Account` da fatura.

Continuam valendo as duas dependências de negócio: (a) confirmação da
consultoria contábil sobre o código de tributação nacional real de
arquitetura, município/endereço/inscrição municipal, antes de qualquer
emissão de NFS-e de produção; (b) migração formal MEI→ME quando ela de fato
acontecer (o simulador de Fator R já está pronto pra esse momento, e
enquanto o estúdio for MEI o código em uso é `170201`/Datilografia, porque
arquitetura não pode ser emitida como MEI).

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
    é uma lacuna de verdade — registrada aqui na época, depois fechada
    (achado A-05 da auditoria externa, mesma lacuna) na rodada "Correção —
    os 5 achados 'Altos' da mesma auditoria externa" mais abaixo: sem
    duplicata real no banco checado antes de migrar, então a constraint
    entrou sem precisar de decisão de produto nenhuma sobre e-mails
    duplicados existentes.
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

## Log de auditoria (quem mudou o quê, o que foi aprovado)

Pedido explícito depois do Fase 1: um jeito de ver quem mudou o quê e o
que foi aprovado, além dos e-mails/sino pontuais. Diferente de Activity
(nota em texto livre escrita por um humano) e de Notification (alerta
pontual), aqui o alvo é sistemático — toda escrita de negócio, não só os
poucos pontos onde alguém lembrou de chamar algo explicitamente.

- **Decisão de escopo, perguntada antes de construir**: cobrir só os
  "momentos de aprovação" já existentes (specs aprovadas, gates de fase,
  status de fatura) seria bem mais barato, mas foi escolhido
  explicitamente o caminho mais amplo — todo create/update/delete em todo
  model de negócio, com diff de campo. Isso muda a arquitetura: não dá
  pra fazer com uma chamada manual em cada service (dezenas de call
  sites, que ficariam pra trás conforme o app cresce) — precisa ser uma
  extensão do Prisma Client, que intercepta a escrita no nível do driver,
  sozinha, pra qualquer model.
- **`AuditLog` (novo model)**: uma linha por escrita real (não por
  requisição) — accountId, actorType (user | client | system), actorId +
  actorEmail (denormalizado no momento da escrita, sobrevive mesmo se o
  User/Client for removido depois), action (create/update/delete),
  entityType (nome do model Prisma), entityId, entityLabel (Project.name/
  Client.name/... só pros models com um campo de exibição óbvio) e
  changes (JSON `{campo: {from, to}}`, só dos campos que de fato mudaram
  — `updatedAt` fica de fora, todo update muda isso, não é uma "mudança"
  que importa pra quem lê o log).
- **`audit/prisma-audit-extension.ts`**: registrada em `PrismaService`
  (`prisma.$extends(...)`), intercepta `create`/`update`/`upsert`/
  `delete`/`updateMany`/`deleteMany` em todo model, exceto uma lista
  pequena de exclusão — `AuditLog` (senão a própria escrita do log se
  auditaria, recursão infinita), `Notification`, `ClientMagicLink`,
  `ClientSession`, `PresentationLink` (pura plumbing de sessão/token, sem
  valor de auditoria, alto volume de churn). Lê o estado de antes (via um
  client SEM a extensão, capturado por closure, pra não reentrar nela
  mesma) antes da escrita de verdade acontecer, e o de depois logo em
  seguida, e grava só os campos que mudaram — usa o DMMF do schema (não
  uma heurística sobre o formato do valor) pra saber quais campos são
  escalares (inclusive Decimal/Json) e quais são relação incluída via
  `include`, que não deveriam entrar no diff.
  - `createMany` fica de fora de propósito: Prisma não devolve as linhas
    criadas (só `{count}`), e o único uso real hoje
    (`Notification.createMany`) já está na lista de exclusão de qualquer
    jeito.
  - `updateMany`/`deleteMany` (ex.: aprovar o carrinho inteiro do FF&E de
    uma vez, ou o cleanup de OfficeLink ao deletar um Client) geram UMA
    entrada de log POR LINHA afetada, não uma entrada opaca "N linhas" —
    é o que faz "o que foi aprovado" ficar de fato legível (cada
    especificação aprovada aparece com seu próprio antes/depois).
- **Quem é o ator, propagado sem passar parâmetro por toda a cadeia**: um
  middleware global (`audit-context.ts`, registrado em `main.ts` antes de
  qualquer guard) cria um `AsyncLocalStorage` vazio por requisição;
  `AuthGuard` o preenche assim que resolve a sessão (mesmo lugar nos dois
  caminhos, chave de API e Bearer JWT). Os dois pontos que mutam dado de
  negócio sem passar pelo AuthGuard preenchem na mão: `PublicPresentationService`
  (cliente aprovando pelo link — vira actorType `client`, com o e-mail do
  Client dono do projeto) e `BillingService` (webhook da Asaas confirmando
  pagamento — vira actorType `system`, e como Invoice não tem accountId
  próprio, precisou buscar via `project.accountId` explicitamente, senão o
  log perderia o vínculo de conta).
  - **Bootstrap resolvido sem caso especial feio**: o create do primeiro
    Account/User do sistema acontece ANTES do AuthGuard saber quem é —
    nesse instante o ator cai no default `system`, e o accountId é
    resolvido olhando pro próprio registro sendo criado (o novo User já
    tem `accountId` como campo próprio; o novo Account usa o próprio id).
- **Verificado com dados reais, não só teoricamente**: essa é a parte que
  mais importava dar certo — extensão do Prisma rodando por baixo de
  `$transaction([...])` em array (delete de Client que também limpa
  OfficeLink numa mesma transação) é exatamente o tipo de composição que
  poderia sair sutilmente errada. Rodado o smoke suite inteiro (159 casos)
  e inspecionado o `AuditLog` resultante linha a linha: delete em cascata
  dentro de transação capturado corretamente pros dois lados, upsert de
  RoleRate como create na primeira vez, checkout de carrinho FF&E gerando
  uma entrada por especificação aprovada, aprovação via link público
  atribuída ao cliente certo, webhook da Asaas atribuído a `system` com o
  accountId certo, e Decimal (hourlyRate, amount) serializado como string
  em vez de quebrar ou virar `[object Object]`.
  - **Achado real de teste, não de produto**: a primeira versão do teste
    "GET /audit-log como staff → 403" reusava a identidade `staffToken` já
    promovida a admin por um teste anterior no mesmo script — passou 200
    em vez de 403 não por falha do `@AdminOnly()`, mas porque
    `AuthGuard` relê o accessLevel atual do banco a cada requisição, e
    aquela identidade específica já não era mais staff quando o teste
    rodou. Corrigido usando uma segunda identidade staff nunca tocada.
- **`GET /v1/audit-log`** (admin-only, mesmo padrão de Financeiro/
  Tarifas) — filtros por entityType/entityId/action, paginado (50 por
  página). Página nova `/log` no dashboard: filtro por entidade/ação,
  diffs de update aparecem direto na linha, snapshots de create/delete
  ficam atrás de um `<details>` (evita parede de texto pra um registro
  com 10 campos), link pra página de detalhe de quem tem uma (Project/
  Client/Opportunity/Product/User→Equipe/RoleRate→Tarifas) — o resto
  (Invoice, ProjectPhase, ProductSpecification, ...) mostra só o texto,
  sem link, por não ter URL própria.

## Fase 2 (correção) — Assinatura de proposta via ZapSign

Primeiro item começado da Fase 2 do plano de correção da auditoria
("Per-module depth"): Proposals tinha o motor de precificação mais
sofisticado da categoria envolto num status flag -- "assinada" era só
alguém da equipe clicando um botão no próprio painel, sem o cliente ter
feito nada (achado da auditoria: "a click is not a signature").

- **Decisão real tomada em duas etapas, não uma.** A primeira versão
  construída aqui foi uma assinatura própria (digitar o nome completo +
  IP capturado + timestamp, hospedada num link `/proposal/[token]` nosso,
  mesmo modelo do link de apresentação). Antes de finalizar, a Giulia
  perguntou diretamente: "não é melhor usar o ZapSign?" -- pergunta certa.
  Pra um contrato de serviço com valor real, um nome digitado não é de
  fato mais forte que o clique que a própria auditoria já tinha apontado
  como insuficiente. A primeira versão foi descartada por
  completo (nunca chegou a ser commitada) e substituída pela integração
  de verdade abaixo -- decisão registrada aqui porque é exatamente o tipo
  de "simples vs. certo" que vale documentar o porquê, não só o resultado.
- **`zapsign-client.ts`**: cliente HTTP fino, mesmo formato do
  `asaas-client.ts` (token estático no header `Authorization: Bearer`) --
  mas diferente da Asaas, sandbox e produção da ZapSign são **domínios**
  diferentes (`sandbox.api.zapsign.com.br` vs. `api.zapsign.com.br`), não
  a mesma URL com token diferente. `ZAPSIGN_ENV` decide qual par
  domínio/token usar, mesmo espírito do `ASAAS_ENV`.
  - Documento é criado via `markdown_text` (a ZapSign converte sozinha
    pra um documento assinável), não um PDF gerado por nós -- evita
    precisar de uma lib de PDF só pra isso.
  - **Achado real testando no sandbox de verdade**: markdown com sintaxe
    de tabela (`| col | col |`) não renderiza como tabela no conversor da
    ZapSign -- imprime os caracteres `|` literalmente. Trocado por uma
    lista (`- **Etapa** — Xh — R$ Y`), suportada por praticamente
    qualquer conversor markdown, sem esse risco.
- **`Proposal.zapsignDocToken`/`zapsignSignUrl`**: a página de assinatura
  em si é hospedada pela própria ZapSign (`sign_url`, devolvido na
  criação) -- a plataforma nunca hospeda essa UI. `zapsignDocToken`
  correlaciona o webhook de volta pro registro certo.
- **`version`/`previousVersionId`** (mesma Fase 1→2, adicionado junto):
  recalcular uma proposta pra mesma Opportunity sempre criava uma
  proposta nova solta (stages não são editáveis depois de criadas), mas
  não havia relação nenhuma entre elas. Agora incrementa version e liga
  `previousVersionId`; a versão anterior ainda `draft`/`sent` vira
  `expired` automaticamente na mesma transação (não faz sentido duas
  versões abertas pro cliente assinar ao mesmo tempo) -- uma já `signed`
  nunca é tocada, pode ser um aditivo que convive com o contrato aceito.
- **Fluxo**: `POST /proposals/:id/send-for-signature` (só numa `draft`)
  cria o documento na ZapSign de verdade e marca `status: 'sent'` só se a
  chamada funcionar -- nunca um status solto sem link nenhum por trás. O
  `PATCH /proposals/:id` que antes aceitava qualquer status foi reduzido
  pra só `status: 'expired'` (abandonar manualmente); `sent` e `signed`
  não têm mais caminho manual nenhum.
- **`ZapSignWebhookController`** (`v1/zapsign/webhook`, quinta rota
  `@Public()` do sistema): a ZapSign não assina os webhooks como a
  Asaas ecoa `asaas-access-token` -- o header `zapsign-webhook-token` é
  um segredo que **nós** escolhemos e configuramos no painel deles na
  hora de cadastrar o endpoint, mesma função, origem diferente. Só
  reage a `doc_signed`, idempotente (reenviar o mesmo evento não
  sobrescreve `signerName`), atribui o log de auditoria ao ator `client`
  certo (não ao default `system`) via `setAuditActor`.
- **Verificado com a API real da ZapSign, não só a estrutura do
  código**: chave sandbox de verdade fornecida pela Giulia (tokens de
  sandbox e produção, guardados em `.env`, nunca ecoados de volta no
  chat). `POST /send-for-signature` disparado de verdade contra o
  sandbox pela UI, documento aberto no navegador em
  `sandbox.app.zapsign.com.br` (confirmado: nome do cliente, valor,
  etapas contratadas, banner "Ambiente de Sandbox sem validade
  jurídica"). Webhook coberto no smoke suite pelo mesmo padrão já usado
  pra Asaas: não dispara a criação real do documento a cada execução
  (custo/efeito colateral num serviço externo a cada run), mas fixa via
  Prisma o que `sendForSignature()` teria gravado e testa o handler do
  webhook de verdade -- header errado (401), evento processado (200,
  `status` vira `signed`), reenvio idempotente, e a validação
  `PROPOSAL_NOT_SENDABLE` (que não toca a API externa, testável sem
  restrição). Resíduo de teste (as duas versões extras criadas na
  oportunidade fixa mantida entre sessões) limpo manualmente depois.

## Fase 2 (correção) — Financeiro: despesas e P&L real

Segundo item da Fase 2. Verbatim da auditoria: "Knows everything about
money coming in. Has never heard of money going out" -- Financeiro/BI só
sabiam somar Invoice (dinheiro entrando); nenhum lugar da plataforma
sabia o que o estúdio gastava pra entregar um projeto ou manter a
estrutura, então nenhum número que o dashboard mostrava era lucro, só
receita.

- **`Expense` (novo model)**: espelha `Invoice` de propósito (mesmo
  vocabulário pendente/paga, mesmo padrão de `dueDate`/`paidAt`), mas mais
  simples -- só dois status, não três, porque não existe um equivalente
  de "emitida" (NFS-e) do lado de quem paga. `projectId` é opcional: com
  projeto é custo externo real de entregar aquele projeto (subcontratado,
  material fornecido); sem projeto é estrutura do estúdio (aluguel,
  assinatura de software) -- os dois formatos que a própria auditoria
  citou. `category` é string livre, mesmo padrão de `RoleRate.role`/
  `Client.source` (o roster real de categorias vai variar, não vale
  travar num enum). Diferente de Invoice, tem `DELETE` -- é lançamento
  manual interno (mais fácil errar digitando), não um fato fiscal
  consumado.
- **`ExpensesController`** (`v1/expenses`, admin-only, mesmo padrão de
  `InvoicesController`): list (com filtro opcional por `projectId`), get,
  create, PATCH de status, delete.
- **`BiService` estendido, não substituído** -- `orcado`/`realizado`
  (planejamento: orçamento de fase × custo de mão de obra interna via
  `TimeEntry × User.costPerHour`) continuam exatamente como estavam,
  porque respondem uma pergunta diferente e válida ("estamos gastando
  mais horas do que orçamos"). Os campos novos (`recebido`/`despesas`/
  `margem`) são adicionados ao lado, não uma substituição -- resolvem "o
  que sobrou de caixa de verdade", que orçado/realizado nunca respondia.
  Os dois lados da margem só contam o que já é caixa de fato
  (`status: 'paga'` em Invoice e em Expense) -- comprometido/pendente não
  entra, pra ser uma margem real, não uma projeção otimista.
  - `kpis`: `pagoEsteMes` (mesma janela de mês corrente que
    `recebidoEsteMes` já usava) e `margemEsteMes = recebidoEsteMes -
    pagoEsteMes`.
  - `despesas`: array por status (pendente/paga), espelha `faturamento`.
  - `projetos`: `recebido` (soma de Invoice paga do projeto), `despesas`
    (soma de Expense paga do projeto), `margem = recebido - realizado -
    despesas` -- a resposta direta a "o que ficou de verdade neste
    projeto", contando o custo de mão de obra interna e a saída de caixa
    externa juntos.
  - `tendencia`: `despesas`/`margem` por mês, mesmo recorte de 6 meses já
    usado pra `recebido`.
- **Web**: nova seção "Despesas" em `/financeiro` (listar, registrar,
  marcar paga, remover) -- mesma tela que já tinha regime tributário e
  Fator R, não uma página nova. `/dashboard`: dois novos KPIs (Pago este
  mês, Margem este mês), tendência de 6 meses ganhou despesa/margem por
  mês, nova seção "Despesas" ao lado de "Faturamento", e a tabela
  "Orçado × realizado por projeto" virou "Financeiro por projeto" com
  três colunas novas (Recebido/Despesas/Margem) -- mantendo
  orçado/realizado intactos ao lado, não substituindo.
- **Achado real de infraestrutura de teste, não do produto**: o
  `FOREIGN KEY` de `Expense.projectId` usa `ON DELETE SET NULL` (correto
  -- apagar um projeto não deveria apagar o histórico de despesa, só
  soltar o vínculo). Isso significa que o script de limpeza de resíduo do
  smoke suite (`cleanup-smoke-residue.ts`), que apaga os projetos
  descartáveis de cada execução, NÃO apagava as despesas ligadas a
  eles -- elas só perdiam o `projectId` e sobreviviam pra sempre como
  "despesa geral" órfã, mesmo padrão de acúmulo silencioso já visto com
  produtos duplicados antes nesta sessão. Corrigido apagando Expense por
  `projectId` (antes do projeto) e por descrição fixa conhecida do teste
  (sem ambiguidade aqui, diferente do caso de produtos: nenhuma fixture
  real usa essas descrições) dentro do próprio `cleanup-smoke-residue.ts`.
- Verificado: build+typecheck limpos (api e web), 12 casos novos no
  smoke suite (CRUD de Expense, filtro por projeto, os campos novos do
  BI com a matemática conferida por igualdade, staff bloqueado com 403),
  e testado de ponta a ponta no navegador -- despesa registrada num
  projeto real pela UI, marcada como paga, e conferido que tanto
  `/financeiro` quanto `/dashboard` (KPIs, tendência, seção Despesas,
  tabela por projeto) refletem o número certo (margem do projeto = R$
  902,98 recebido − R$ 500 de despesa paga = R$ 402,98, batendo com o
  que a tela mostrou).

## Fase 2 (correção) — Lista de tarefas do projeto

Terceiro item da Fase 2. Verbatim da auditoria: "Wire the existing Task
model into a real task list with assignment and dependencies" -- o model
`Task` existia desde a migração inicial (`20260808012136_init`), com
`assigneeId` como coluna solta sem FK, e zero controller, zero service,
zero tela em qualquer lugar da plataforma (confirmado por grep antes de
começar). Dead code desde o dia zero.

- **`Task` (model reescrito)**: `assigneeId` virou relação de verdade
  (`assignee User? @relation(...)`, `ON DELETE SET NULL`) -- antes disso
  era só uma string sem nenhuma garantia de integridade. Campos novos:
  `order` (ordenação dentro da fase, calculado no create via `count`, sem
  endpoint de reordenar/drag-drop -- não pedido), `completedAt`
  (efeito colateral de uma transição de status, nunca input direto, mesmo
  padrão de `Invoice.paidAt`/`ProjectPhase.approvedAt`), `createdAt`, e
  uma relação m:n auto-referente implícita `dependsOn`/`blocks` (uma
  tarefa pode depender de outras, de qualquer fase do mesmo projeto, não
  só da fase anterior).
- **Migração gerada, não escrita à mão** -- diferente de toda migração
  anterior desta sessão, usei `prisma migrate dev --create-only` aqui
  porque a convenção de nomes/colunas que o Prisma usa pra uma m:n
  implícita auto-referente (tabela `_TaskDependency`, colunas `"A"`/`"B"`,
  PK composta, índice em `B`, `ON DELETE CASCADE` nas duas FKs) é fácil de
  errar de cabeça e difícil de notar errada só lendo o schema depois. O
  diff gerado também trouxe uma divergência real mas não relacionada (um
  `AuditLog_accountId_fkey` escrito à mão nesta sessão como `RESTRICT`,
  enquanto o schema já implicava `SET NULL` pra aquela relação opcional)
  -- removida do arquivo de migração antes de aplicar, pra não misturar
  uma correção não pedida dentro da migração de Task.
- **Regras de negócio aplicadas no servidor, não só na tela**:
  - Detecção de ciclo (BFS por `dependsOn` a partir de cada candidato) --
    tentar criar uma dependência que fecharia um ciclo (a tarefa nunca
    poderia ser concluída) devolve `422 TASK_DEPENDENCY_CYCLE`.
  - Bloqueio por dependência -- uma tarefa só pode virar `concluida` se
    todo `dependsOn` dela já estiver `concluida`; `422 TASK_BLOCKED` caso
    contrário. Checado só em `POST /tasks/:id/status` (rota dedicada,
    separada do PATCH estrutural), mesmo padrão já usado em
    `ProjectPhase.../approve`.
- **Web**: nova seção "Tarefas" na página do projeto, agrupada por fase
  (mesma organização que o Cronograma já usa) -- criar tarefa por fase
  (título, responsável, prazo, multi-select de dependências cobrindo
  *todo* o projeto, não só a fase atual, já que uma tarefa de fase
  posterior pode depender de algo de uma fase anterior), Iniciar/Concluir
  (desabilitado com tooltip quando bloqueada) e Remover.
- Verificado: build+typecheck limpos (api e web), 11 casos novos no
  smoke suite (404 de assignee/dependência inexistente, ciclo, bloqueio,
  conclusão bem-sucedida após desbloqueio, ordenação do
  `GET /projects/:id/tasks`, delete), e testado de ponta a ponta no
  navegador no projeto real: criei uma tarefa em Captação/Alinhamento,
  criei uma segunda em Briefing dependendo da primeira, confirmei o texto
  "bloqueada por" e o botão Concluir desabilitado, iniciei e concluí a
  primeira, confirmei que a segunda desbloqueou, concluí a segunda,
  testei Remover. Um clique via `ref` da árvore de acessibilidade não
  registrou silenciosamente no meio do fluxo (falha conhecida desta
  sessão) -- percebido só porque cada passo foi confirmado por query
  direta no Postgres, não só pela tela; refeito por coordenada e seguiu
  normalmente.

## Fase 2 (correção) — Timesheet → Invoice (faturar por hora apontada)

Quarto item da Fase 2. Verbatim da auditoria: "Approved hours flow into
an invoice line for hora_técnica projects instead of a hand-typed
amount" -- pra um estúdio que fatura por hora técnica, a hora apontada e
aprovada no Timesheet nunca chegava na fatura: o valor de "Faturar"
continuava sendo um número digitado à mão na tela, sem nenhum vínculo com
o que o Timesheet dizia ter sido trabalhado.

- **`InvoiceLine` (novo model)**: uma linha por papel com horas apontadas
  no estágio, com `hours`/`hourlyRate`/`amount` -- mesma ideia de
  `ProposalStage` (uma linha por estágio dentro de uma Proposal), só que
  aqui o agrupamento é por papel porque é isso que `RoleRate` precifica.
  Fatura com valor digitado à mão (outros feeModel, ou o carrinho de
  FF&E) continua sem nenhuma linha -- `Invoice.lines` fica `[]`.
- **`InvoicesService.createInvoiceForPhase` bifurca por `Project.feeModel`**:
  pra `hora_tecnica`, `amount` no corpo da requisição vira erro
  (`422 AMOUNT_NOT_ALLOWED`) -- o valor é sempre calculado a partir de
  `TimeEntry` aprovada e faturável (`billable: true`, `approvedAt` setado)
  daquele estágio, agrupada por `User.role` e precificada pela `RoleRate`
  atual de cada papel (mesmo motor de tarifa/papel que `Proposal` usa em
  `pricing.ts`, com hora de verdade em vez de hora estimada). Papel com
  hora apontada mas sem `RoleRate` cadastrada falha alto
  (`422 ROLE_RATE_MISSING`) em vez de inventar uma tarifa ou faturar de
  graça. Estágio sem nenhuma hora aprovada ainda: `422 NO_APPROVED_HOURS`.
  Para os demais feeModel, o fluxo de valor digitado continua idêntico ao
  que já existia.
- **Uma fatura por estágio virou regra da API, não só da tela**: antes
  disso, nada no backend impedia criar uma segunda fatura pro mesmo
  estágio -- só a tela escondia o botão "Faturar" depois da primeira.
  Faturamento automático por hora precisa desse invariante de verdade
  (senão a mesma `TimeEntry` aprovada poderia ser contada em duas
  faturas), então virou `422 PHASE_ALREADY_INVOICED` no
  `InvoicesService`, valendo pra todo feeModel, não só hora_técnica.
- **`RoleRatesService` mudou de módulo** (`CrmModule` → `ErpModule`):
  `InvoicesService` (ERP) precisa dela pra calcular a fatura por hora, mas
  o limite de módulos do projeto (`especificacao-tecnica.md`, "Limites dos
  módulos") proíbe um módulo consultar a tabela de outro módulo direto via
  Prisma -- só através de um Service exportado do módulo dono. Como
  `CrmModule` já importa `ErpModule` (não o contrário), mover
  `RoleRatesService`/`RoleRatesController` pra `ErpModule` resolve sem
  precisar de import circular (`forwardRef`, nunca usado neste código
  antes) -- `ProposalsService` (CRM) passou a injetar `RoleRatesService`
  de volta, no lugar de consultar `RoleRate` direto como fazia antes. A
  rota HTTP (`v1/role-rates`) não muda, só o módulo Nest que a declara.
- **Achado real de infraestrutura de teste**: `InvoiceLine → Invoice` usa
  `RESTRICT` (sem cascade declarado, mesma convenção de `ProposalStage →
  Proposal`) -- sem apagar as linhas primeiro, `cleanup-smoke-residue.ts`
  falharia com `P2003` ao tentar apagar qualquer fatura hora_técnica
  calculada automaticamente. Corrigido apagando `InvoiceLine` antes de
  `Invoice` no script.
- **Achado real, não corrigido (decisão de escopo)**: `RoleRate` é dado de
  referência da conta inteira (tarifa por papel), não por projeto -- o
  smoke suite descobriu, ao testar `ROLE_RATE_MISSING`, que ele mesmo
  contamina esse dado entre execuções (o papel de precificação do usuário
  de teste é sempre `'admin'`, o mesmo `role` que os dois usuários admin
  reais desta conta têm de verdade — `auth.service.ts` marca o primeiro
  usuário de cada conta como `role: 'admin'`). Diferente do resíduo de
  Expense (Fase 2, item anterior), isso não é seguro de limpar
  automaticamente: apagar a `RoleRate` de `'admin'` no cleanup apagaria
  uma tarifa que pode se tornar dado real de faturamento pra um admin de
  verdade. O smoke suite passou a resetar essa `RoleRate` explicitamente
  antes de provar o caminho de erro (pré-condição do teste, não limpeza de
  resíduo) -- mas a tarifa de R$80/h que ele cadastra depois disso
  permanece na conta real entre execuções, mesmo padrão já valendo pra
  "Arquiteto Líder (RT)" desde a Fase 2 anterior (Financeiro). Fica
  registrado como comportamento conhecido, não como bug corrigido.
- Verificado: build+typecheck limpos (api e web), Nest reinicia sem erro
  de DI depois da mudança de módulo do RoleRatesService, 9 casos novos no
  smoke suite (sem hora nenhuma, hora não aprovada ainda não conta, amount
  rejeitado pra hora_técnica, papel sem tarifa falha alto, sucesso com
  valor e InvoiceLine corretos, não fatura o mesmo estágio duas vezes), e
  testado de ponta a ponta no navegador no projeto real: aprovei o gate de
  Criação de Conceito, apontei e aprovei 5h faturáveis pelo Timesheet,
  cliquei "Faturar horas apontadas" (sem nenhum campo de valor na tela,
  diferente do "Faturar" de sempre) e confirmei a fatura de R$ 400,00 com
  a linha "admin — 5h × R$ 80,00" no Financeiro do projeto. Resíduo da
  verificação (fatura, linha, apontamento, e o gate que aprovei só pra
  testar) removido depois, restaurando o projeto ao estado exato de antes.

## Fase 2 (correção) — FF&E: variantes, galeria de fotos e orçamento por categoria

Quinto item da Fase 2. Verbatim da auditoria: "Multi-image products with
variants; budget-by-category rollup within a project" -- o catálogo tinha
uma foto por produto, nenhum jeito de representar "mesmo sofá, acabamento
diferente" a não ser cadastrando produtos soltos sem ligação nenhuma
entre si, e o orçamento de FF&E de um projeto só somava um total único,
sem quebra por tipo de item (mobiliário × iluminação × tecidos).

- **Variante = outro `Product` apontando pro "pai" via `variantOfId`**
  (`variantOf`/`variantLabel`/`variants`), não um model separado. Decisão
  tomada explicitamente com a Giulia antes de codar: a alternativa
  (`Product` virar só "família", com um `ProductVariant` novo carregando
  preço/dimensão/acabamento) seria mais correta no papel, mas obrigaria
  trocar a FK de `ProductSpecification`, `MoodboardItem` e do endpoint que
  o Captura usa pra tudo que já existe. Como uma variante É plenamente
  especificável (tem seu próprio preço/dimensão/prazo), tratá-la como só
  mais um `Product` significa que especificação, moodboard, Captura e o
  "mais especificados" do BI continuam funcionando sem nenhuma mudança --
  só ganham mais linhas no catálogo.
- **Só um nível de variante**, checado em `ProductsService` (FK sozinha
  não expressa isso): variante de variante, ou um produto que já é pai
  virando variante de outro, os dois batem em `422 INVALID_VARIANT`.
  `variantLabel` é obrigatório junto de `variantOfId` -- sem rótulo, duas
  variantes do mesmo pai ficariam indistinguíveis na tela.
- **`ProductImage` (novo model)**: galeria de fotos extras, `POST
  /products/:id/images` + `DELETE /product-images/:id` (mesmo padrão de
  `MoodboardItem`/`MoodboardItemsController`). `imageUrl` continua sendo a
  capa -- é o campo que a extensão Captura já manda, e ela fica fora
  deste repo pra atualizar em conjunto, então não podia ser renomeado nem
  virar obrigatoriamente múltiplo.
- **`Product.category`** (string livre, mesmo padrão de
  `RoleRate.role`/`Expense.category`) alimenta um rollup por categoria na
  tela de FF&E do projeto (aprovado × pendente por categoria) -- calculado
  no próprio componente da página a partir das especificações que a tela
  já buscava, sem endpoint novo.
- **`RoleRatesService` mudou de módulo na correção anterior desta fase
  (Timesheet → Invoice)** -- não relacionado a este item, só registrando
  que o padrão de mover um service pra resolver direção de import já tem
  precedente nesta sessão.
- **Achado real de arquitetura de módulo, resolvido nesta correção
  também**: nenhum -- diferente do item anterior, este não exigiu mexer em
  nenhum outro módulo, `Product`/`ProductImage` já pertenciam a
  `FfeModule` e continuam lá.
- Verificado: build+typecheck limpos (api e web), Nest reinicia sem erro
  depois da migração, 18 casos novos no smoke suite (variantLabel
  obrigatório, pai inexistente, sucesso, os dois jeitos de tentar aninhar
  dois níveis, `.variants`/`.variantOf` no GET, galeria adiciona/remove,
  `product.category` chega na especificação), e testado de ponta a ponta
  no navegador no catálogo real: criei uma variante de "Mesa de Jantar
  Carvalho" pela tela (apareceu indentada com "↳" sob o produto pai),
  adicionei e removi uma foto extra na ficha técnica da variante, e no
  FF&E do projeto real especifiquei o produto com categoria "mobiliario"
  e confirmei uma linha nova no rollup (R$ 12.400,00 pendente) separada
  do "Sem categoria" já existente. Resíduo da verificação removido
  depois.

## Fase 2 (correção) — Opportunities: motivo de perda, captação web-to-lead, lembrete de lead parada

Sexto item da Fase 2, o último da lista original de dez. Verbatim da
auditoria: "Lost-reason tracking, a web-to-lead capture form, follow-up
reminders for a stalled lead" -- um lead marcado "perdido" desaparecia
sem registrar por quê, todo lead entrava digitado à mão por alguém da
equipe, e nada avisava quando uma oportunidade ficava parada.

- **Motivo de perda virou endpoint dedicado**: `POST
  .../mark-lost { lostReason }`, não mais `PATCH` genérico com `lostAt`
  solto -- mesmo padrão de `approvalChannel` em `ProjectPhase` (exigência
  impossível de contornar por acidente). Bloqueia marcar como perdida uma
  oportunidade já ganha (`422 OPPORTUNITY_ALREADY_WON`). `lostReason` é
  string livre com opções comuns sugeridas na tela (Preço, Escolheu outro
  escritório, Projeto cancelado, Não retornou contato, Fora do escopo,
  Outro), mesmo espírito de `Client.source`.
- **Captação web-to-lead**: `POST /v1/leads`, 6ª família de rota
  `@Public()` (ver `public.decorator.ts`, comentário atualizado) -- a
  primeira rota pública de ESCRITA sem token nenhum; mitigada por ser
  write-only (resposta genérica, nenhum id devolvido) e pelo
  `ThrottlerGuard` global já existente, não por CAPTCHA (não existe essa
  infra no projeto). Cria `Client` (nunca tenta casar com um já existente
  por e-mail -- dedupe de contato é redline separado do módulo Clients,
  registrado à parte na auditoria) e `Opportunity` em `novo_lead` com
  `feeModel: hora_tecnica` fixo (um visitante anônimo não tem como saber
  que é o único modelo em uso real hoje). A mensagem do formulário vai
  pro novo campo `Opportunity.leadMessage`, não pra `Activity` -- ver
  achado de arquitetura abaixo. Página pública em `/lead`, sem `<Nav>`,
  mesmo padrão de `/portal/login`.
- **Lembrete de lead parada é o primeiro job em background da
  plataforma**: decisão tomada explicitamente com a Giulia antes de
  codar, entre um badge calculado na hora (zero infra nova) e um push de
  verdade -- optamos pelo push. `@nestjs/schedule` (dependência nova),
  `StalledOpportunitiesCron` roda todo dia às 8h, verifica toda
  oportunidade em aberto (`wonAt`/`lostAt` nulos) sem nenhuma `Activity`
  há 14+ dias (ou, sem nenhuma `Activity` nunca, 14+ dias desde a
  criação) e manda notificação real (sino + e-mail via Resend) pelo mesmo
  `NotificationsService` já usado pra "proposta assinada". Não reavisa
  todo dia enquanto a oportunidade continuar parada -- só quando não
  existe uma notificação desse tipo mais recente que a última interação
  (`NotificationsService.hasRecentNotification`), reabrindo sozinho se
  uma `Activity` nova acontecer depois.
- **Achado de arquitetura de módulo**: o cron precisa ler `Opportunity`
  (dono: `CrmModule`) e `Activity` (dono: `ActivitiesModule`) ao mesmo
  tempo. Como `ActivitiesModule` já importa `CrmModule` (não o contrário),
  colocar o cron dentro de `ActivitiesModule` foi o único jeito sem import
  circular -- mesma classe de restrição que já tinha movido
  `RoleRatesService` de módulo na correção de Timesheet→Invoice. Por essa
  mesma razão, a mensagem do lead vai num campo novo em `Opportunity`
  (`leadMessage`) em vez de virar uma `Activity`: `Activity.authorId` é
  FK obrigatória pra `User`, e um visitante anônimo não é nenhum `User` —
  criar a `Activity` a partir de `LeadsService` (dono: `CrmModule`)
  também esbarraria no mesmo limite de módulo pra alcançar
  `ActivitiesService`.
- **Achado real de infraestrutura de teste, dois bugs distintos no mesmo
  cleanup**: `cleanup-smoke-residue.ts` quebrou no meio da transação
  (`RESTRICT` em `Opportunity_clientId_fkey`) assim que o smoke suite
  passou a testar `mark-lost` -- o script derivava `doomedOppIds` só das
  oportunidades que viraram `Project` (`projects.map(p =>
  p.opportunityId)`); uma oportunidade marcada perdida nunca gera
  `Project`, então ficava órfã e travava o delete do cliente. Corrigido
  buscando TODA `Opportunity` dos clientes descartáveis, não só as
  convertidas. Segundo achado, descoberto só depois de corrigir o
  primeiro: o cliente criado pelo teste de `/v1/leads` usa um e-mail fixo
  igual em toda execução, mas `Client` não tem `@unique` em `email` —
  `findFirst` só limpava o cliente de UMA execução por vez, deixando os
  das execuções anteriores presos pra sempre; virou `findMany`.
- Verificado: build+typecheck limpos (api e web), `npm install
  @nestjs/schedule` + `ScheduleModule.forRoot()` sem quebrar o boot do
  Nest, 8 casos novos no smoke suite (PATCH genérico ignora lostAt,
  bloqueio de marcar perdida uma oportunidade ganha, motivo obrigatório,
  sucesso, lead sem e-mail rejeitado, lead público cria Client+Opportunity
  com a mensagem certa). O cron não tem rota nenhuma pra disparar sob
  demanda (é job de fundo, não ação de usuário) — verificado à parte por
  um script novo (`npm run verify-stalled-cron`) que sobe o container de
  DI do Nest direto (sem abrir a porta HTTP) e chama o método real duas
  vezes seguidas contra uma oportunidade forjada há 20 dias, confirmando
  a notificação na 1ª chamada e a ausência de duplicata na 2ª. Esse
  script roda via `ts-node`, não `tsx` como todo o resto de `scripts/` —
  achado real: a injeção de dependência do Nest depende de
  `emitDecoratorMetadata`, que o transform do `tsx` (esbuild) não emite
  direito; sob `tsx` os parâmetros do construtor chegavam `undefined`
  sem erro nenhum na inicialização, só estourando depois, ao tentar usar
  o serviço. Testado de ponta a ponta no navegador também: enviei um lead
  de verdade por `/lead` (sem sessão, aba anônima), confirmei o
  Client/Opportunity/leadMessage certos no banco e a mensagem aparecendo
  na tela da oportunidade, depois marquei essa mesma oportunidade como
  perdida pelo Pipeline com motivo "Preço" e confirmei o card migrando pra
  coluna Perdido com "Motivo: preco" visível. Resíduo da verificação
  removido depois.

## Fase 2 (correção) — Financeiro: NFS-e avisada pelo pagamento

Sétimo item da Fase 2. Verbatim da auditoria: "Tie NFS-e emission to
invoice payment instead of a manual trigger" -- o pedaço da Reforma
Tributária do mesmo item da auditoria (campos IBS/CBS calculados, não
digitados) fica de fora por enquanto, não foi pedido nesta rodada.

- **Decisão tomada explicitamente com a Giulia antes de codar, e é a mais
  importante desta correção**: o próprio código já tinha uma regra de
  segurança deliberada (`nfse-client.ts`) dizendo que emissão em Produção
  é sempre uma mudança de código, nunca uma variável de ambiente, "pra
  que uma env mal configurada não possa emitir uma NFS-e real
  silenciosamente" -- e a própria biblioteca usada (`@nfewizard/nfse`)
  avisa que a assinatura da DPS não está confirmada como segura pra
  Produção ainda. Não existe hoje nenhum construtor de DPS a partir de
  uma Invoice real (só um fictício, de teste) -- faria isso exigir dado
  fiscal (código de serviço, CNAE, alíquota de ISS, inscrição municipal)
  que não está confirmado em lugar nenhum do projeto. Diante disso,
  "atado ao pagamento" virou **avisar automaticamente, não emitir
  automaticamente** -- o humano continua emitindo pela tela, só não
  precisa mais lembrar de checar sozinho.
- **`BillingService.handleWebhookEvent`** (o mesmo webhook que já marca
  `Invoice.status = 'paga'` quando a Asaas confirma o pagamento) agora,
  logo depois de marcar como paga, checa se a fatura ainda não tem
  `nfseNumber` -- se não tiver, chama
  `NotificationsService.notifyNfseReady` (sino + e-mail pros admins,
  mesmo caminho já usado pra "proposta assinada"). Se a fatura já tinha
  NFS-e emitida antes de pagar (ordem tradicional: emite quando entrega o
  estágio, cliente paga depois), não há nada pendente pra avisar.
- **Achado real de UI, exposto só agora que faturas passam a virar
  `paga` sem nunca passar por `emitida`**: o formulário de "Marcar
  emitida" só aparecia pra fatura `pendente` -- uma fatura que a Asaas
  marca `paga` direto (pagamento chegou antes de alguém emitir a NFS-e,
  exatamente o caso que este item resolve) nunca tinha `status: 'emitida'`
  no meio do caminho, então ficava **sem nenhum jeito na tela de
  registrar o número da NFS-e depois**. Corrigido: `status` virou opcional
  em `invoiceStatusUpdateSchema` (registrar `nfseNumber` sem mandar
  `status` não muda o status atual, igual a qualquer outro campo opcional
  já tratado como "undefined não mexe" neste service); a tela agora
  também mostra o formulário pra fatura `paga` sem `nfseNumber`, com
  rótulo "Registrar NFS-e" (não regride pra `emitida`) em vez de "Marcar
  emitida".
- **Achado real de infraestrutura de teste**: rodando o smoke suite de
  novo depois de uma falha de rede transitória no meio de uma execução
  anterior, `cleanup-smoke-residue.ts` deixou 1 cliente "Fernanda Ribeiro"
  órfão -- o crash aconteceu depois de criar o `Client` mas antes de
  criar a `Opportunity`/`Project`, então esse cliente nunca aparecia na
  derivação de `doomedClientIds` (que só descobre cliente através de
  `Project.clientId` ou do e-mail fixo de lead). Corrigido com uma
  varredura adicional: qualquer "Fernanda Ribeiro" (fora a fixture
  mantida) sem nenhuma `Opportunity` vinculada também entra em
  `doomedClientIds`. Não é um bug introduzido por este item -- é uma
  fragilidade preexistente do script (só nunca tinha sido exposta, porque
  nenhuma execução anterior desta sessão tinha crashado no meio).
- Verificado: build+typecheck limpos (api e web), 3 casos novos no smoke
  suite (webhook numa fatura sem NFS-e gera `Notification` tipo
  `nfse_ready`, `PATCH` só com `nfseNumber` numa fatura `paga` não
  regride o status). Testado de ponta a ponta contra o projeto real: com
  o servidor local rodando, mandei uma chamada HTTP de verdade pro
  webhook (mesmo token real de `ASAAS_WEBHOOK_AUTH_TOKEN`, mesmo
  `asaasPaymentId` real de uma cobrança sandbox já criada em sessão
  anterior) confirmando o pagamento da fatura de R$ 3.000 do projeto
  mantido; vi a notificação aparecer no sino de verdade
  ("pagamento confirmado, falta emitir NFS-e") e o formulário "Registrar
  NFS-e" aparecer na tela no lugar de "Marcar emitida"; registrei
  NFSe-0002 pela tela e confirmei no banco que o status continuou `paga`
  (não voltou pra `emitida`). Fatura e notificações de verificação
  restauradas ao estado exato de antes depois.

## Fase 2 (correção) — Office Links: compor/enviar, criar evento, fundação de sincronização

Oitavo item da Fase 2, penúltimo da lista original de dez. Verbatim da
auditoria: "Compose/send through Gmail, create Calendar events from the
app, move from manual linking to webhook sync."

- **Compor e enviar pelo Gmail, criar evento no Calendar**: os dois
  encaixam na arquitetura já existente (token efêmero de navegador via
  Google Identity Services, nunca guardado -- ver `google-client.ts`),
  sem infraestrutura nova. `CALENDAR_SCOPE` virou `calendar.events`
  (antes só `.readonly`) pra cobrir listar/vincular E criar com um único
  escopo. Gmail ganhou um escopo separado, `GMAIL_SEND_SCOPE`
  (`gmail.send`) -- deliberadamente não reaproveita `GMAIL_SCOPE`
  (`gmail.readonly`, usado só pra listar/vincular): enviar de verdade é
  uma ação de mais confiança que só ler a caixa de entrada, e pedir os
  dois juntos toda vez violaria o "least-privilege" que já era a
  filosofia declarada deste módulo.
- **Decisão tomada explicitamente com a Giulia antes de codar, sobre a
  metade "webhook" do item**: esta plataforma nunca guardou nenhuma
  credencial Google (o login SSO nunca pede escopo de Drive/Calendar/
  Gmail, e o picker incremental usa o fluxo implícito do Google Identity
  Services, que por design nunca devolve refresh_token). Sincronização
  via webhook de verdade (`Calendar events.watch`, `Gmail users.watch`)
  exige refresh_token guardado por pessoa, e o `users.watch` do Gmail
  especificamente exige um tópico Google Cloud Pub/Sub -- infraestrutura
  fora deste repositório, que exigiria acesso ao console GCP da Giulia
  pra terminar. Diante disso, esta correção construiu só a **fundação**:
  um jeito de conectar e guardar a credencial com segurança, sem ainda
  chamar `watch()` nem receber nenhum callback do Google. O `events.watch`/
  `users.watch` de verdade, o endpoint de callback público, e o tópico
  Pub/Sub ficam registrados como próximo passo, não como parte desta
  correção.
- **`GoogleCredential` (novo model)**: refresh token por usuário, sempre
  criptografado em repouso (AES-256-GCM, `google-credential-crypto.ts`,
  chave de 32 bytes gerada localmente com `crypto.randomBytes`, mesmo
  padrão já usado pro segredo do webhook ZapSign) -- é o único segredo de
  longa duração guardado por esta plataforma que dá acesso a uma conta
  Google de verdade; todo outro token (sessão interna, link de
  apresentação, sessão de portal) é de vida curta.
- **Fluxo OAuth de autorização de código, separado do login SSO e do
  picker incremental**: `apps/web/api/google/authorize` (redireciona pro
  Google com `access_type=offline`+`prompt=consent`, únicos jeitos de
  garantir que um `refresh_token` volte) e `.../google/callback` (troca o
  code pelo token). A troca acontece em **apps/web**, não em apps/api --
  apps/api nunca é exposto ao navegador (só apps/web chama, via proxy
  interno), então não pode ser o destino de um redirect que o Google
  manda direto pro navegador da pessoa; `GOOGLE_CLIENT_ID/SECRET` já
  vivem em apps/web (mesmo par que o NextAuth usa pro login). Só o
  `refresh_token` resultante segue adiante pro apps/api
  (`POST /v1/office/google-credential`), que criptografa e persiste.
- **Self-service, não admin-only**: é a credencial Google da PRÓPRIA
  pessoa, não um dado do escritório -- `GoogleCredentialsController` não
  tem `:id` em rota nenhuma, sempre opera sobre `userId` da sessão, mesmo
  raciocínio de `POST /users/:id/api-key`. Painel novo em `/team`
  (`GoogleSyncPanel`, ao lado do `ApiKeyPanel` já existente), mostrado só
  na própria linha da pessoa logada, com "Conectar"/"Desconectar" --
  desconectar tenta revogar no Google (best-effort, não trava a remoção
  local se a Google não confirmar).
- Verificado: build+typecheck limpos (api e web), Nest reinicia sem erro
  depois da migração, 6 casos novos no smoke suite (conectar/consultar/
  desconectar a credencial, e confirmação de que o refresh token nunca é
  guardado em texto puro) -- todos com um refresh token fictício, já que
  não existe (nem deveria existir) nenhuma chamada real ao Google só pra
  rodar o smoke suite.
- **Fluxo de conectar, testado de ponta a ponta de verdade**: depois da
  Giulia registrar o redirect URI (`http://localhost:3000/api/google/
  callback`) no client OAuth real do Google Cloud Console, o botão
  "Conectar" em `/team` foi clicado de verdade -- passou pela tela de
  consentimento real do Google pra `giuliaparente@studioaraci.com.br`
  (pedindo exatamente os dois escopos certos), voltou em
  `/team?googleSyncConnected=1` com o banner de sucesso, e uma
  `GoogleCredential` de verdade ficou gravada no banco (confirmado lendo
  a linha direto via Prisma, não só a UI) com o refresh token só em forma
  cifrada.
- **Compor/enviar e criar evento, também testados com uma ação real
  (autorizado explicitamente pela Giulia)**: usando o contato fixture
  Fernanda Ribeiro (`fernanda@example.com`, domínio reservado pra teste
  -- RFC 2606, nunca entrega de verdade). Dois bugs reais apareceram só
  nesse teste ao vivo, nenhum dos dois pego por typecheck/build:
  - **Criar evento vinha com 400 da Calendar API**: o valor de um
    `<input type="datetime-local">` não tem segundos
    (`"2026-08-26T20:59"`), mas a Calendar API exige RFC3339 completo em
    `dateTime`. Corrigido em `google-client.ts` (`withSeconds`, completa
    `:00` quando faltam segundos).
  - **Assunto do e-mail chegava corrompido no Gmail** (`"integração"` →
    `"integraÃƒÂ§ÃƒÂ£o"`), mesmo com o corpo certo: cabeçalho de e-mail
    exige US-ASCII (RFC 2822), diferente do corpo, que já é lido pelo
    charset do `Content-Type`. Corrigido codificando o `Subject` como
    RFC 2047 encoded-word (`encodeMimeHeaderWord`) quando tem caractere
    fora de ASCII.
  - Depois dos dois fixes: evento real criado no Calendar da Giulia (200
    da API, confirmado) e e-mail real reenviado com o assunto chegando
    correto no Gmail (conferido no próprio Gmail, não só na nossa UI).
    Ambos os testes reais (e-mail com acentuação quebrada + evento antes
    do fix) foram apagados da conta de verdade da Giulia depois
    (Calendar e Gmail, via UI do próprio Google) e os `OfficeLink`
    correspondentes removidos do banco -- só a fundação de credencial
    (`GoogleCredential`) ficou conectada, por decisão da Giulia.
  - `Vincular do Drive/Calendar/Gmail` (o fluxo antigo de só linkar
    recurso existente) não foi re-testado ao vivo nesta rodada -- não foi
    tocado por nenhuma das duas correções acima, e já tinha sido
    verificado antes desta correção de Fase 2.

## Fase 2 (correção) — Dashboard: filtro de período, drill-through, export

Décimo e último item da lista original de dez. Verbatim da auditoria:
"Dashboard date-range filters/drill-through/export".

- **Filtro de período**: a visão executiva (`/dashboard`) tinha duas
  janelas de tempo fixas e diferentes -- KPIs de caixa sempre "este mês",
  tendência sempre "últimos 6 meses" -- nenhuma configurável. Unificadas
  numa granularidade só (mês, via `<input type="month">`, já que todo o
  resto da tela raciocina em mês, não em dia) e num filtro só
  (`from`/`to` em `GET /v1/bi/executivo`, default = últimos 6 meses,
  igual ao comportamento de antes de existir o filtro). Range invertido é
  trocado automaticamente; maior que 24 meses é limitado a 24 (evita uma
  tendência com décadas de barra por erro de digitação). KPIs viraram
  "recebido/pago/margem no período" (antes "este mês"); `pipelineEmAberto`,
  `projetosAtivos` e `aReceber` continuam foto de agora, não filtrados por
  período -- não fazem sentido recortados por data (é "quanto existe
  hoje", não "quanto aconteceu nesta janela"). Mesmo raciocínio aplicado a
  faturamento/despesas por status: só o bucket "paga" é recortado por
  `paidAt` no período; pendente/emitida são backlog em aberto agora. A
  tabela "Financeiro por projeto" ganhou o mesmo recorte pra
  recebido/despesas/realizado (realizado agora soma só `TimeEntry.date`
  dentro do período) -- `orcado` fica de fora, é escopo contratado fixo,
  não fluxo de caixa de uma janela.
- **Drill-through**: cada estágio do pipeline linka pro board de
  oportunidades já scrollado/ancorado nesse estágio
  (`/opportunities#stage-<estagio>`, `id` novo em cada coluna do
  `OpportunitiesBoard`); cada card de despesa por status linka pra
  `/financeiro?status=<status>`, que agora aceita esse filtro e mostra um
  indicador "Filtrando: X ×" pra limpar; cada linha da tabela "Financeiro
  por projeto" linka pro projeto (`/projects/:id`). Faturamento por status
  ficou sem drill-through: não existe hoje uma tela de listagem global de
  faturas (só por projeto, dentro de `/projects/:id`) -- criar uma só pra
  isso seria escopo bem maior que "adicionar drill-through ao dashboard
  existente", registrado aqui como lacuna consciente, não esquecimento.
- **Export**: botão "Exportar CSV" na tabela "Financeiro por projeto" --
  CSV client-side (sem lib nova, é só texto e número), com `;` como
  separador e vírgula decimal (não `,`/`.`) porque é o que o Excel em
  pt-BR espera abrir direto, e BOM UTF-8 pra acento não virar lixo no
  Windows. Nome do arquivo carrega o período selecionado.
- Verificado: build+typecheck limpos (api e web), smoke suite com 3 casos
  novos pro filtro de período (range de 1 mês ecoa `periodo` de volta e
  zera tendência pra 1 item; mês sem nenhum dado zera recebido/pago;
  ambos verificando que o filtro de fato exclui, não só aceita o
  parâmetro sem aplicar) -- 233 passaram, a mesma falha pré-existente e já
  documentada de `ASAAS_API_KEY` continua a única exceção. Testado no
  navegador: formulário de período com os defaults certos, os três
  drill-throughs (pipeline → âncora do board, despesa → `/financeiro`
  filtrado, projeto → `/projects/:id`) confirmados via `href` real e
  navegação de verdade. O clique em "Exportar CSV" não lançou erro e a
  lógica (Blob + object URL + `<a download>`, padrão de navegador comum,
  sem nada específico deste projeto) foi revisada por leitura de código,
  mas o arquivo em si não apareceu na pasta Downloads depois do clique --
  o Chrome controlado por automação nesta sessão parece bloquear download
  de verdade (sem barra de download visível, sem arquivo em disco), o que
  é uma restrição do ambiente de teste automatizado, não do código
  publicado: um clique de uma pessoa de verdade no próprio Chrome deve
  salvar o arquivo normalmente.

## Correção — Custos fixos e salários no motor de precificação

Não é um dos dez itens da auditoria original — é uma reclamação direta da
Giulia: "não dá pra calcular as tarifas sem poder colocar os custos e
salários de todo mundo", depois de enviar a planilha real de
precificação (`Base_Precificacao (fazer cópia).xlsx`) e a tela de
`/role-rates` só aceitar a tarifa/hora já pronta, digitada à mão.

- **Achado ao investigar**: a fórmula inteira da planilha (abas 01-06 —
  overhead, tarifa/hora, complexidade, configurador) já estava portada
  em código (`crm/pricing.ts`), testada (`pricing.spec.ts`) e, pras abas
  03-06 (horas base × estágio, complexidade, desconto de pacote), já
  ligada de ponta a ponta no construtor de proposta real
  (`ProposalBuilder` → `calcularProposta`). Só as abas 01+02 (custos
  fixos do estúdio, salário/encargos por papel → tarifa/hora) nunca
  tiveram UI nem persistência — `calcularTarifaHora`/
  `calcularOverheadPorHora` existiam mas não eram chamadas por nada,
  `RoleRate` só guardava a tarifa final. Daí a reclamação: a única forma
  de usar a tarifa era já ter feito essa conta em outro lugar.
- **Bug real encontrado no meio da investigação**: `calcularTarifaHora`
  tratava `payrollBurden` (Encargos) como valor absoluto somado ao
  salário (`grossSalary + payrollBurden`), mas a planilha formata essa
  coluna como percentual ("0.0%", não "-" como as colunas de moeda
  zeradas) — encargos trabalhistas no Brasil (INSS/FGTS/13º/férias) são
  sempre expressos como % do salário bruto, nunca um valor fixo em R$.
  Corrigido pra `grossSalary × (1 + payrollBurdenPercent)`, com um caso
  de teste novo que só passa com a fórmula certa (os testes antigos
  usavam encargos=0%, onde as duas fórmulas dão o mesmo resultado —
  por isso o bug nunca tinha aparecido).
- **`StudioFixedCost` (novo model)**: itens de custo fixo mensal
  (aluguel, software, contador...) por conta, mesmo espírito de
  `Expense` mas recorrente e sem status pago/pendente (é premissa de
  cálculo, não lançamento de caixa). A soma vira
  `totalMonthlyFixedCosts` em `calcularOverheadPorHora`.
- **`Account` ganhou os inputs compartilhados da fórmula** (um valor só
  por conta, não por papel): `pricingMarginPercent`,
  `pricingTaxBurdenPercent`, `pricingBusinessDaysPerMonth`,
  `pricingBillableHoursPerDay`, `pricingActiveStaffCount` — os três
  últimos multiplicados dão as horas faturáveis do ESTÚDIO (pra ratear o
  custo fixo), diferente das horas faturáveis por PAPEL (aba 02),
  conceitos que a planilha já mantém separados.
- **`RoleRate` ganhou três campos opcionais** (`grossSalary`,
  `payrollBurdenPercent`, `billableHoursPerMonth`), nulos juntos. Duas
  formas continuam válidas de definir uma tarifa: digitar `hourlyRate`
  direto (ex.: freelancer com valor já fechado) ou preencher os três
  campos de compensação, e o backend CALCULA `hourlyRate` (reaplicando
  `crm/pricing.ts`, não reimplementado) em vez de aceitar o valor
  enviado. Reenviar o mesmo papel no modo direto limpa os campos de
  compensação antigos, senão a UI mostraria "calculada" pra uma tarifa
  na verdade sobrescrita à mão.
- **UI em `/role-rates` reconstruída**: seção de custos fixos (lista +
  total), seção de capacidade/margem/impostos com prévia ao vivo de
  horas faturáveis do estúdio e overhead/hora, formulário de tarifa com
  alternância entre "calcular a partir de salário" (com prévia ao vivo
  da tarifa resultante, mesma fórmula duplicada em JS puro no cliente —
  apps/web não importa de apps/api, ADR 0002) e "digitar direto", e a
  tabela de tarifas agora mostra a origem de cada uma ("Calculada
  (salário R$X, encargos Y%)" vs. "Digitada direto").
- Verificado: build+typecheck limpos (api e web), suite de pricing.ts
  com 12 casos (11 antigos + o novo de encargos percentual), smoke suite
  com 6 casos novos (custo fixo CRUD, tarifa calculada batendo com a
  fórmula usando a config REAL da conta — sem sobrescrever
  `Account.pricing*`, que é configuração compartilhada por todo o
  ambiente, não uma fixture descartável por run — reenvio no modo direto
  limpando os campos antigos, e rejeição de payload incompleto) — 240/241
  no total, a mesma falha pré-existente de `ASAAS_API_KEY` de sempre.
  Testado no navegador com dado real: custo fixo de R$1.500 rateado por
  168h dá overhead R$8,93/hora (conferido), tarifa calculada pra um
  papel de teste com salário R$4.500 e encargos 30% bateu exatamente com
  a prévia ao vivo (R$56,875) e com o valor salvo. Dados de teste
  removidos depois — a conta usada é o ambiente de dev real da Giulia,
  não um sandbox.

## Fase 2 (correção) — Moodboards: canvas livre, amostras, exportação

Décimo e último item do "Roadmap to 10" da auditoria (fase 2, "per-module
depth"). Verbatim: "A real freeform canvas — position, scale, layering —
plus material/fabric swatches and a branded export."

- **Achado ao investigar**: `MoodboardItem` só tinha `productId` + `order`
  — a UI era uma lista de nomes de produto (nem imagem mostrava, na tela
  interna). O link de apresentação pública já renderizava as fotos, mas
  como grid CSS recalculado, não a posição real de nada — não havia
  "layout" nenhum guardado em lugar algum pra recalcular.
- **`MoodboardItem` ganhou canvas livre + amostras**: `x`/`y`/`width`
  (canvas de tamanho lógico fixo, `MOODBOARD_CANVAS_WIDTH/HEIGHT`, pra
  designer/cliente/exportação desenharem sempre o mesmo layout em
  qualquer tela) — `order` dobra como z-index de empilhamento, não
  precisou de coluna nova. `productId` virou opcional; `kind` ("product"
  | "swatch") decide se o item é um Product real ou uma amostra de
  material/tecido só com `label` + `colorHex`/`swatchImageUrl`, sem
  produto nenhum no catálogo.
- **Canvas interativo sem lib nova** (`MoodboardCanvas`, client
  component): arrastar (pointer events nativos, sem drag-and-drop de
  terceiros) move o item; um handle no canto redimensiona; qualquer
  gesto traz o item pra frente (`bringToFront`, incrementa `order` além
  do maior atual). Estado otimista no cliente, só persiste
  (`PATCH /moodboard-items/:id`) no fim do gesto, não a cada pixel.
- **Achado real testando ao vivo**: `setPointerCapture` pode lançar
  `NotFoundError` (sessão de pointer sem captura ativa reconhecível) —
  descoberto só ao testar com eventos sintéticos, mas o mesmo risco
  existe pra qualquer usuário real numa borda rara do navegador. Como a
  chamada vinha ANTES de `dragState.current = {...}` no código original,
  um throw ali quebraria o arrastar inteiro silenciosamente. Corrigido
  invertendo a ordem (estado primeiro) e envolvendo o capture em
  try/catch -- capture é otimização (manter recebendo eventos se o
  cursor sair do elemento no meio do gesto), não pré-requisito.
- **Exportação/impressão em vez de rasterizar canvas**: fotos de produto
  vêm de ~18 sites de fornecedor reais capturados pelo Captura, quase
  certamente sem CORS liberado -- desenhar isso num `<canvas>` e chamar
  `toDataURL()` "contaminaria" o canvas (`SecurityError`) pra praticamente
  toda imagem real. Em vez de construir um proxy de imagem (infra nova,
  superfície de SSRF a mitigar), a exportação é uma **view de impressão
  dedicada e com marca** (`/projects/:id/moodboards/:moodboardId/print`,
  fora do grupo `(dashboard)` -- sem nav do app, igual a `/present/[token]`)
  que reaproveita o mesmo layout e deixa o próprio navegador desenhar as
  `<img>` (que carregam e imprimem normalmente sem CORS nenhum, restrição
  que só existe pra extração de pixel via Canvas) -- "Imprimir/Salvar como
  PDF" nativo do navegador, com `print:hidden` escondendo os controles no
  PDF final.
- **Link de apresentação pública atualizado pro mesmo layout**: trocado o
  grid CSS recalculado por posicionamento absoluto real (`x`/`y`/`width`),
  reaproveitando o mesmo componente visual (`MoodboardItemVisual`) do
  canvas interno e da view de impressão -- designer, exportação e cliente
  agora desenham exatamente o mesmo layout, não três interpretações
  diferentes do mesmo dado.
- **Bug real achado e corrigido no meio da implementação**: Server
  Component não pode passar função como prop pra Client Component (RSC
  exige props serializáveis) -- `productOptionLabel` (definida em
  `ffe/page.tsx`) quebrava a página inteira com 500 ao passar pro novo
  `MoodboardCanvas`. `tsc --noEmit` não pega isso (é uma restrição de
  runtime do React Server Components, não de tipo) -- só apareceu
  rodando de verdade no navegador. Corrigido duplicando a função de uma
  linha dentro do client component em vez de recebê-la como prop.
- Verificado: build+typecheck limpos (api e web), 6 casos novos no smoke
  suite (item "product" com x/y/width numéricos, amostra sem produto,
  cascata de posição entre itens novos, validação rejeitando amostra sem
  cor/foto, endpoint novo `GET /moodboards/:id`, `PATCH` de
  layout movendo/redimensionando/trazendo pra frente) — 246/247 no
  total, a mesma falha pré-existente de sempre. Testado no navegador com
  dado real (projeto Apto Vila Madalena): produto real + amostra
  "Linho cru" adicionados ao canvas, arrastar e redimensionar
  confirmados persistindo via API (não só otimista no cliente), view de
  impressão renderizando com a marca Studio Araci e o layout exato, e o
  mesmo layout replicado no link de apresentação pública. Dados de teste
  removidos depois.

## Correção — 4 achados críticos de segurança/negócio (auditoria externa)

Uma segunda auditoria independente ("Auditoria da Plataforma Araci",
revisão de código linha a linha contra `src/`, `scripts/` e
`schema.prisma`) encontrou 4 achados **críticos** que bloqueavam
qualquer publicação — dois de autorização, dois do link de apresentação
ao cliente. Os quatro foram verificados contra o código real (não só
aceitos da auditoria) antes de corrigir, e os quatro foram corrigidos
nesta sessão:

- **C-01 — Login Google sem restrição de domínio**: `apps/web/src/lib/auth.ts`
  não tinha `callback signIn`; o parâmetro `hd` do Google é só uma dica de
  UI, não uma imposição, e `ensureAccountAndUser` promovia qualquer e-mail
  novo a `staff` automaticamente. Corrigido em duas camadas (defesa em
  profundidade): callback `signIn` em `auth.ts` (nega o login antes da
  sessão existir) e uma segunda checagem em `auth.guard.ts` antes de
  `ensureAccountAndUser` (caso um JWT interno chegue por outro caminho).
  Lista permitida via `ALLOWED_EMAIL_DOMAINS`/`ALLOWED_EMAILS` (env, lista
  separada por vírgula) — domínio `studioaraci.com.br` mais qualquer
  e-mail avulso explicitamente aprovado, em vez de "só o domínio, sem
  exceção" (decisão da Giulia: a conta pessoal usada nesta sessão
  continua funcionando).
- **C-02 — Escalonamento de privilégio via chave de API**: `POST/DELETE
  /v1/users/:id/api-key` aceitava qualquer `id`, e como `AuthGuard`
  resolve `x-api-key` direto pro `accessLevel` do dono, qualquer staff
  conseguia gerar a chave do admin e autenticar como admin — contornando
  todo gate `@AdminOnly()` de uma vez. Corrigido removendo o `:id` da
  rota inteiramente (mesmo padrão do `GoogleCredentialsController`: só
  opera na própria sessão, nunca em nome de outro usuário) tanto no
  controller/service quanto nos dois lados (`apps/web` actions + UI). A
  UI também escondia o problema: `<ApiKeyPanel>` era renderizado pra
  TODA linha da tela `/team`, deixando qualquer staff clicar "Gerar
  chave" na linha do admin — agora só aparece na própria linha
  (`user.id === me.userId`), mesmo padrão já usado por
  `<GoogleSyncPanel>` ao lado.
- **C-03 — Link de apresentação vaza custo/markup/fornecedor**:
  `public-presentation.service.ts` devolvia o `Project` inteiro do Prisma
  via `include` sem filtrar nada — `product.sourceUrl`, `spec.unitPrice`
  (cru) e `spec.markupPercent` inclusos. Corrigido com `select` explícito
  em vez de `include`, tanto no `GET` quanto no `PATCH
  specifications/:id` (a mesma rota `@Public()` tinha o mesmo problema no
  retorno da escrita, mesmo o frontend nunca lendo esse corpo). Tipos
  novos e estreitos no frontend (`PresentationData`/`PresentationArea`/
  `PresentationSpecification`/`PresentationProduct`/
  `PresentationMoodboard(Item)`) substituindo o reaproveitamento dos
  tipos internos completos.
- **C-04 — Preço mostrado ao cliente é o custo, não o preço de venda**:
  `present/[token]/page.tsx` renderizava `spec.unitPrice` cru; o resto do
  sistema (carrinho, checkout que gera a fatura) sempre calcula
  `quantity × unitPrice × (1 + markupPercent)`. Decisão da Giulia: cliente
  vê preço unitário já com markup aplicado (não só total da linha nem só
  total do ambiente). Resolvido calculando o preço de venda **no
  service**, não no frontend — o campo `unitPrice` que sai da rota
  pública já é `unitPrice × (1 + markupPercent)`, então o cliente nunca
  recebe os dois números crus que permitiriam reconstruir o markup (C-03
  e C-04 resolvidos pela mesma mudança).
- Verificado: build+typecheck limpos (api e web); smoke suite com 2 casos
  novos de regressão (`intruso@gmail.com` contra `/v1/clients` → 403 em
  vez de virar staff; a rota antiga `POST /users/:id/api-key` não gera
  mais chave nenhuma) e 2 novos no link público (preço já com markup —
  8200 × 1,1 = 9020 — em vez do custo cru; `markupPercent`/`sourceUrl`
  nunca aparecem no payload) — 250/251, a mesma falha pré-existente de
  sempre (`ASAAS_API_KEY` configurada localmente faz o teste que espera
  "não configurada" falhar; nada a ver com esta correção). Testado
  também contra o link de apresentação real do projeto Apto Vila
  Madalena: `Sofá Modular Nuvem` aparece por R$ 9.020 (igual à fatura já
  gerada no checkout), e uma checagem direta do JSON confirma
  `markupPercent`/`sourceUrl` ausentes do payload.
- **Achado à parte, fora do escopo desta correção**: rotas sem handler
  correspondente (ex.: a própria `POST /users/:id/api-key` antiga) caem
  num bug pré-existente do `HttpExceptionFilter` que devolve 500
  genérico em vez do 404 que o NestJS já gera sozinho — não é um
  problema de autorização (nenhuma chave é gerada), só de status
  code/observabilidade. Não corrigido aqui (fora do escopo dos 4
  achados críticos, e mexer no filtro global de exceção é uma mudança de
  raio maior do que o pedido); registrado pra não ser confundido com um
  efeito colateral desta correção.
- **Os 5 achados "Altos" foram corrigidos em seguida, mesma sessão** — ver
  seção própria logo abaixo. O que segue em aberto desta auditoria é só a
  lista de bloqueadores de publicação (empacotamento/deploy, banco de
  produção, observabilidade — 15 no total, ver o documento da auditoria)
  e os achados "Médios" (comparação de token de webhook não é de tempo
  constante; cron de oportunidade parada sequencial sem limite; server
  actions do portal/apresentação sem tratamento uniforme de erro; proxy
  BFF sem `PUT`).

## Correção — os 5 achados "Altos" da mesma auditoria externa

- **A-01 — Sem fronteira de erro, `(dashboard)/layout.tsx` derrubava as 20
  rotas do dashboard**: `apiGet("me")`/`apiGet("notifications")` sem
  try/catch. Corrigido separando os dois: um 401/403 em `/me` (ex.:
  colaborador desativado com JWT do NextAuth ainda válido) agora
  redireciona pra `/api/auth/signout` em vez de propagar o throw —
  recarregar a mesma sessão inválida só repetiria o erro, então encerrar
  a sessão é a saída real. Falha em `/notifications` já não derruba mais
  nada — sino vazio no lugar de crash, não é crítico pro shell renderizar.
  Adicionado também `(dashboard)/error.tsx` (não existia `error.tsx` em
  lugar nenhum de `src/app`), com botão "tentar de novo" e link de volta.
- **A-02 — Excluir cliente/projeto deixava `Activity` órfã**: mesmo
  padrão polimórfico do `OfficeLink` (sem FK real), mas só o `OfficeLink`
  era limpo na transação de delete. Corrigido em `clients.service.ts` e
  `projects.service.ts` (paridade com o padrão já existente) e também em
  `opportunities.service.ts` — `ActivityEntityType` inclui `OPPORTUNITY`,
  então `deleteOpportunity` tinha o mesmo risco por um caminho que a
  auditoria não citou por nome, mas é a mesma classe de bug.
- **A-03 — Quase nenhuma FK tinha índice**: adicionado `@@index` nos 12
  campos exatos que a auditoria listou (`TimeEntry.userId/projectId/
  phaseId`, `Allocation.userId/projectId`, `Invoice.projectId/phaseId`,
  `Expense.accountId/projectId`, `Client.accountId`, `Project.accountId/
  clientId`, `User.accountId`, `Product.accountId`, `Opportunity.
  clientId`, `Area.projectId`, `ProductSpecification.areaId/productId`,
  `Task.phaseId`) — 19 índices numa migration só, sem mudança de dado.
- **A-04 — OAuth do Google sem `state` (CSRF de consentimento)**: um
  atacante conseguia iniciar o próprio consentimento, pegar um `code`
  ligado à conta dele, e induzir a vítima logada a abrir `/api/google/
  callback?code=...`, fazendo o refresh token do atacante virar a
  "Sincronização Google" da vítima. Corrigido com `state` aleatório
  (32 bytes) gerado em `authorize/route.ts`, guardado num cookie httpOnly
  de uso único (10 min, path `/api/google`) e conferido em `callback/
  route.ts` antes de trocar qualquer `code` por token. Verificado contra
  o servidor real: forjar a chamada ao callback com `state` incorreto
  (sem nunca ter passado por `authorize`) é rejeitado antes de qualquer
  chamada real à API do Google.
- **A-05 — `Client.email` sem constraint, portal loga por e-mail com
  `findFirst`**: adicionado `@unique` em `Client.email` (sem duplicata
  real no banco hoje — checado antes de migrar), com normalização pra
  minúsculas no `ClientsService` (não só no schema Zod, porque
  `LeadsService` chama `createClient` direto, sem passar pelo
  `ZodValidationPipe` de novo). Isso expôs uma tensão real: `LeadsService.
  submitLead` sempre criava um `Client` novo por design ("dedupe é
  problema à parte", comentário do próprio código) — com e-mail único,
  reenviar o formulário público com o mesmo e-mail agora reaproveita o
  `Client` existente e cria só uma `Opportunity` nova, em vez de tentar
  (e falhar) duplicar o cliente. Também fechada uma lacuna que essa
  mesma constraint teria aberto: violação de `@unique` (`P2002`) não
  tinha tratamento no `HttpExceptionFilter` global e cairia num 500
  genérico — agora mapeada pra 409 CONFLICT com o nome do campo que
  colidiu, mesmo padrão já usado pra conflito de FK (P2003/P2039).
- Verificado: build+typecheck limpos (api e web) depois de cada um dos 5;
  9 casos novos no smoke suite (JWT forjado com e-mail fora do allowlist
  → 403; cleanup de `Activity` órfã junto com `OfficeLink`; segundo envio
  do formulário de lead com o mesmo e-mail em outra caixa → reaproveita
  o `Client`, cria uma segunda `Opportunity`; e-mail duplicado em POST
  /clients → 409 não 500) — 256/257, mesma falha pré-existente de sempre
  (`ASAAS_API_KEY` real configurada no `.env` local, sem relação com
  nenhum dos 5 achados). Dashboard e `/team` testados no navegador contra
  dado real (projeto Apto Vila Madalena) depois das mudanças no layout,
  sem regressão visual.

## Correção — os 4 achados "Médios" da mesma auditoria externa

- **Comparação de token de webhook não era de tempo constante**:
  `billing-webhook.controller.ts` e `zapsign-webhook.controller.ts`
  comparavam o segredo do header (`asaas-access-token`/`zapsign-webhook-
  token`) com `!==` puro — o tempo de execução de uma comparação de
  string vaza informação sobre onde a diferença começa. Corrigido com um
  helper novo (`common/timing-safe-equal.ts`) sobre `crypto.
  timingSafeEqual`, usado nos dois controllers. Risco prático baixo pela
  internet (a auditoria já classificou assim), mas é o único gate dessas
  duas rotas `@Public()` antes de mutar `Invoice`/`Proposal`.
- **Cron de oportunidade parada sequencial e sem limite**:
  `StalledOpportunitiesCron` fazia um `for...of` com `await` por dentro —
  `listForOpportunity` (que já revalida a oportunidade via
  `getOpportunity`) mais uma checagem de notificação recente, pra CADA
  oportunidade aberta de TODAS as contas, uma vez por dia. Reescrito em 2
  consultas em lote (`ActivitiesService.getLastActivityAtByOpportunityIds`,
  `NotificationsService.getLastStalledNotificationAtByOpportunityIds`) —
  agrupadas em memória por não dar pra expressar "desde a última
  atividade DESTA oportunidade" num único `WHERE` sem SQL cru — mais o
  envio em paralelo só pra quem de fato precisa de aviso. `hasRecentNotification`
  (método antigo, virou morto) foi removido em vez de deixado pra trás.
  Verificado contra o `scripts/verify-stalled-cron.ts` já existente,
  rodando de verdade contra o banco: cria a notificação na 1ª execução e
  não duplica na 2ª — mesmo comportamento de antes, com 2 idas ao banco
  em vez de até 3N.
- **Server actions do portal/apresentação não tratavam erro do
  backend**: `portal/actions.ts#requestLink` e `presentation/actions.ts`
  deixavam um `PortalApiError`/`PublicApiError` (token revogado,
  especificação excluída entre o render e o clique) subir sem tratamento
  — e nenhuma dessas duas rotas tem `error.tsx` (só `(dashboard)` tem,
  ver achado A-01), então virava a tela de erro genérica do Next pro
  cliente/prospecto. Corrigido com o mesmo padrão que já existia em
  `portal/verify/route.ts`: captura, redireciona com o erro na query
  string, a própria página exibe. `present/[token]/page.tsx` ganhou o
  mesmo banner de erro que `portal/login/page.tsx` já tinha.
- **Proxy BFF sem `PUT`**: `api/v1/[...path]/route.ts` exportava só
  `GET/POST/PATCH/DELETE` — sem chamador hoje, mas uma armadilha latente
  pra uma futura feature que precisasse de `PUT`. A função `proxy` já é
  genérica (usa `request.method`), então foi só adicionar o export.
- Verificado: build+typecheck limpos (api e web); smoke suite 256/257,
  mesma falha pré-existente de sempre (`ASAAS_API_KEY`); `verify-stalled-
  cron.ts` confirma o comportamento do cron reescrito contra dado real.

## Correção — 11 dos 15 bloqueadores de publicação da mesma auditoria

Os outros 4 (os 4 críticos de segurança/negócio) já tinham sido
corrigidos antes — ver a seção própria mais acima. Escolhas de infra
confirmadas com a Giulia antes de começar: **Render** como provedor de
hospedagem (motivo documentado no topo do `render.yaml`, não preferência
— o estúdio tem um segredo em arquivo, o `.pfx` do certificado A1, e
precisa de um volume persistente pro XML fiscal, e Render atende os dois
nativamente) e **Sentry** como ferramenta de rastreamento de erro.

- **Magic link apontando pra localhost sem avisar**: `WEB_URL` ausente
  virava um link inútil no e-mail do cliente, em silêncio. Agora avisa
  alto (`Logger.warn`) sempre que cai no fallback, e `WEB_URL` entrou na
  lista de configuração recomendada checada no boot (ver abaixo).
- **Comando de migração de produção**: só existia `prisma migrate dev`
  (interativo, pode propor reset do banco — nunca deveria rodar contra
  produção). Adicionado `migrate:deploy` (`prisma migrate deploy`, não-
  interativo) em `packages/db` e um atalho `db:migrate:deploy` na raiz;
  é o que `render.yaml` chama como `preDeployCommand`.
- **Log de erro 500 sem contexto nenhum**: `this.logger.error(exception)`
  sozinho não registrava rota, método nem quem estava logado — um 500 de
  produção era indiagnosticável. `HttpExceptionFilter` agora loga
  método+rota+ator (via `getAuditActor()`, já existia pra outra coisa) e
  também manda pro Sentry (`Sentry.captureException`, ver abaixo).
- **`error.tsx`/`global-error.tsx`/`not-found.tsx` que faltavam**:
  `(dashboard)/error.tsx` (achado A-01) só cobria o grupo do dashboard.
  Adicionados `app/error.tsx` (cobre as 4 rotas públicas), `app/global-
  error.tsx` (único jeito de capturar um throw dentro do próprio layout
  raiz — precisa renderizar `<html>/<body>` própria) e `app/not-found.tsx`
  com a cara do produto em vez da página 404 genérica do Next.
- **Configuração nunca validada no boot, healthchecks sempre "ok"**:
  `apps/api/src/main.ts` agora falha alto e cedo (`process.exit(1)`) se
  `DATABASE_URL`/`INTERNAL_API_SECRET` faltarem, e avisa (sem derrubar o
  boot) pras variáveis que só degradam uma feature específica.
  `apps/web/src/instrumentation.ts` (hook oficial do Next.js, chamado uma
  vez quando o servidor sobe) faz o mesmo do lado de lá. Os dois
  `/health` agora checam de verdade: `apps/api` roda `SELECT 1` no
  Postgres; `apps/web` checa se consegue alcançar o `/health` de
  `apps/api` — nenhum dos dois mais responde "ok" sem tocar em nada.
- **Nenhum artefato de empacotamento nem pipeline**: `Dockerfile` pra
  `apps/api` (mantém as devDependencies na imagem final de propósito —
  `prisma migrate deploy` precisa da árvore TypeScript, e rodar o Pre-
  Deploy Command do Render contra a mesma imagem evita um job/init-
  container separado) e pra `apps/web` (multi-stage com `output:
  "standalone"` do Next, traçado a partir da raiz do monorepo). CI novo
  em `.github/workflows/ci.yml` — instala, gera o Prisma Client, builda
  os dois apps via turbo e roda typecheck; é a etapa 1 que a própria
  auditoria pede antes de qualquer decisão de hospedagem ("provar que o
  monorepo compila fora do Windows"). `turbo.json` ganhou a lista de
  `NEXT_PUBLIC_*` na config de `env` do build (achado à parte da
  auditoria: sem isso, um acerto de cache do turbo podia publicar o
  bundle com o `NEXT_PUBLIC_GOOGLE_CLIENT_ID` de uma build anterior).
  `.nvmrc`/`engines` alinhados pra Node 22 (decisão que a própria
  auditoria pede — `libxmljs2`, dependência transitiva da integração de
  NFS-e, exige `>=22`).
- **Banco de produção**: `render.yaml` declara o Postgres gerenciado
  (blueprint, não provisionado de verdade — precisa de uma conta Render
  real, que esta sessão não tem acesso). `DATABASE_URL` já resolve certo
  contra o formato de connection string do Render (mesmo formato
  `postgresql://` de sempre, nada específico de provedor no código).
- **Webhooks da Asaas/ZapSign sem caminho público**: um efeito colateral
  direto de `apps/api` virar um serviço privado no Render (`pserv`, sem
  domínio) — a própria Asaas/ZapSign não teria mais como chamar
  `POST /v1/billing/asaas/webhook`/`POST /v1/zapsign/webhook` direto.
  Adicionadas duas rotas "cano burro" em `apps/web`
  (`api/webhooks/{asaas,zapsign}`) que só repassam método/header de
  segredo/corpo pra rota `@Public()` correspondente em `apps/api` — a
  autorização de verdade continua sendo o header de segredo, verificado
  do lado de lá, inalterado. Configurar no painel de cada provedor como a
  URL do webhook em produção.
- **Zero rastreamento de erro**: Sentry (`@sentry/nestjs` em `apps/api`,
  `@sentry/nextjs` em `apps/web`) — sem `SENTRY_DSN`/
  `NEXT_PUBLIC_SENTRY_DSN` configurado, é inteiramente um no-op (dev
  local continua idêntico a antes). Capturado nos 3 pontos que importam:
  o branch de 500 do `HttpExceptionFilter`, e os 3 `error.tsx`/`global-
  error.tsx` do apps/web (o `global-error.tsx` é o único jeito
  recomendado pela própria documentação do Sentry de cobrir um throw no
  layout raiz do App Router). Upload de source map (stack trace legível,
  não código minificado) fica de fora por decisão — precisa de
  `SENTRY_AUTH_TOKEN`/org/project como segredo extra de CI, e o
  postinstall do `@sentry/cli` já veio bloqueado pelo `allowScripts`
  existente no `package.json` raiz (comportamento correto — não
  aprovado às pressas só porque instalou).
- **Não corrigido nesta sessão, de propósito**: LGPD (bloqueador 05) —
  a própria auditoria já enquadra isso como decisão da Giulia (quem é o
  controlador, quem é o encarregado) mais revisão jurídica do aviso de
  privacidade, não implementação; entra como o próprio "Correção — LGPD"
  já mapeado no plano de 38 itens, não misturado aqui.
- **Limitação desta sessão**: nada disto foi testado contra uma conta
  Render de verdade (sem acesso a uma) — a lógica de build (comandos do
  turbo, caminho de saída do `output: "standalone"`, `dist/main.js`) foi
  confirmada rodando de verdade fora do Docker, mas o `docker build`
  em si e os nomes de campo exatos do blueprint do Render não foram
  validados contra a ferramenta real. O ponto mais provável de precisar
  ajuste fino no dashboard na hora de configurar de verdade: como os
  `NEXT_PUBLIC_*` chegam como build arg pro Docker.
- Verificado: build+typecheck limpos (api e web) depois de cada mudança;
  os dois `/health` testados de verdade contra os servidores de dev
  rodando (Postgres real respondendo, apps/web alcançando apps/api); as
  duas rotas de webhook testadas de verdade (token errado → 401
  repassado, token certo → 200 repassado); smoke suite 256/257, mesma
  falha pré-existente de sempre (`ASAAS_API_KEY`).

## Correção — 9 lacunas da matriz de comparação com concorrentes (auditoria externa)

A auditoria compara a plataforma linha a linha contra 36 recursos de
concorrentes e lista 9 lacunas específicas, com um plano de fechamento em
6 grupos. Esta rodada fecha as lacunas que são decisão técnica pura; as
que a própria auditoria já classifica como decisão de negócio/jurídica
ficam de fora, de propósito (ver "Não corrigido" no fim desta seção).

- **Cálculo de proposta só sabia hora_tecnica, em silêncio**:
  `ProposalsService.createProposal` calculava horas × tarifa pra
  qualquer `feeModel`, mesmo pra `valor_m2`/`percentual_cub`/`fixo`/
  `recorrente` — apresentado como resultado real sem nenhum aviso.
  Adicionada uma guarda que rejeita com 422 `FEE_MODEL_NOT_SUPPORTED`
  quando a Opportunity não é `hora_tecnica`, em vez de calcular errado.
- **Kanban sem arrastar-e-soltar, sem coluna pra estágio desconhecido, e
  perder pra sempre virava a única opção**: `opportunities-board.tsx`
  ganhou drag-and-drop nativo (HTML5 DnD, mesma filosofia anti-
  dependência do resto do projeto), uma coluna "Outro" pra qualquer
  `stage` fora do enum conhecido (antes essas oportunidades simplesmente
  não apareciam em lugar nenhum), totais em R$ por coluna, e um endpoint
  novo (`POST /opportunities/:id/reopen`) que limpa `lostAt`/`lostReason`
  sem tocar `stage` — reaparece na coluna certa sem redigitar nada.
- **Sem calendário de férias/ausência, capacidade sempre otimista**:
  modelo `Absence` novo (CRUD espelhando `Allocation` exatamente — ver
  `absences.service.ts`/`absences.controller.ts`), com sweep-line
  (`isOnAbsence`, mesmo algoritmo de `peakHoursInWindow`) usado em dois
  lugares: `BiService.summarizeCapacidade` (novo `emFeriasAgora`, e
  `sobrecarregado` agora também dispara se a pessoa está de férias e
  ainda assim tem horas alocadas) e no formulário de alocação (quem está
  de férias no período aparece por último, com aviso em vez de horas).
- **FF&E sem exportação nenhuma**: `ExportFfeCsv`, mesmo padrão de CSV
  pt-BR já usado pra projetos (`;`, decimal com vírgula, BOM UTF-8) —
  colunas de ambiente/produto/fornecedor/categoria/quantidade/preço/
  markup/total/status.
- **LGPD: nenhum mecanismo de consentimento, portabilidade ou
  anonimização**: `leadInputSchema` exige `consent: true` (formulário
  público e o de dentro do produto), gravado como `Client.consentedAt`.
  `GET /clients/:id/data-export` (admin) devolve tudo que a conta tem
  sobre o cliente (oportunidades, projetos, notas) num JSON baixável —
  novo botão "Meus dados" também no portal do cliente
  (`GET /client-portal/data-export`, rota dedicada em `apps/web`, não
  passa pelo proxy BFF genérico porque o portal não tem sessão NextAuth).
  `POST /clients/:id/anonymize` zera nome/e-mail/telefone/documento e
  redige os mesmos campos no histórico de auditoria já gravado — usando
  o cliente Prisma **cru** (`rawPrisma`, sem a extensão de auditoria),
  porque gravar a anonimização pelo cliente estendido geraria um novo
  `AuditLog` com o PII real como valor "de" do diff, recriando
  exatamente o dado que a operação existe pra apagar. Página
  `/privacidade` nova, mas deliberadamente só estrutural — todo texto é
  um placeholder `[A PREENCHER — revisão jurídica necessária]`, ver
  "Não corrigido" abaixo.
- **Portal do cliente não tinha nenhuma superfície de pré-venda**: uma
  `Opportunity` sem `Project` ainda (proposta enviada, negócio não
  fechado) não tinha como o prospecto ver, aceitar ou recusar — o único
  mecanismo de link público (`PresentationLink`) exige `Project`.
  Estendido o próprio magic link do portal: `GET /client-portal/pending-
  proposals` lista oportunidades do cliente sem projeto e com proposta
  já enviada, com a mesma projeção segura já usada em `present/:token`
  (sem `baseCost`/`adjustedCost`/`complexityMultiplier`/
  `packageDiscountPercent` — é composição interna de preço, não o que o
  prospecto aprova). "Aceitar" reaproveita o `zapsignSignUrl` que já
  existe; "Recusar" (`POST .../decline`) reaproveita `markLost` (mesma
  trilha, mesma trava contra reverter oportunidade já ganha); e um campo
  livre novo (`Opportunity.prospectComment`, mesmo padrão de
  `ProductSpecification.clientComment`) deixa o prospecto perguntar algo
  sobre a proposta — visível pro time em `/opportunities/:id`.
- **Não corrigido nesta rodada, de propósito**: exportação CAD/Revit
  (a própria auditoria recomenda decidir o formato antes de qualquer
  código — não é uma lacuna que dá pra fechar sem essa decisão; decidido
  bem mais adiante nesta sessão que o fluxo real é SketchUp+LayOut
  exportando PDF, não CAD/Revit — ver "Correção — Prévia inline de
  documentos..." mais abaixo, já fechado); o texto
  jurídico real da página de privacidade (depende de revisão jurídica,
  não de código — automação de retenção/expurgo acabou saindo desta
  frase, ver seção própria logo abaixo); autorização de colaborador
  externo (a própria auditoria já chama isso de "o item mais delicado do
  plano inteiro" — fica pra um pedido explícito à parte, não misturado
  aqui).
- Verificado: build+typecheck limpos (api e web) depois de cada mudança;
  smoke suite 285/286 (13 novas asserções só pro portal pré-venda —
  pendentes/aceite/recusa/comentário —, mais as de férias e LGPD),
  mesma falha pré-existente de sempre (`ASAAS_API_KEY`, agora por um
  motivo ligeiramente diferente: a chave passou a existir no `.env`
  local, então o teste chega no `INVOICE_MISSING_DUE_DATE` em vez do
  `ASAAS_NOT_CONFIGURED` esperado — nada a ver com esta rodada, não
  corrigido); fluxo de pré-venda do portal (comentário, recusa, e o
  espelho no lado staff) verificado de ponta a ponta no navegador contra
  um registro descartável, limpo depois.

## Correção — automação de retenção/expurgo de dados (LGPD)

Item que a própria rodada anterior deixou de fora de propósito, por
depender de "decisão da Giulia": o PRAZO de retenção é uma decisão de
negócio/jurídica que o código não deveria inventar. Pedido explícito do
usuário pra tackle-ar mesmo assim — a resposta não foi escolher um
número, foi separar o que É decisão de código (detectar candidatos,
avisar) do que não é (o prazo em si, e o gatilho da anonimização).

- **Prazo configurável, desligado por padrão**: `Account.
  dataRetentionMonths` (nulo = desligado), editável só por admin na tela
  de Financeiro & Fiscal (`PATCH /account`, mesmo controller/guard de
  `taxRegime`). Nenhuma conta que não configurar isso explicitamente é
  tocada pela automação — mesmo espírito do `[A PREENCHER]` da página de
  `/privacidade` (achado anterior): a plataforma não finge ter uma
  política que ninguém decidiu.
- **"Automação" é a detecção, não a exclusão**: perguntado ao usuário
  antes de escrever qualquer código (ver decisão registrada na sessão) --
  anonimizar cliente já é irreversível, e o único outro gatilho parecido
  do sistema (NFS-e pronta pra emitir, `NotificationsService.
  notifyNfseReady`) foi deliberadamente projetado pra só avisar um admin,
  nunca executar sozinho. `DataRetentionCron` (mora em `activities/`,
  mesmo motivo de import circular do `StalledOpportunitiesCron`) segue o
  mesmo molde: roda semanalmente, lista clientes da conta com política
  configurada, calcula "última atividade" como o mais recente entre
  criação do cliente, criação/ganho/perda de cada Opportunity, criação de
  cada Project e a nota (Activity) mais recente — e NUNCA marca como
  candidato um cliente com Opportunity ainda aberta ou Project ativo,
  não importa a data. Quem passa do prazo gera uma `Notification` (mesmo
  sino/e-mail de sempre) apontando pra `/clients/:id`; anonimizar
  continua sendo o clique já existente ali (`ClientsService.
  anonymizeClient`, da rodada de LGPD anterior).
- **`Notification.clientId`**: terceiro campo solto de alvo (depois de
  `projectId`/`opportunityId`) -- o próprio comentário no schema já
  avisava que um terceiro tipo justificaria reconsiderar o par
  polimórfico `entityType`/`entityId` (como `Activity`/`OfficeLink`); por
  ora só mais uma coluna, seguindo o padrão existente (Rule 3, mudança
  cirúrgica) — fica marcado no comentário do schema pra próxima vez que
  aparecer um quarto gatilho.
- Verificado: build+typecheck limpos (api e web); script dedicado
  (`verify-data-retention-cron.ts`, mesmo molde do `verify-stalled-
  cron.ts` já existente) confirma contra o banco real: sem política
  configurada ninguém é avaliado; cliente parado há ~13 meses com
  política de 12 meses vira candidato e é notificado; cliente com
  Opportunity aberta NUNCA vira candidato mesmo com `createdAt` antigo;
  2ª execução não duplica o aviso (idempotente); smoke suite 288/289
  (3 novas asserções pra `PATCH /account { dataRetentionMonths }`),
  mesma falha pré-existente de sempre (`ASAAS_API_KEY`); tela de
  Financeiro & Fiscal e o link da notificação pro cliente certo testados
  de ponta a ponta no navegador contra a conta real (prazo configurado,
  confirmado no banco, depois desligado de novo — nunca deixado ligado
  sem decisão real por trás).

## Correção — Fiscal: NFS-e dentro do fluxo real de faturamento

Uma segunda revisão externa (mesmo método, mesma matriz, rodada em 27 ago
2026) confirmou que os 4 críticos, os 5 altos, os 4 médios e 5 das 9
lacunas originais já estavam corrigidos no código — conferido de novo
contra `src/` antes de qualquer trabalho novo, não só aceito de olho
fechado. Restavam dois grupos grandes nunca tocados: NFS-e dentro do
fluxo real e gestão documental (Drive). Esta rodada fecha o primeiro.

O que já existia (`NfseController`, `NfseService.emitirTeste`) provava
que certificado, assinatura e webservice funcionam contra a Homologação
da SEFIN Nacional — com dado 100% fictício, nunca ligado a uma `Invoice`
de verdade. Faltava exatamente esse elo.

- **`NfseService.emitirParaFatura`**: builder de DPS novo
  (`nfse-invoice-dps.ts`) a partir de uma `Invoice` real — cliente, valor
  e código de serviço de verdade, reaproveitando a mesma correção de fuso
  e o mesmo `totTrib` zerado já verificados no DPS de teste. Código de
  serviço nunca hardcoded: lido de `Account.taxRegime` a cada emissão —
  `170201` (Datilografia) enquanto MEI, `070104` (Arquitetura) + `1520`
  (municipal de SP) só depois de ME, confirmado com a Giulia em
  `decisoes-pos-descoberta.md` #4 (Arquitetura não pode ser MEI).
- **Idempotência de verdade, não só de nome**: `Invoice.nfseChaveAcesso`
  (`@unique`) barra reemissão antes de qualquer chamada à SEFIN, e o nDPS
  é derivado de forma estável do próprio id da fatura (não de timestamp,
  como no DPS de teste) — uma tentativa que falhar por queda de rede e
  for reenviada cai no mesmo nDPS, então o pior cenário de duplicar a
  chamada é a SEFIN rejeitar como duplicata, nunca autorizar duas DPS
  pra mesma fatura.
- **Gate de ambiente por conta, não por env var**: `Account.nfseAmbiente`
  (`"homologacao"` por padrão, sempre) — trocar pra `"producao"` é um
  PATCH explícito de admin na tela de Financeiro & Fiscal, nunca uma
  variável de ambiente mal configurada emitindo de verdade sem querer.
  Copy da tela é honesta sobre o risco residual: a lib usada
  (`@nfewizard/nfse`) ainda tem uma issue aberta e sem solução definitiva
  sobre qual perfil de assinatura XML a SEFIN Nacional aceita em
  Produção — ligar o toggle é a permissão pra tentar, não uma prova de
  que vai funcionar.
- **Rejeição da SEFIN visível pra usuária**: `Invoice.nfseRejectionReason`
  persiste o detalhe real (`error.nfseErrorDetail`, mesmo parsing já
  usado em `emitirTeste`) em vez de deixar virar só um 502 genérico —
  sobrevive a um refresh de página, exibido como aviso vermelho na tela
  do projeto.
- **Certificado A1: alerta de vencimento**. `CertificateExpiryCron`
  (semanal, mesmo padrão dos outros dois crons de fundo) avisa os admins
  quando faltam ≤60 dias pro certificado vencer (o real vence em
  24/08/2027) — achado da própria auditoria: renovação "vira uma tarefa
  operacional recorrente do estúdio", sem aviso nenhum hoje seria só
  descobrir numa emissão real falhando.
- **Não corrigido nesta rodada, de propósito**: cancelamento/substituição
  de NFS-e (item "grande" da lista de 9 — precisa de fluxo próprio, fora
  do escopo de "ligar o que já existe ao Invoice" — ver "Correção —
  Cancelamento e substituição de NFS-e" mais abaixo, já fechado); cálculo
  real de tributação federal/estadual/municipal por nota (Reforma
  Tributária/IBS-CBS) — já documentado no schema como "padrão ainda não
  estabilizado", não uma lacuna nova desta emissão.
- Verificado: build+typecheck limpos (api e web); script dedicado
  (`verify-nfse-invoice.ts`) emitiu uma NFS-e de verdade contra a
  Homologação real da SEFIN Nacional a partir de uma fatura de teste —
  chave de acesso e idDps recebidos e persistidos —, confirmou
  `CLIENT_MISSING_DOCUMENT` pra cliente sem CPF/CNPJ e
  `NFSE_ALREADY_ISSUED` numa segunda tentativa pra mesma fatura;
  `verify-certificate-expiry.ts` confirmou que o cron não faz nada contra
  o certificado real (vencimento distante) e que a notificação fabricada
  produz o título certo; smoke suite 293/294 (5 novas asserções: duas
  guardas de NFS-e sem tocar a SEFIN, três de `PATCH /account {
  nfseAmbiente }`), mesma falha pré-existente de sempre (`ASAAS_API_KEY`);
  fluxo completo testado de ponta a ponta no navegador contra um
  projeto/fatura descartável — clique em "Emitir NFS-e", chave de acesso
  real da SEFIN aparecendo na tela, status virando "Emitida" — limpo
  depois.

## Correção — Gestão documental por projeto (Google Drive)

Segundo dos dois grupos grandes que a segunda revisão externa apontou
como nunca tocados (o primeiro foi a NFS-e, seção acima). A recomendação
da própria auditoria — Drive continua guardando os arquivos, a
plataforma passa a ser dona só da árvore e dos metadados — e a decisão
de tipo de app OAuth (Internal, ver `decisoes-pos-descoberta.md` #5)
foram resolvidas antes de qualquer código.

- **`GoogleDriveService` real**, primeiro uso de verdade do refresh token
  que `GoogleCredential` guarda desde a Fase 4 (até aqui só `disconnect()`
  o tocava). `GoogleCredentialsService.getAccessToken` troca esse refresh
  token por um access_token de vida curta — precisou adicionar
  `GOOGLE_CLIENT_ID`/`SECRET` também em apps/api (mesmo client OAuth de
  apps/web) e o escopo `drive.file` ao fluxo de sincronização existente
  (`/api/google/authorize`). Como `GoogleCredential` é por usuário, não
  por conta (não existe identidade "do estúdio" no Google), o serviço usa
  a credencial de QUALQUER admin que já tenha conectado com esse escopo —
  documentado explicitamente, não escondido.
- **`DriveClient` como porta**, separando a lógica de orquestração
  (`GoogleDriveService`) da chamada HTTP real à Drive API
  (`GoogleDriveApiClient`) — é o que permite testar sem tocar o Google
  (ver Verificado abaixo).
- **Árvore de pastas por projeto e por fase do PEP** (`ensureProjectFolderTree`):
  pasta raiz + uma por fase CONTRATADA (mesma regra de negócio já usada
  no faturamento), idempotente — clicar de novo só cria o que falta,
  nunca duplica.
- **Taxonomia documental no `OfficeLink`**: `documentType` (rótulo livre,
  mesmo espírito de `Client.source`), `phaseId` (FK real pra
  `ProjectPhase`, dessa vez — diferente do `entityId` polimórfico de
  sempre) e `visibleToClient` (metadado por enquanto; o item "grande" que
  exibiria isso pro cliente de verdade foi adiado, ver abaixo). Editável
  por um `PATCH /office-links/:id` novo.
- **Reconciliação de vínculo quebrado**: achado literal da auditoria —
  "hoje o link apodrece em silêncio" quando um arquivo é movido/
  renomeado/excluído no Drive. `checkBrokenLinksForAccount` verifica
  todos os vínculos DRIVE de uma conta contra a Drive API de verdade;
  `BrokenLinkCheckCron` (semanal) chama isso pra toda conta com vínculo
  DRIVE e notifica só na transição pra quebrado (mesmo critério de
  idempotência dos outros gatilhos de notificação desta sessão).
- **Comentário obsoleto corrigido** (`office-links.service.ts`) — a
  própria segunda auditoria apontou que ele ainda dizia "colado à mão,
  sem chamada real ao Google", quando o Picker/Calendar/Gmail já
  funcionam de verdade há uma fase inteira.
- **Não corrigido nesta rodada, de propósito**: checklist de documentos
  obrigatórios amarrado ao gate do PEP (faz mais sentido depois que a
  taxonomia estiver em uso real — sequenciamento, não só falta de tempo,
  ver "Correção — Checklist de documentos obrigatórios..." mais abaixo,
  já fechado); versionamento (expor revisões do Drive — ver "Correção —
  Versionamento de documentos do Drive" mais abaixo, já fechado); e o
  item "grande" da lista — documentos visíveis ao cliente no portal/link
  de apresentação sem exigir conta Google (precisa de uma rota de proxy
  de leitura nova, escopo maior que o resto deste grupo — ver "Correção —
  Documentos visíveis ao cliente no link de apresentação" mais abaixo,
  já fechado).
- Verificado: build+typecheck limpos (api e web); **porta fake do Drive**
  pedida explicitamente pela auditoria — `google-drive.service.spec.ts`
  (6 testes, `FakeDriveClient` em memória) confirma a árvore de pastas
  completa, a idempotência de rodar duas vezes, criar só a pasta que
  falta quando uma fase nova é contratada, a recusa sem credencial
  conectada, e a detecção de vínculo quebrado sem re-notificar o que já
  estava quebrado antes; smoke suite 297/298 (6 novas asserções: taxonomia
  via PATCH, guarda de fase só em vínculo de projeto, e as dois guardas
  reais de "ninguém conectou o Drive" — sem precisar de fake nenhum, é o
  estado real deste ambiente de dev), mesma falha pré-existente de sempre
  (`ASAAS_API_KEY`); suíte Jest completa (21 testes, 3 arquivos) sem
  regressão. Provisionar uma pasta REAL no Drive exige passar pelo
  consentimento OAuth de verdade (criaria um recurso real na conta Google
  de quem autorizasse) — não automatizado nesta sessão de propósito;
  verificado em vez disso, ao vivo no navegador contra um vínculo
  descartável: os dois textos de erro guiando pra conectar aparecem
  corretos nos dois botões novos, e o editor de taxonomia (tipo de
  documento + fase + visibilidade) grava e reflete na tela de ponta a
  ponta — limpo depois.

## Correção — Colaboração com consultores externos

Último item da segunda auditoria externa, e o que ela mesma chamou de
"o item mais delicado do plano inteiro" — por um motivo estrutural, não
de volume: não existia nenhuma primitiva de autorização por projeto, e
`accessLevel` só tinha `admin`/`staff`. Um terceiro nível checado só em
ALGUMAS rotas prometeria um escopo que não existe de verdade.

Antes de qualquer código, duas decisões de produto genuínas foram
perguntadas ao usuário (não inventadas): (1) o que um consultor externo
pode FAZER — escolhido **só leitura**; (2) como ele entra na plataforma,
já que não tem e-mail `@studioaraci.com.br` — escolhido **magic link por
e-mail**. As duas respostas mudaram a arquitetura pra melhor: em vez de
retrofitar checagem de participação em dezenas de rotas internas já
existentes (o único jeito de fazer "enforcement em toda rota" funcionar
com um `accessLevel` novo), a solução virou um **portal totalmente
separado**, mesmo modelo já provado duas vezes neste projeto (portal do
cliente, link de apresentação): o consultor nunca é um `User`, nunca fala
com a API de staff, e só tem acesso a um punhado de rotas próprias,
todas de leitura. Não tem como uma rota interna "esquecer" de proteger
algo que o consultor simplesmente não consegue chamar.

- **`ExternalCollaborator`** — identidade separada de `User`, mesma
  separação que `Client` já tem hoje. **`CollaboratorProjectAccess`** é o
  convite em si: sem uma linha aqui pra (consultor, projeto), o consultor
  não vê aquele projeto, mesmo já autenticado — é o que torna "escopado
  por projeto" verificável, não só prometido. `CollaboratorMagicLink`/
  `CollaboratorSession` são cópias deliberadas (não generalizadas) de
  `ClientMagicLink`/`ClientSession` — duplicação proposital pra não
  arriscar o código de login do cliente, já testado e em produção.
- **Convite (admin-only)**: `POST /projects/:id/collaborators` — cria o
  `ExternalCollaborator` se não existir (por e-mail, reaproveitado entre
  projetos) e o `CollaboratorProjectAccess`; idempotente (convidar de
  novo pro mesmo projeto não duplica). `DELETE .../collaborators/:id`
  revoga só aquele projeto, sem apagar a identidade do consultor (ele
  pode continuar noutro). Seção "Consultores externos" nova na tela do
  projeto, ao lado de Office/Equipe.
- **Portal do consultor (`/colaborador`)** — login por magic link (15min,
  uso único) igual ao do cliente; sessão de 7 dias em cookie httpOnly.
  Lista só os projetos com convite ativo; a tela do projeto mostra
  cronograma, gate de cada fase, tarefas e notas — **sem** budget de
  fase, sem Invoice, sem Proposal, sem `costPerHour` de ninguém.
- **403, não 401, pra "sem acesso a este projeto"** — distinção
  deliberada: a sessão em si continua válida (`resolveSession` já
  passou), só não abrange aquele projeto. 401 levaria de volta pro
  login sem necessidade; 403 mostra "sem acesso" sem derrubar a sessão.
- Verificado: build+typecheck limpos (api e web); smoke suite 314/315
  (17 novas asserções: convite idempotente, `@AdminOnly` barrando staff,
  magic link de uso único, sem-enumeração no request-link, escopo por
  projeto nos dois sentidos — inclui só o convidado E nega acesso a quem
  não foi —, projeção sem campo financeiro, e o 403 pós-revogação com
  sessão ainda válida), mesma falha pré-existente de sempre
  (`ASAAS_API_KEY`); `CollaboratorProjectAccess.projectId` sem
  `onDelete: Cascade` (mesmo padrão de `Allocation`/`Absence`) — cleanup
  do smoke test ajustado antes que travasse um run futuro. Fluxo completo
  testado de ponta a ponta no navegador contra o projeto/consultor
  descartável: convite pela tela do projeto, login real pelo magic link,
  cronograma visível e financeiro ausente na tela do consultor, revogação
  pela tela do projeto, e a mesma sessão do consultor perdendo acesso na
  hora (403, sem crash, sem precisar logar de novo) — limpo depois.

## Correção — Checklist de documentos obrigatórios amarrado ao gate do PEP

Última lacuna da matriz de comparação com concorrentes (segunda auditoria
externa) ainda em aberto: a aprovação de gate de uma fase (`approvedAt`)
não checava se os documentos que o estúdio considera obrigatórios pra
aquele estágio (contrato assinado, aprovação de conceito, etc.) já
estavam de fato vinculados no Drive do projeto — o gate aprovava mesmo
sem nada anexado.

Decisão de design tomada sem precisar perguntar ao usuário (ao contrário
da janela de retenção e do ambiente de NFS-e, que são decisão de negócio
genuína): a exigência é configurada **uma vez por estágio do PEP, no
nível da conta** (`RequiredDocumentType`, mesma forma de `RoleRate`/
`StudioFixedCost`), não por instância de projeto — o processo do estúdio
é uniforme entre projetos, então reconfigurar isso a cada projeto novo
seria retrabalho sem propósito. Off-by-default e aditivo, como toda
config nova nesta sessão: nada configurado = gate aprova exatamente como
sempre aprovou.

- **`RequiredDocumentType`** (`accountId`, `stage`, `documentType`,
  `@@unique([accountId, stage, documentType])`) — CRUD admin-only em
  `/required-document-types`, tela nova "Documentos" no menu (admin-only).
- **`PhasesService.getDocumentChecklist`** — pro estágio da fase, cruza a
  lista configurada contra os `OfficeLink` da fase (`phaseId`,
  `documentType` preenchido, `brokenAt: null`); devolve `[]` (nada
  bloqueia) quando o estágio não tem nenhuma exigência cadastrada.
  Integrado em `approvePhaseGate`: item faltando → `422
  MISSING_REQUIRED_DOCUMENTS` com a lista dos tipos que faltam, antes de
  gravar `approvedAt`.
- **`GET .../document-checklist`** — nova rota, consumida pela tela do
  projeto pra mostrar um preview ✓/✗ logo acima do formulário de
  aprovação de gate, só nas fases contratadas e ainda não aprovadas (as
  únicas onde o checklist pesa de verdade).
- **Datalist de sugestão** no campo "tipo de documento" da classificação
  de `OfficeLink` (`office-links-section.tsx`) — sugere os tipos já
  cadastrados como exigência, mas o campo continua livre (texto solto
  também é aceito, igual antes).
- Verificado: build+typecheck limpos (api e web, rota
  `/documentos-obrigatorios` presente no build do Next); Jest 21/21;
  smoke suite 322/323 (6 novas asserções: criar exigência, 409 pro mesmo
  par estágio+tipo, checklist mostrando não-satisfeito antes de
  qualquer vínculo, 422 `MISSING_REQUIRED_DOCUMENTS` ao tentar aprovar
  sem o documento, checklist satisfeito depois de classificar o vínculo,
  aprovação normal — 200 — com o documento presente; mais um 403 no bloco
  de permissões pra staff tentando criar exigência), mesma falha
  pré-existente de sempre (`ASAAS_API_KEY`); `cleanup-smoke-residue.ts`
  ganhou limpeza defensiva de `RequiredDocumentType` antes que sobrasse
  pra um run futuro. Fluxo completo testado no navegador contra o projeto
  fixture real ("Apto Vila Madalena"): duas exigências cadastradas pela
  tela admin (Executivo e Criação de Conceito), checklist renderizando
  "✗ aprovacao-conceito-verify" na fase Criação de Conceito, datalist
  sugerindo os dois tipos cadastrados ao classificar um `OfficeLink` —
  sem nunca aprovar o gate de verdade nesse projeto (isso já foi coberto
  pelo smoke test, no projeto descartável); as duas linhas de
  `RequiredDocumentType` criadas pra essa verificação foram apagadas no
  fim, já que são config real e persistente da conta, não dado de teste.

## Correção — Documentos visíveis ao cliente no link de apresentação

O item "grande" da lista de 11 (gestão documental por projeto),
deliberadamente adiado até agora: o cliente nunca teve como ver um
documento do Drive pela plataforma, mesmo que a equipe já marcasse
`visibleToClient=true` num vínculo (campo que existia desde aquela
rodada, mas era só metadado — nada lia). O motivo do adiamento era
estrutural, não falta de tempo: o cliente nunca tem conta Google/
Workspace do estúdio, então simplesmente linkar pro Drive não funciona
(o Google mostraria "solicitar acesso"). Precisava de uma rota de proxy
de leitura nova — o servidor baixa o conteúdo com a credencial de um
admin já conectado e repassa, sem o cliente nunca precisar de login
Google.

- **`DriveClient.downloadFile`** — nova operação na porta (mesmo padrão
  de `createFolder`/`getFile`, ver `google-drive-client.ts`): busca
  metadado (nome, mimeType) e, se for um Google Doc/Sheet/Slide nativo
  (sem bytes pra baixar via `alt=media`), exporta como PDF em vez disso
  — decisão de produto implícita de "o cliente só visualiza, nunca edita
  pelo portal".
- **`GoogleDriveService.listClientVisibleDocuments` /
  `downloadClientVisibleDocument`** — mesmo escopo de sempre
  (conta + projeto + `visibleToClient=true` + não quebrado) antes de
  sequer falar com o Drive; um vínculo que a equipe nunca marcou visível
  dá 404, não vaza que existe (mesmo padrão de `updateSpecification` no
  próprio `PublicPresentationService` pra um `specId` fora de escopo).
- **`GET /v1/present/:token`** agora também devolve `documents` (id,
  title, documentType, stage) — só os que passam no escopo acima.
  **`GET /v1/present/:token/documents/:officeLinkId`** é a rota de
  download em si: corpo binário de verdade (`StreamableFile`), não
  `{ data }` como o resto da API — por isso `@Res({ passthrough: true })`
  em vez de deixar o Nest serializar. `Content-Disposition: inline` de
  propósito: o cliente só visualiza, PDF/imagem abre direto no navegador
  em vez de forçar download.
- **Proxy no apps/web** (`present/[token]/documents/[officeLinkId]/
  route.ts`) — o navegador do cliente nunca fala com apps/api direto
  (só apps/web expõe porta pública); mesmo padrão de `lib/publicApi.ts`
  e `api/portal/data-export/route.ts`: servidor chamando apps/api,
  repassando o corpo e os headers de tipo/nome do arquivo.
- **Seção "Documentos" na tela de apresentação** (`/present/[token]`) —
  lista os documentos visíveis com título + tipo/fase como legenda (mesmo
  padrão visual de `office-links-section.tsx` do lado da equipe), cada
  um linkando pra rota de download acima.
- **Comentário obsoleto corrigido** (`public-presentation.controller.ts`)
  — dizia "a segunda (e última) rota `@Public()` do sistema, além de
  `/health`", desatualizado desde que client-portal e collaborator-portal
  vieram depois.
- Verificado: build+typecheck limpos (api e web, rota
  `/present/[token]/documents/[officeLinkId]` presente no build do Next);
  Jest 25/25 (4 novos: lista só o vínculo visível e não quebrado, baixa
  conteúdo com sucesso via `FakeDriveClient`, recusa vínculo nunca
  marcado visível, recusa vínculo visível mas já quebrado — os dois
  últimos com 404, não vazam que o recurso existe); smoke suite 327/328
  (6 novas asserções: `documents` no link público inclui só o visível e
  não quebrado, download do vínculo oculto → 404, do quebrado → 404, de
  um id inexistente → 404, do visível sem ninguém conectado ao Drive →
  422 `GOOGLE_DRIVE_NOT_CONNECTED` — mesmo critério de cobertura de
  sempre pra features que dependem do Drive de verdade, nunca testável
  fim-a-fim sem credencial real), mesma falha pré-existente de sempre
  (`ASAAS_API_KEY`). Fluxo completo testado no navegador contra o projeto
  fixture real: vínculo visível criado direto no banco (sem credencial
  Drive real conectada nesta conta, mesma limitação de sempre), seção
  "Documentos" renderizando título + tipo na tela de apresentação, clique
  abrindo a rota de download e devolvendo o erro `GOOGLE_DRIVE_NOT_CONNECTED`
  de ponta a ponta (apps/web → apps/api → GoogleDriveService) sem
  quebrar a página — confirma a integração completa até a borda que só
  uma credencial Drive real destrava; vínculo de verificação apagado no
  fim.
- **Não corrigido nesta rodada, de propósito**: cancelamento/substituição
  de NFS-e (ver "Correção — Cancelamento e substituição de NFS-e" mais
  abaixo, já fechado); exportação CAD/Revit (decisão de formato que só o
  usuário pode tomar — decidido mais adiante que não é CAD/Revit, é
  SketchUp+LayOut exportando PDF pelo pipeline de Drive já existente, ver
  "Correção — Prévia inline de documentos..." mais abaixo, já fechado);
  cálculo real de IBS/CBS por nota (padrão da
  indústria ainda não estabilizado); versionamento de documentos (expor
  revisões do Drive — ver "Correção — Versionamento de documentos do
  Drive" mais abaixo, já fechado).

## Correção — Moodboard vira quadro tldraw colaborativo (com chat)

Pedido direto do usuário, não achado de auditoria: substituir o canvas
livre próprio do moodboard (posição/tamanho de produto/amostra, ver
`MoodboardItem` no histórico do git) por um quadro **tldraw** embutido
de verdade, com sincronização ao vivo entre quem está olhando ao mesmo
tempo, mais um chat por prancha pra colaboração assíncrona. A primeira
tentativa foi Miro (API real, board provisionado por conta) — abandonada
antes de qualquer schema porque o plano free do Miro não cobre SAML SSO,
achado só depois de já ter desenhado a integração inteira; o rollback
ficou só em `schema.prisma` (nunca chegou a aplicar migration nenhuma),
sem perda de dado real.

- **Substituição do canvas**: `MoodboardItem` (posição, produto/amostra)
  removido — `Moodboard` ganhou `snapshot Json?` (o `TLStoreSnapshot` do
  tldraw, opaco pra este service: só o tldraw sabe desenhar a partir
  dele). As 4 linhas reais de `MoodboardItem` que existiam (2 em
  "Área Gourmet — Conceito 1/2", 2 em "Teste") foram dropadas com a
  migration — confirmado e aprovado explicitamente pelo usuário antes de
  aplicar, já que não tinham pra onde migrar (o novo formato não é uma
  lista de itens). As pranchas (`Moodboard`) em si sobreviveram, só sem o
  desenho antigo.
- **Nova audiência: `WhiteboardGuest`** — nem staff (Google Workspace),
  nem o `Client` do projeto, nem `ExternalCollaborator` (projeto
  inteiro, só leitura): alguém convidado só pra colaborar num QUADRO
  específico, com escrita real (desenha + comenta). Autenticado via
  **Logto** (OIDC) — decisão explícita do usuário, não um 4º magic link
  bespoke. Convite (`WhiteboardGuestAccess`, admin-only) sempre vem
  antes do login, mesmo padrão de `ExternalCollaborator`; `logtoSubjectId`
  fica null até o primeiro login (casado por e-mail nesse momento,
  travado nesse subject dali em diante). `WhiteboardGuestSession` é uma
  sessão própria da plataforma (mesmo padrão de `ClientSession`/
  `CollaboratorSession`), não o cookie/JWT do Logto em si — Logto prova
  identidade uma vez, esta tabela decide por quanto tempo isso continua
  valendo.
- **OAuth do Logto** (`/api/quadro/authorize` + `/api/quadro/callback`
  em apps/web) — mesmo esqueleto de `/api/google/authorize|callback`
  (state cookie contra CSRF, troca code→token servidor-a-servidor), com
  uma diferença: como o objetivo aqui é estabelecer identidade nova (não
  só guardar um refresh token de alguém já conhecido, caso do Google),
  o callback também chama `/oidc/userinfo` do Logto pra pegar
  email/nome/sub já verificados, sem precisar de biblioteca de
  JWT/JWKS.
- **Chat por prancha** (`MoodboardComment`) — pedido junto com a
  colaboração ao vivo. Sem FK de verdade pro autor (User/Client/
  WhiteboardGuest são três tabelas diferentes, mesmo problema que já
  tirou o comentário de prospecto de `Activity`): `authorType` +
  `authorName` (retrato do nome no momento, não referência viva).
  Exposto nos três surfaces (`/v1/moodboards/:id/comments` pra staff,
  `/v1/present/:token/moodboards/:id/comments` pro cliente,
  `/v1/whiteboard-guest-portal/boards/:id/comments` pro convidado), todos
  delegando pro mesmo `MoodboardsService`.
- **Sincronização ao vivo via Supabase Realtime** (`lib/supabaseRealtime.ts`)
  — canal de *broadcast* puro por prancha (`moodboard:{id}`), sem
  nenhuma tabela do Supabase envolvida: Postgres (via Prisma) continua
  sendo o único sistema de registro. O canvas é salvo com debounce de 2s
  (não a cada traço); o canal só acelera a entrega pra quem já está com
  a página aberta. Sem `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`
  configurados, degrada pra "sem sincronização ao vivo" (aviso no
  console, sem quebrar canvas nem chat) — verificado ao vivo no
  navegador contra o projeto fixture real, já que não há projeto
  Supabase real conectado nesta sessão.
- **`CollaborativeBoard`** — componente único (canvas tldraw + chat)
  reaproveitado nos três surfaces via duas props (`onSaveSnapshot`/
  `onAddComment`), cada chamador passando sua própria server action já
  parcialmente aplicada (`.bind()`) com o escopo certo (staff: só
  moodboardId; cliente: token + moodboardId; convidado: sessão vem do
  cookie httpOnly, nunca de um argumento).
- Verificado: build+typecheck limpos (api e web — `/api/quadro/authorize`,
  `/api/quadro/callback`, `/quadro`, `/quadro/[boardId]` presentes no
  build do Next); Jest 25/25 (inalterado, nenhum teste existente
  dependia do canvas antigo); smoke suite 342/343 (25 novas asserções:
  round-trip de snapshot, chat do staff, convite/idempotência/listagem
  de convidado, `verify-login` recusando e-mail nunca convidado — 401 —
  e aceitando o convidado — 200 —, escopo por QUADRO nos dois sentidos
  — inclui só o convidado E nega acesso a outro quadro sem convite,
  403 não 401 —, revogação com sessão ainda válida, e o mesmo teste de
  escopo/escrita pelo link de apresentação, incluindo 404 pra
  moodboardId de outro projeto), mesma falha pré-existente de sempre
  (`ASAAS_API_KEY`); `cleanup-smoke-residue.ts` ganhou limpeza de
  `WhiteboardGuestAccess` antes de `Moodboard` (mesma classe de bug que
  `CollaboratorProjectAccess` já tinha resolvido — FK RESTRICT sem
  isso) e perdeu o filtro `moodboardItems: { none: {} }` no produto
  órfão (campo que não existe mais). Fluxo completo testado ao vivo no
  navegador contra o projeto fixture real: tela do projeto renderizando
  o quadro tldraw (`.tl-container`/`.tl-canvas` confirmados no DOM) +
  chat + seção de convidados, link de apresentação renderizando o mesmo
  quadro pro cliente sem exigir login, avisos de configuração ausente
  aparecendo no console sem derrubar a página (nem Logto nem Supabase
  têm credencial real nesta sessão — mesmo limite de sempre pra
  integrações novas: "build now, credentials later").
- **Não corrigido nesta rodada, de propósito**: presença ao vivo
  (cursores de quem está olhando o quadro agora) — o pedido foi
  colaboração via canvas + chat, não presença; escopo maior, deixado de
  fora do MVP. Licença comercial do tldraw (removível o watermark
  "Made with tldraw" via plano pago/programa de startup) é decisão de
  negócio do usuário, não deste código — confirmado que a Studio Araci
  se qualifica pro uso sem marca d'água como empresa de 2 pessoas.

## Correção — Versionamento de documentos do Drive

Último item deliberadamente adiado da rodada de gestão documental
("versionamento -- expor revisões do Drive"). Escopo bem mais estreito
que os outros dois itens adiados da mesma lista (documentos visíveis ao
cliente, já fechado; checklist de documentos obrigatórios, já fechado):
o Drive já guarda o histórico de revisões de qualquer arquivo (edição
colaborativa nativa do Google Docs/Sheets, ou alguém subindo uma versão
nova por cima do mesmo arquivo) — isto só expõe o que já existe lá,
não implementa versionamento nenhum por conta própria.

- **`DriveClient.listRevisions`** — nova operação na porta (mesmo padrão
  de `getFile`/`downloadFile`), chamando `files/:id/revisions` da Drive
  API v3. `size` vem como `null` pra Google Doc/Sheet/Slide nativo (sem
  bytes, mesma característica que já existia em `downloadFile` pra
  esses tipos).
- **`GoogleDriveService.listRevisions(accountId, officeLinkId)`** —
  mesmo escopo de sempre (conta + `provider: 'DRIVE'`); um vínculo
  Calendar/Gmail ou de outra conta cai no mesmo 404 de "vínculo do Drive
  não encontrado", não um 422 à parte — Calendar/Gmail não tem revisão
  nenhuma pra listar. Devolve mais recente primeiro (a API do Drive não
  garante essa ordem).
- **`GET /v1/office-links/:id/revisions`** — staff-only, sem
  `@AdminOnly()` (ver histórico das outras rotas de OfficeLink: consultar
  taxonomia/metadado é tarefa operacional comum, diferente de convidar
  terceiro ou mexer em fiscal/financeiro).
- **UI**: botão "Ver versões" ao lado de "Classificar"/"Remover", só nos
  vínculos `provider === "DRIVE"` (Calendar/Gmail nunca mostram o botão).
  Carrega sob demanda (cache em memória — reabrir não recarrega),
  mostra data/hora, quem modificou por último e tamanho formatado
  (B/KB/MB), com um selo "fixada" pra revisão marcada `keepForever` no
  Drive.
- Verificado: build+typecheck limpos (api e web); Jest 13/13 no
  `google-drive.service.spec.ts` (3 novos: ordena mais recente primeiro
  mesmo a API devolvendo crescente, recusa vínculo que não é do Drive,
  recusa sem admin conectado); smoke suite 344/345 (2 novas asserções:
  422 `GOOGLE_DRIVE_NOT_CONNECTED` sem ninguém conectado, 404 pra um
  vínculo Calendar), mesma falha pré-existente de sempre
  (`ASAAS_API_KEY`). Fluxo completo testado ao vivo no navegador contra
  o projeto fixture real: botão "Ver versões" aparecendo só no vínculo
  Drive (nunca no Calendar ao lado), clique devolvendo e exibindo o erro
  `GOOGLE_DRIVE_NOT_CONNECTED` de ponta a ponta — mesma borda de sempre
  pra tudo que depende de credencial real do Drive (esta conta não tem
  ninguém conectado com escopo `drive.file`); vínculo de verificação
  apagado no fim.

## Correção — Cancelamento e substituição de NFS-e

Último item deixado explicitamente pendente desde a rodada de NFS-e na
faturação real (Fase 3): emissão (`Autorizacao`) já existia, cancelamento
e substituição não. A biblioteca (`@nfewizard/nfse`) já expõe os dois via
`RegistrarEvento` — eventos e101101 (cancelamento simples) e e105102
(cancelamento por substituição) da SEFIN Nacional, confirmado lendo o
código-fonte instalado (`NFSeEventosService`/`LayoutPedRegEvento`), mesmo
método já usado pra `nfe`/`versaoDF` em `nfse-client.ts`.

- **Cancelamento simples** (`NfseService.cancelarParaFatura`) — evento
  e101101, motivo fechado da SEFIN (`cMotivo`: 1 erro na emissão, 2
  serviço não prestado, 9 outros) + justificativa livre. Não emite nada
  novo: `nfseChaveAcesso` continua com a chave cancelada (histórico),
  `nfseCanceladaEm` marca que ela não vale mais. `emitirParaFatura`
  ganhou uma exceção no guard de idempotência: `nfseChaveAcesso &&
  !nfseCanceladaEm` agora bloqueia reemissão (antes bastava
  `nfseChaveAcesso`) — depois de cancelada, reemitir do zero é legítimo.
- **Substituição** (`NfseService.substituirParaFatura`) — não é uma
  chamada só: emite a DPS corrigida **primeiro** (nDPS diferente da
  original, `stableNumeroDps` ganhou um parâmetro `variant` pra isso),
  persiste a nova chave imediatamente (documento fiscal real, nunca pode
  ficar só na memória), e só então cancela a antiga referenciando a nova
  (evento e105102, `chNFSeSubst`). Se o segundo passo falhar, a nova
  NFS-e já emitida não é perdida — fica registrada com
  `nfseRejectionReason` explicando que a antiga continua tecnicamente
  ativa até alguém repetir o cancelamento (fail loud, não esconde a
  inconsistência atrás de um 200).
- **`Invoice.nfseChaveAcessoAnterior`** — nova coluna, preenchida tanto
  numa substituição quanto numa reemissão pós-cancelamento simples: nunca
  deixa uma chave superada se perder, mesmo sobrescrevendo
  `nfseChaveAcesso` com a nova.
- **UI**: motivo (select) + justificativa (texto) pra cancelar, só
  justificativa pra substituir (o evento e105102 não tem `cMotivo`/
  `xMotivo` livre como o e101101 — a SEFIN trata "foi substituída" como
  motivo suficiente por si só; a justificativa aqui é só pro nosso
  próprio registro). "Emitir nova NFS-e" substitui "Emitir NFS-e" depois
  de cancelada; linha de detalhe mostra data/motivo/justificativa do
  cancelamento.
- **Achado real em teste** (Homologação, SEFIN Nacional): `dhEvento`
  (evento) é do tipo `TSDateTimeUTC` no schema, que rejeita fração de
  segundo (E1235) — diferente de `dhEmi` na DPS de autorização, que
  aceita milissegundos com o mesmo padrão `.toISOString()`. Só
  descoberto rodando de verdade contra o webservice real; corrigido
  truncando pra segundos inteiros antes de montar o evento.
- Verificado: build+typecheck limpos (api e web); Jest 28/28 (sem
  regressão, nenhum teste existente dependia do guard antigo de
  `emitirParaFatura`); smoke suite 349/350 (5 novas asserções — guards
  de `NFSE_NOT_ISSUED`/`NFSE_ALREADY_CANCELED`/validação de motivo, todas
  curto-circuitando antes do certificado, mesmo precedente de sempre),
  mesma falha pré-existente (`ASAAS_API_KEY`). **Verificado de ponta a
  ponta contra a Homologação real da SEFIN Nacional** (certificado A1
  real já configurado neste ambiente) via `verify-nfse-invoice.ts`
  estendido: emitir → cancelar (evento aceito, "Processado com
  sucesso") → tentar cancelar de novo (422) → reemitir do zero (nova
  chave, antiga preservada em `nfseChaveAcessoAnterior`) → substituir
  (nova DPS autorizada + antiga cancelada por substituição) — os 4
  passos reais confirmados um a um, não só os guards; achado do
  `dhEvento` só apareceu nessa verificação real, nunca apareceria com
  fake de porta. UI verificada no navegador contra o projeto fixture
  real com estado simulado via Prisma (nunca uma emissão de verdade na
  fatura persistente): formulários de cancelar/substituir aparecendo
  certo com NFS-e ativa, badge "NFS-e cancelada" + linha de detalhe +
  botão "Emitir nova NFS-e" aparecendo certo depois de cancelada —
  revertido ao estado original no fim.

## Correção — Prévia inline de documentos no link de apresentação (plantas do SketchUp LayOut)

Pedido direto do usuário: o estúdio abandonou exportação CAD/Revit —
fluxo real é SketchUp + **LayOut**. Correção do próprio usuário depois da
primeira rodada: o PDF exportado do LayOut é só um passo **interno**
intermediário (editado no Illustrator em seguida — Photoshop não lida
bem com PDF vetorial); o cliente nunca vê esse PDF, só a **imagem final**
(PNG/JPEG) exportada do Illustrator. Perguntado se isso precisava de um
pipeline novo (upload próprio, galeria dedicada) ou se reaproveitava o
que já existe: reaproveita — a imagem final do Illustrator é só mais um
arquivo no Drive do projeto, já coberto de ponta a ponta pelo item
"documentos visíveis ao cliente" fechado antes nesta sessão (upload no
Drive → classificar com `documentType` livre, ex. "planta" → marcar
`visibleToClient`). Nenhum código de backend novo — só a apresentação
ganhou prévia embutida em vez de exigir abrir em outra aba:

- **`present/[token]/page.tsx`** — PDF (`<iframe>`) ou imagem (`<img>`)
  renderizados inline pra cada documento visível, com "Abrir em nova aba"
  ainda disponível ao lado. O ramo PDF continua existindo pra outros
  documentos que legitimamente são PDF pro cliente (contrato, ART), não
  pra planta. Sem `mimeType` guardado no `OfficeLink` (só existe no
  momento do download, ver `GoogleDriveService.downloadFile`): a decisão
  de qual prévia mostrar vem da extensão no título (`.pdf`/`.png`/`.jpg`/
  etc.), sinal disponível sem baixar o arquivo inteiro só pra decidir
  como exibir. Link puro (extensão desconhecida) cai no comportamento de
  antes — só o link, sem prévia.
- Verificado: build+typecheck limpos; ao vivo no navegador contra o
  projeto fixture real, um vínculo Drive com título terminando em `.pdf`
  rendeu o `<iframe>` corretamente, e um segundo vínculo com título
  terminando em `.jpg` (simulando a imagem final do Illustrator) rendeu o
  `<img>` corretamente — ambos com `src` apontando pro proxy de download
  já existente; os dois vínculos de verificação apagados no fim.

## Correção — IBS/CBS: regra de negócio registrada, cálculo ainda não

Não é código -- é contexto de negócio confirmado pelo usuário que
precisava ficar registrado antes de esquecer: **MEI paga 0% de IBS/CBS**
(isento, mesmo espírito do DAS-MEI hoje); **depois de ME**, arquitetura/
engenharia paga, mas com **redução de 30%** pela LC 214/2025. Isso
sozinho ainda não é uma alíquota pronta pra codificar — IBS/CBS têm
cronograma de transição por ano (2026→2033), então falta a alíquota
efetiva (CBS%+IBS%) confirmada pela consultoria contábil pra cada
competência antes de `totTrib` sair do zero deliberado em
`nfse-invoice-dps.ts`. Registrado em
`docs/fase-0/decisoes-pos-descoberta.md` §4 pra não se perder até esse
número existir.

## Correção — Alíquota efetiva de CBS/IBS: campo de disclosure ligado (2026)

Continuação direta do item acima, mesma sessão: o usuário trouxe uma
tabela do cronograma de transição da LC 214/2025 (fonte: AI Overview do
Google, não confirmada por contador) e decidiu explicitamente usar o
valor da fase de teste 2026 desde já, dado que `totTrib` é só disclosure
(Lei da Transparência Fiscal 12.741/2012) — não muda `vServ` nem o que é
de fato recolhido, então o risco de uma estimativa aqui é bem menor do
que seria num campo que afeta cobrança/arrecadação real.

- **`Account.cbsIbsEffectiveRatePercent`** (`Decimal`, default `0.0070` =
  0,70% = 0,9% CBS + 0,1% IBS da fase de teste 2026, já com a redução de
  30%) — campo de conta (não constante no código), pra o próprio estúdio
  atualizar ano a ano (2027/2029/2030/2033) sem precisar de deploy, mesmo
  espírito do `nfseAmbiente` já existente. Editável em `/financeiro`
  (`updateCbsIbsRate`), input em pontos percentuais convertido pra fração
  no server action.
- **`buildInvoiceDps`** (`nfse-invoice-dps.ts`) agora recebe
  `cbsIbsEffectiveRatePercent` e calcula `vTotTribFed = vServ × alíquota`
  (arredondado a 2 casas). Reportado inteiro em `vTotTribFed`: CBS é
  federal e é o componente dominante da fase de teste (0,9 dos 1,0 p.p.
  antes da redução); a divisão exata entre IBS estadual e municipal
  depende de Resolução do Senado ainda não definida, então não inventamos
  esse split — mesmo espírito de "não confiável" que já valia pro zero
  total antes desta correção.
- **Achado real ao construir a UI**: `defaultValue={Number(...) * 100}`
  produzia `0.7000000000000001` (erro de ponto flutuante de
  `0.007 * 100`) em vez de `0.7` no input — visível só testando no
  navegador contra a conta real, não no build/typecheck. Corrigido
  arredondando a 2 casas antes de exibir.
- Verificado: build+typecheck limpos (api e web); Jest 28/28; smoke suite
  348/349 passaram (mesmas duas falhas pré-existentes de sempre —
  `ASAAS_API_KEY` real configurada localmente, e um teste de dedupe de
  Opportunity sensível ao volume acumulado de dados de teste no banco de
  dev — nenhuma das duas relacionada a esta mudança); **script real
  contra a Homologação da SEFIN Nacional** (`verify-nfse-invoice.ts`)
  emitiu, cancelou, reemitiu e substituiu uma NFS-e de verdade com
  `vTotTribFed` calculado (não mais zero) — SEFIN aceitou normalmente;
  testado ao vivo no navegador contra a conta real: campo mostra `0,7`,
  salvar `1,55` persiste e volta corretamente no reload, revertido pra
  `0,7` (valor real da fase de teste 2026) ao final da verificação.

## Correção — passada de revisão própria (não auditoria): 3 achados reais

Com as duas auditorias externas fechadas, pedido do usuário pra uma
passada de qualidade própria (não motivada por nenhum achado de fora)
sobre 4 áreas construídas nesta sessão: colaboração do moodboard
(tldraw+Logto+Supabase), cancelamento/substituição de NFS-e, prévia de
documentos no link de apresentação, e alocação/planejamento de
capacidade. As três primeiras vieram limpas; alocação teve dois achados
reais, mais um achado real separado no moodboard:

- **`lib/allocations.ts` (`sweepPeak`) — empate de sweep-line dependia da
  ordem do array, não do tipo de evento**: `events.sort((a, b) => a[0] -
  b[0])` só ordena por instante. Quando uma alocação termina exatamente
  quando outra começa (agenda "encostada", sem sobreposição real —
  ex.: A até 15/jan, B a partir de 15/jan), o desempate ficava a cargo da
  ordem de inserção no array, não de qual evento é fim (`-horas`) e qual
  é início (`+horas`). Dependendo da ordem, o pico calculado (usado tanto
  em `peakHoursPerWeek` quanto `peakHoursInWindow`, que alimentam o aviso
  de sobrecarga em `/team/planning` e a sugestão de disponibilidade em
  `AllocationForm`) contava as duas alocações como simultâneas por um
  instante, inflando o pico sem sobreposição real nenhuma. Corrigido
  desempatando fim antes de início no mesmo instante (`a[1] - b[1]` como
  segundo critério do sort).
- **`AllocationsController` sem `@AdminOnly()`, apesar do próprio
  `AllocationsService` documentar a intenção**: o comentário em
  `createAllocation` já dizia "alocação é decisão de quem gerencia o
  time, não do próprio colaborador" (mesmo espírito de
  `RoleRatesController`), mas faltava o guard de fato — qualquer staff
  autenticado conseguia criar ou remover alocação de qualquer colega em
  qualquer projeto. Corrigido com `@AdminOnly()` em `create`/`remove`
  (nível de método, mesmo padrão de `ProjectsController.remove` — não a
  classe inteira, porque `list` continua sendo a agenda compartilhada do
  time, staff também precisa ver quem está alocado onde em
  `/team/planning`). Lado do `apps/web`: `AllocationPlanningPage` agora
  busca `/me` e só renderiza `AllocationForm` e o botão "Remover" (em
  `AllocationViews`/`ListaView`) pra admin — sem isso, um staff veria um
  formulário que só resultaria em 403 ao enviar.
- **`CollaborativeBoard` (moodboard) — último traço perdido ao navegar
  pra outra rota**: o cleanup do efeito de auto-save (debounce de 2s)
  fazia só `clearTimeout(saveTimeout)` no unmount, nunca descarregava o
  save pendente. Desenhar algo e navegar pra outra tela dentro da janela
  de debounce descartava esse traço em silêncio, sem persistir nem
  avisar. Corrigido: o cleanup agora chama `flush()` (o mesmo
  `onSaveSnapshot(getSnapshot(store).document)` que o timeout chamaria)
  antes de limpar, se havia um save pendente. Fecho de aba/refresh
  continua fora do alcance disto, de propósito — exigiria
  `beforeunload` + `sendBeacon`, e `onSaveSnapshot` é uma server action
  (fetch), não compatível com beacon sem reescrevê-la; registrado como
  lacuna residual, não resolvido nesta passada.
- **Não é achado de ação, só observação**: a prévia de imagem em
  `present/[token]/page.tsx` não trata `onError` do `<img>` (um link do
  Drive quebrado renderiza o ícone de imagem quebrada do navegador, sem
  contexto) — baixa severidade (só afeta o caminho de falha de um caso já
  estreito), citado aqui pra não se perder, não corrigido nesta rodada.
- Verificado: build+typecheck limpos (api e web); Jest 28/28; smoke suite
  348/349 (mesmas duas falhas pré-existentes de sempre, nenhuma
  relacionada); mecanismo do guard confirmado lendo
  `auth.guard.ts#canActivate` — `reflector.getAllAndOverride` checa
  `getHandler()` antes de `getClass()`, então `@AdminOnly()` em método
  (não na classe) funciona exatamente como em `ProjectsController.remove`,
  já provado em produção; testado ao vivo no navegador contra a conta
  real (admin): formulário e botão "Remover" aparecem normalmente. Não
  testado ao vivo com uma sessão de staff não-admin real (evitado
  rebaixar a conta admin real da conta fixture só pra esse teste) — a
  cobertura ficou na leitura do mecanismo do guard, não numa chamada real
  negada.

## Correção — revisão de segurança própria (boas práticas), 3 achados + endurecimento

Pedido do usuário depois das auditorias externas fecharem: passada de
segurança sobre o que existe hoje. Lido de verdade (não por amostragem):
`auth.guard.ts`, todas as rotas `@Public()`, os dois proxies do apps/web,
a criptografia de credencial, e o ciclo de vida de token/sessão dos três
portais. Revisão estática — nada foi explorado de fato.

- **ALTO — o canal Realtime do quadro era PÚBLICO.** Canal público no
  Supabase não aplica autorização nenhuma, e a anon key é pública por
  desenho (vai no bundle). Com a anon key + um `Moodboard.id` (que não é
  segredo: aparece em `/quadro/{id}` e na resposta da API pública de
  apresentação), qualquer pessoa conseguia (a) escutar todo traço e todo
  comentário ao vivo sem convite/token/login e (b) transmitir patches e
  comentários forjados pra todo mundo com o quadro aberto — inclusive
  assinando comentário com o nome de outra pessoa. Detalhe que importa
  pra dimensionar: shape injetado não era salvo direto (o listener de
  auto-save é `source: "user"` e `mergeRemoteChanges` marca como remoto),
  mas virava permanente no instante em que alguém legítimo desenhasse
  qualquer coisa, porque `getSnapshot(store)` captura a store inteira.
  Corrigido em duas frentes: **canal privado** (`config: { private: true }`)
  com JWT curto (2h) escopado a UM quadro, assinado no servidor
  (`lib/supabaseBoardToken.ts`) só DEPOIS que a superfície já autorizou a
  pessoa naquele quadro — staff pela sessão NextAuth, cliente pelo token
  do link, convidado pela sessão do Logto; e **o canal deixou de carregar
  conteúdo de comentário**, só avisa que houve um (`{kind:"comment"}` sem
  payload) e quem recebe busca no apps/api, que é quem sabe de fato quem
  escreveu. Mesmo com canal privado isso importa: participante legítimo
  ainda pode montar a mensagem que quiser.
- **MÉDIO — `email_verified` nunca era checado no login do convidado
  (Logto).** O convite é casado POR E-MAIL na primeira entrada, e a
  partir daí `logtoSubjectId` fica gravado de forma permanente. Se o
  tenant do Logto permitir cadastro sem verificar e-mail, alguém que
  registrasse o e-mail de um convidado assumiria o acesso ao quadro dele
  — e ainda o trancaria pra fora pra sempre ("já vinculado a outra conta
  de login"). Corrigido exigindo `email_verified === true`.
- **MÉDIO — o limite de taxa era um balde único, não por chamador.** O
  `ThrottlerGuard` do apps/api chaveia por IP de origem, mas só o
  apps/web chama lá (servidor-a-servidor): todo request vem do mesmo IP.
  Ou seja, nunca limitou atacante nenhum (o IP dele nem aparecia) e ainda
  era risco de disponibilidade — 300/min era um teto do estúdio inteiro,
  um laço numa página daria 429 pra todo mundo. E a superfície que um
  estranho de fato alcança (rotas do apps/web) não tinha limite nenhum.
  Corrigido movendo o limite pra onde o IP é real: `apps/web/src/proxy.ts`
  (por IP, por rota — formulário de lead e pedido de magic link em 10/min,
  troca de token em 30/min, webhooks em 120/min pra não derrubar retry
  legítimo de Asaas/ZapSign). O teto do apps/api virou sanidade (3000/min).
  Em memória de propósito: o apps/web no Render é instância única
  (`render.yaml`, plan starter) — se um dia escalar horizontalmente isso
  vira "por instância" e precisa de contador compartilhado, registrado no
  próprio arquivo. O `x-forwarded-for` é lido do FIM da lista (o que o
  proxy do Render anexou), não do começo, senão o cliente trocaria de
  "IP" a cada request e escaparia do limite.
- **Endurecimento (baixo, nenhum explorável hoje)**: allowlist de
  segmentos no proxy BFF (`..` codificado escaparia do prefixo `/v1/`;
  inofensivo hoje porque fora de `/v1` só existe `/health`, mas é
  armadilha pra próxima rota nova); `state` do OAuth agora comparado em
  tempo constante nos dois callbacks (Google e Logto), alinhando com o que
  os webhooks do apps/api já faziam; e **logout passou a revogar a sessão
  no servidor** nos três portais — antes só apagava o cookie, o token
  seguia válido por até 7 dias, então quem tivesse copiado ele antes
  continuava dentro.
- **`snapshot: z.unknown()` — investigado depois e RESOLVIDO: não é
  vulnerabilidade.** Na primeira passada isto ficou como "vale
  investigar" (não tinha conferido o código do tldraw). Conferido depois,
  lendo `node_modules` de verdade + teste empírico dos validadores.
  Importa porque quem escreve snapshot inclui o CLIENTE (posse do link de
  apresentação) e quem abre o mesmo quadro inclui a EQUIPE — um sink que
  executasse script ali seria escalada de cliente → sessão de staff.
  Duas camadas independentes seguram:
  1. **Validação de schema roda nos nossos caminhos**: `Store.put`
     valida todo record (`schema.validateRecord`), e tanto `loadSnapshot`
     quanto o `mergeRemoteChanges` do broadcast passam por lá. Os
     validadores `linkUrl` (bookmark/geo/note) e `srcUrl` (image/video)
     só aceitam `http:`/`https:`/`mailto:` e `http:`/`https:`/`data:`/
     `asset:` respectivamente. Testado de fato: `javascript:...`,
     `JaVaScRiPt:...` (variação de caixa — o validador normaliza antes de
     comparar), `data:text/html,<script>` e `vbscript:` **todos
     rejeitados**; `https://` e `data:image/png` aceitos.
  2. **O único campo sem validação de protocolo é o `url` do embed**
     (`T.string`), e ele é renderizado dentro de um `<iframe sandbox>`.
     Pra URL desconhecida (qualquer coisa que um atacante coloque) vale
     `unknownEmbedShapePermissionOverrides`: `allow-same-origin: false`,
     `allow-popups: false`, `allow-forms: false` (mais
     `allow-modals: false` do default). Origem opaca — mesmo que algo
     rodasse lá dentro, não alcança nosso DOM, cookie nem storage.
  - **Risco residual honesto (não é execução de código)**: quem pode
    escrever no quadro consegue criar um embed apontando pra uma URL
    https arbitrária, que renderiza conteúdo de terceiro dentro do quadro
    pra quem abrir. Sandbox impede formulário/popup/same-origin, então
    não dá pra colher credencial direto, mas dá pra EXIBIR o que quiser —
    superfície de phishing/impersonação, não XSS. Se isso incomodar, a
    correção é tirar `EmbedShapeUtil` de `defaultShapeUtils` (decisão de
    produto: perde-se embutir referência de Pinterest/YouTube no
    moodboard), não uma correção técnica pendente.
- **Registrado, não corrigido**: a prévia de imagem em
  `present/[token]/page.tsx` continua sem `onError` (link do Drive morto
  vira ícone quebrado sem contexto).
- **Auditado e sem achado** (registrado pra não reauditar à toa):
  negação por padrão no `AuthGuard` (`APP_GUARD` global, `@Public()` como
  única saída, e cada rota pública reconferindo o próprio token no
  service); nenhum IDOR — `downloadClientVisibleDocument` escopa por
  accountId + entityType + entityId + `visibleToClient` + `brokenAt`, e
  `getOwnMoodboardAccountId`/`getOwnOpportunityAccountId`/`requireAccess`
  fazem o equivalente; criptografia do refresh token correta (AES-256-GCM,
  IV aleatório por operação, authTag verificado, tamanho da chave
  validado); magic link de uso único, TTL de 15min, sem enumeração, token
  de 122 bits; cookies httpOnly + secure em prod + SameSite=Lax + path
  escopado; os dois proxies repassam allowlist explícita de header (não dá
  pra contrabandear `x-api-key` pelo navegador); escalação de privilégio
  barrada (`accessLevel`/`costPerHour` removidos do PATCH de não-admin,
  `costPerHour` redigido na leitura); segredo de webhook comparado em
  tempo constante; SQL cru só um `SELECT 1` estático; sem
  `dangerouslySetInnerHTML`/`eval`; nenhum segredo versionado.
- Verificado: build+typecheck limpos (api e web); Jest 28/28; smoke suite
  **352/349→352 passaram, 2 falharam** (as mesmas duas pré-existentes de
  sempre), com **4 asserções novas que provam a revogação de sessão**:
  sessão nova funciona → logout → **mesmo token passa a dar 401** →
  e as outras sessões do mesmo cliente continuam valendo. Limite de taxa
  testado ao vivo contra o servidor real: 36 requisições em
  `/portal/verify` deram exatamente **30× 307 e 6× 429**, o corte no
  número certo.
- **Canal privado verificado de ponta a ponta contra o Supabase real**
  (o usuário configurou `SUPABASE_JWT_SECRET` e aplicou a policy):
  - **Codificação do segredo confirmada por experimento, não por
    suposição**: a anon key existente foi verificada contra o segredo nas
    duas interpretações possíveis — como UTF-8 cru **valida**, como
    base64 decodificado não. Ou seja `TextEncoder().encode(secret)` em
    `mintBoardRealtimeToken` já estava certo (e, de quebra, confirma que
    o segredo é mesmo deste projeto: o `ref` da anon key bate com a URL).
  - **Antes da policy**: os dois tópicos (autorizado e não autorizado)
    recusados — `Unauthorized: You do not have permissions to read from
    this Channel topic`. Fail-closed, a direção segura: modo privado já
    valendo, JWT aceito como bem assinado, e nada passando ainda.
  - **Depois da policy**: tópico que o token autoriza → `SUBSCRIBED`;
    **outro tópico com o mesmo token → continua `Unauthorized`**. Os dois
    lados importam: o primeiro prova que a policy não ficou apertada
    demais, o segundo que não ficou frouxa. Escopo por quadro é real,
    não presumido.
  - **Na aplicação de verdade** (não só no script): página de
    apresentação recarregada, canal do quadro real entra sem erro —
    antes da policy ela reclamava a cada ~15s, depois ficou limpa.
  - `alter table realtime.messages enable row level security` **não pode**
    entrar no arquivo de policy: a tabela é do papel
    `supabase_realtime_admin`, então o SQL Editor devolve
    `42501: must be owner of table messages` (achado rodando de verdade).
    Também é desnecessário — o Supabase já entrega RLS habilitado ali.
  - Achado colateral: falhar em entrar no canal era **100% silencioso**.
    O quadro seguia salvando (isso vai pelo apps/api, não pelo canal),
    mas "não sincroniza pro outro" não deixava pista nenhuma. Agora o
    `subscribe` tem callback que avisa no console apontando a causa mais
    provável (policy não aplicada).

## Correção — deriva de configuração entre o código e o blueprint do Render

O usuário confirmou que tem conta no Render, então valia conferir o que
a rodada de bloqueadores tinha deixado explicitamente por validar. Sem
Docker nesta máquina não dá pra rodar `docker build` de verdade — mas o
modo de falha mais provável de um Dockerfile é caminho de `COPY` errado,
e isso dá pra conferir contra os artefatos de build que existem no
disco. Os caminhos estão todos certos (`.next/standalone/apps/web/
server.js`, `.next/static`, `public`, `apps/api/dist/main.js`).

O que a conferência achou de verdade foi outra coisa, pior e silenciosa:
**o blueprint e o Dockerfile ficaram para trás do código.** `render.yaml`
foi escrito antes do quadro colaborativo existir, e ninguém voltou.
Comparando `grep process.env` no código com o que os manifestos
declaram, faltavam **6 variáveis** no apps/web:

- `LOGTO_ENDPOINT` / `LOGTO_APP_ID` / `LOGTO_APP_SECRET` — sem elas o
  login do convidado do quadro simplesmente não funciona em produção.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — estas
  são as piores: valor `NEXT_PUBLIC_*` é **congelado no bundle em tempo
  de build**, então a imagem sairia com `undefined` embutido e a
  sincronização ao vivo nasceria morta — e **não daria pra consertar
  pelo painel do Render depois**, porque não é lido em runtime. Exigiria
  rebuild. Faltavam tanto como `ARG` no Dockerfile quanto no
  `render.yaml`.
- `SUPABASE_JWT_SECRET` — sem ela o canal privado não recebe token e o
  quadro degrada pra sem sincronização.

E `turbo.json` listava só as três `NEXT_PUBLIC_GOOGLE_*` no `env` do
build: faltavam as duas do Supabase e o `NEXT_PUBLIC_SENTRY_DSN`. Isso é
exatamente o bug que o comentário daquele bloco descreve, só que
silencioso duas vezes — cache do turbo servindo bundle velho, e o valor
congelado sem conserto em runtime.

- **Aviso de build adicionado** (`apps/web/Dockerfile`): esta classe de
  bug não falha, ela passa. Agora o build imprime um aviso nomeando cada
  `NEXT_PUBLIC_*` vazia e o que especificamente quebra por causa dela.
  Não derruba o build de propósito — `NEXT_PUBLIC_SENTRY_DSN` vazia é
  legítima (no-op), e Supabase vazio degrada em vez de quebrar; mesma
  divisão obrigatório/recomendado que `main.ts` já usa.
- **`ZAPSIGN_SANDBOX_API_TOKEN` ausente do `render.yaml` é correto**, não
  esquecimento: `ZAPSIGN_ENV` está fixo em `production` ali, então
  `zapsign-client.ts` nunca lê o token de sandbox naquele ambiente.
  Registrado pra não "corrigir" isso por engano numa próxima conferência.
- **Decisão de produto registrada**: o usuário optou por **manter** o
  `EmbedShapeUtil` (referências do Pinterest/YouTube no moodboard),
  aceitando a superfície de conteúdo de terceiro descrita na seção da
  revisão de segurança — sandbox sem `allow-same-origin`, sem formulário
  e sem popup, logo exibição arbitrária mas não execução de código nem
  captura de credencial.
- Verificado: `turbo.json` continua JSON válido e o build do apps/web
  passa depois da mudança; comparação código × manifesto refeita no fim,
  **zero variáveis faltando** nos dois apps e zero `NEXT_PUBLIC_*` sem
  `ARG` correspondente.
- **Continua NÃO verificado** (precisa de Docker, que não existe nesta
  máquina, e da conta Render de verdade): o `docker build` em si, e se o
  Render de fato repassa `envVars` como **build arg** pro Docker — que é
  o ponto exato de que os `NEXT_PUBLIC_*` dependem. Se não repassar, eles
  precisam ser declarados como build arg no painel/serviço, senão caem no
  aviso novo do Dockerfile e a feature nasce quebrada. É a primeira coisa
  a conferir no primeiro deploy real.

## Correção — Arquivamento do XML fiscal no Drive + redesenho da substituição de NFS-e

Pergunta direta do usuário sobre o deploy: "quando gerando uma NFS-e, não
deveria também gerar um XML que é enviado ao Drive?" Investigação (lendo o
código-fonte instalado de `@nfewizard/nfse`, não só o README) confirmou
que sim — a resposta de `Autorizacao`/`RegistrarEvento` já vem com o XML
assinado de verdade (`nfseXmlGZipB64`/`eventoXmlGZipB64`, gzip+base64), a
lib até salva em disco por padrão, mas isso nunca era usado: no container
do Render o disco é efêmero (some no redeploy) e nada no app lia de volta
mesmo localmente.

- **`GoogleDriveService.archiveFiscalXml`** (novo) — reaproveita o
  pipeline de Drive já existente (mesma árvore de pastas por projeto) em
  vez do disco `araci-fiscal-xml` do Render (mantido por decisão do
  usuário, mas sem nenhum código escrevendo nele). Cria um `OfficeLink`
  com `documentType: 'nfse'`, `visibleToClient: false` — decisão do
  usuário: arquivo fiscal é uso interno, nunca aparece no link de
  apresentação do cliente.
- **`Invoice.nfseXmlArchiveError`** (nova coluna, migration
  `20260830015651_add_nfse_xml_archive_error`) — nunca bloqueia a ação
  fiscal em si (decisão do usuário: a NFS-e já está autorizada/cancelada
  de verdade na SEFIN nesse ponto; falhar a resposta por causa do Drive
  seria errado). `null` = arquivado com sucesso; string = motivo da falha,
  registrado em vez de escondido — mesmo espírito de
  `nfseRejectionReason`. Wired nos três fluxos (emitir/cancelar/
  substituir), decisão do usuário de cobrir os três de uma vez.

**Verificando o arquivamento, achado um bug fiscal real e sério** — o
existente `verify-nfse-invoice.ts` nunca conferia `nfseRejectionReason`
depois de uma substituição "bem-sucedida" (só os campos da chave
nova/anterior, que já eram persistidos ANTES do segundo passo). Adicionar
essa checagem revelou que **o segundo passo (evento e105102 via
`RegistrarEvento`, cancelando a chave antiga) falhava silenciosamente em
TODA substituição já feita**, nunca detectado antes.

Rastreado por camadas, cada uma confirmada rodando de verdade contra a
Homologação da SEFIN Nacional (nunca por leitura de manual/PDF de
terceiro sozinha):

1. **Bug real em `@nfewizard/nfse` (1.0.5, versão mais nova publicada)** —
   `NFSeEventosService` tinha o mapeamento pra XML do evento e105102
   hardcoded errado (`chNFSeSubst`, campo que não existe no schema),
   descartando `cMotivo`/`xMotivo` mesmo que passados. SEFIN rejeitava com
   E1235. Sem issue aberta encontrada no repositório oficial — rascunho de
   issue preparado pro usuário abrir lá (não é nosso repositório pra
   postar diretamente).
2. **Enum errado neste app** — `cMotivo` do e105102 não é o mesmo tipo do
   e101101 (`1|2|9`); é `TSCodJustSubst`, string zero-padded de 2 dígitos
   (`"01"`–`"05"`, `"99"`). Confirmado no XSD oficial de verdade
   (`gov.br/nfse`, pacote `NFSe-ESQUEMAS_XSD-v1.01`), não um PDF de
   terceiro.
3. **Achado arquitetural, o que realmente importava**: depois de corrigir
   os dois bugs acima, SEFIN Homologação continuou rejeitando com
   `E1861`: *"O Pedido de Registro de Evento de Cancelamento de NFS-e por
   Substituição não é aceito pelo método POST da API Eventos."* — ou seja,
   **o contribuinte não pode registrar e105102 via `RegistrarEvento` de
   jeito nenhum**, não importa o payload. É evento gerado pelo próprio
   sistema municipal.

**Redesenho** (aprovado pelo usuário após o achado): o design certo, no
XSD oficial (`TCSubstituicao`), é uma **única** autorização — a DPS nova
carrega um bloco `subst: {chSubstda, cMotivo, xMotivo?}` referenciando a
chave antiga, e a própria SEFIN cancela a antiga como efeito colateral de
autorizar esta. `@nfewizard/nfse` já tinha esse campo funcionando (tanto
o tipo em `@nfewizard/types` quanto o passthrough em
`NFSeAutorizacaoService.normalizarInfDps`), só nunca tinha sido usado.

- `InvoiceDpsInput.substituicao` (novo, `nfse-invoice-dps.ts`) — popula o
  bloco `subst` na DPS nova; `cMotivo` fixo em `'99'` (Outros — nenhum dos
  códigos específicos descreve "corrigi um erro na fatura").
- `NfseService.substituirParaFatura` simplificado de duas chamadas
  (`Autorizacao` + `RegistrarEvento`) pra uma só. `nfseRejectionReason:
  null` agora é definitivo — não existe mais um segundo passo que possa
  falhar depois.
- `buildCancelamentoPorSubstituicaoEvento`/`CancelamentoPorSubstituicaoEventoInput`
  removidos (`nfse-cancelamento-evento.ts`) — caminho confirmado
  impossível pro contribuinte, mantido só como comentário histórico pra
  quem investigar de novo não repetir a mesma pesquisa.
- Correção do patch da lib (edição direta em `node_modules`, não
  persistida via patch-package) deixada como está — corrige um bug real
  da lib mesmo não sendo mais exercitada pelo nosso código; não vale o
  esforço de formalizar em `patches/` pra um caminho que não chamamos
  mais.
- Verificado: typecheck + build limpos (`apps/api`); Jest 28/28 sem
  regressão. **Verificado de ponta a ponta contra a Homologação real da
  SEFIN Nacional**: `verify-nfse-invoice.ts` confirmou pela primeira vez
  `nfseRejectionReason === null` numa substituição por um motivo
  genuíno (não por ausência de checagem). Confirmação independente, além
  do que o script já fazia: consulta direta a `EventosPorChave` pela
  chave antiga mostrou a própria SEFIN gerando um evento
  `CANCELAMENTO_POR_SUBSTITUICAO` sozinha, 0,3s depois da nova DPS ser
  autorizada — prova de que o cancelamento automático de verdade
  acontece, não só que a chamada não foi rejeitada.

## Correção — revisão de código externa (`/code-review`, 10 achados + 3 adicionais)

Rodada do `/code-review` num subagente em background, escopo pedido pelo
usuário: "revise a documentação, há muitos desencontros, nada é seguro,
código é a fonte da verdade" — ou seja, tratar `docs/` como possivelmente
desatualizado e o código como autoridade. O agente devolveu 10 achados
ranqueados por severidade; os 10 foram corrigidos e verificados nesta
rodada:

1. **`AllocationsController.list` vazava `costPerHour`** pra staff — a
   lista embute o `User` inteiro; `UsersController` já redige o campo, mas
   `AllocationsController` não. Corrigido com o mesmo `redactCost`.
2. **`updateTimeEntry` não revalidava `projectId`/`phaseId`** contra a
   conta — um PATCH com o id de outra conta passava pela FK do Prisma
   (que só confere que a linha existe, não o tenant) e movia o lançamento
   pra fora da conta original. Corrigido com a mesma validação que
   `createTimeEntry` já fazia.
3. **`POST`/`DELETE /v1/absences` sem `@AdminOnly()`** — o comentário do
   service já dizia "mesmo raciocínio de `AllocationsService`", mas a
   trava nunca chegou ao controller. Adicionada.
4. **`updateOfficeLink` gravava `phaseId: ''` direto na FK** — o doc do
   schema já dizia que string vazia desvincula a fase, mas o código nunca
   convertia pra `null` antes do Prisma, resultando em violação de FK em
   vez de desvincular. Corrigido.
5. **Nenhuma alocação era barrada por sobrecarga pelo lado do servidor** —
   o cálculo de pico (sweep-line) só existia no frontend como aviso
   visual; uma chamada direta à API passava por cima dele. Adicionado o
   mesmo cálculo em `AllocationsService.createAllocation`, rejeitando com
   `ALLOCATION_OVER_CAPACITY` quando excede `User.weeklyCapacityHours`.
6. **`useMemo` de `rankedUsers` (formulário de alocação) não listava
   `absencesByUser`** nas dependências — uma ausência nova registrada não
   atualizava a disponibilidade mostrada até algum outro campo mudar.
7. **`archiveFiscalXml` resolvia o token de acesso do Drive duas vezes**
   quando a árvore de pastas do projeto ainda não existia — corrigido pra
   resolver uma vez e repassar pra `ensureProjectFolderTree`. Achado um
   bug real ao corrigir isto: o loop de criação de pasta por fase ainda
   lia o parâmetro `accessToken` (agora opcional) em vez do token
   resolvido, o que teria quebrado silenciosamente assim que o parâmetro
   virasse opcional.
8. **Sem teste cobrindo o contrato "nunca bloqueia a ação fiscal"** do
   arquivamento — adicionado `nfse.service.spec.ts` (testa
   `archiveXmlBestEffort` direto, via cast, sem precisar de certificado
   nem client SEFIN) e 3 testes novos em `google-drive.service.spec.ts`
   pra `archiveFiscalXml`.
9. **Nota do runbook sobre o disco `araci-fiscal-xml` estava
   desatualizada** — ainda descrevia o arquivamento como feature futura,
   quando já tinha sido implementado (via Drive, não via disco) na rodada
   anterior. Corrigida.
10. **`POST .../phases/:phaseId/approve` sem `@AdminOnly()`** — aprovar um
    gate destrava faturamento do estágio e o início do próximo; mesma
    classe de decisão gerencial que já é admin-only em
    Allocations/Absences.

Verificado: typecheck limpo (api e web), Jest 34/34 (28 + 6 novos), e a
suíte de smoke rodada **duas vezes de verdade** (antes e depois das
correções, via `git stash`) contra a API local de pé — mesmo resultado
348 passaram/6 falharam nas duas rodadas, confirmando que as 6 falhas são
pré-existentes (uma credencial real do Drive esquecida conectada neste
banco de dev compartilhado, mais duas lacunas conhecidas sem relação),
não regressão desta rodada.

**Investigação de acompanhamento** (perguntei ao agente "algo mais que
você não reportou?"): revelou 3 achados adicionais, corrigidos na
sequência:

- **`weeklyCapacityHours` rejeitava `0`** (`z.number().positive()`) apesar
  da tela de Equipe já aceitar 0 como "temporariamente fora de alocação"
  (`min="0"` no input). Trocado pra `.nonnegative()`.
- **`ProjectMembersController` sem `@AdminOnly()`** — mesma classe de
  achado do item 10 acima, numa segunda rota. Adicionado o gate, e a tela
  do projeto passou a esconder o formulário de adicionar/remover membro
  pra quem não é admin (mesmo padrão de `isAdmin` já usado em
  `team/planning/page.tsx`), pra não mostrar um controle que só resultaria
  em 403.
- **`substituirParaFatura` semeava `nDpsVariant` de `Date.now()`**, não de
  `chaveAntiga` — quebrava a mesma idempotência de reenvio que
  `emitirParaFatura` já garante na reemissão (que semeia de
  `nfseCanceladaEm.getTime()`, estável). Uma queda de rede depois da SEFIN
  autorizar mas antes da resposta chegar produziria uma SEGUNDA DPS no
  retry, em vez de a SEFIN rejeitar como duplicata. Corrigido pra semear
  de `chaveAntiga` (estável entre retries da mesma substituição, diferente
  a cada substituição de verdade). **Re-verificado contra a Homologação
  real da SEFIN Nacional** — emitir → cancelar → reemitir → substituir, os
  4 passos confirmados de novo depois da mudança.

Itens que a mesma investigação encontrou e **deliberadamente não foram
corrigidos nesta rodada** (aguardando priorização, ver
`../auditoria-2026-08-30.md` pra uma lista mais ampla de achados na mesma
linha):

- `nfseNumber` não é atualizado numa substituição — a tela segue exibindo
  a chave da nota cancelada.
- `ProjectMembersController` à parte, nenhuma outra área do sistema além
  desta rodada e da auditoria de 30 ago foi revisada (auth, billing Asaas,
  quadro/tldraw, motor de precificação, FF&E backend).

## Correção — regra de negócio de dinheiro/faturamento (A1-A9 do relatório completo)

Rodada pedida pelo usuário depois da auditoria de 30 ago 2026: "comece por
regra de negócio de dinheiro/faturamento" (seção A1-A9 de
`../auditoria-2026-08-30-detalhada.md`). Os 9 achados dessa seção — 5 Altos,
2 Médios, 1 Baixo — foram corrigidos nesta rodada.

- **A1 (fatura duplicada) + A2 (hora aprovada tarde nunca faturável)** —
  corrigidos JUNTOS porque a correção óbvia de cada um isolado quebraria o
  outro: `@@unique([phaseId])` (proposta do relatório pro A1) impediria a
  fatura complementar que o A2 exige. Resolvido com dois invariantes
  diferentes: `pg_advisory_xact_lock(hashtext(phaseId))` dentro de uma
  transação serializa qualquer criação de fatura pro mesmo estágio (fecha a
  corrida do A1, nos dois fee models); pra hora_tecnica, "uma fatura por
  fase" deixou de ser a regra — virou "uma `TimeEntry` nunca é faturada
  duas vezes" (`TimeEntry.invoiceId`, novo campo), o que permite fatura
  complementar cobrindo só as horas aprovadas depois do primeiro
  faturamento (resolve o A2). Fee model fixo continua com "uma fatura por
  fase" de verdade — não existe "hora adicional" que justifique uma
  segunda fatura ali.
- **A7 (RoleRate não congelada)** — `TimeEntry.approvedHourlyRate` (novo
  campo) grava a tarifa vigente no momento em que `approveTimeEntry` roda,
  não na hora de faturar. `createHourlyInvoice` usa essa tarifa congelada
  quando existe; cai no fallback da `RoleRate` atual só para entradas
  aprovadas antes desta migração (nunca tiveram o campo preenchido).
  Consequência que exigiu atenção: duas entradas do MESMO papel podem
  legitimamente ter tarifas diferentes agora (a `RoleRate` mudou entre uma
  aprovação e outra) — `InvoiceLine` passou a agrupar por (papel, tarifa),
  não só por papel, senão um `hourlyRate` exibido não bateria com o
  `amount` de parte das horas.
- **A4 (sem arredondamento monetário)** — `round2` (novo helper em
  `common/money.ts`) aplicado na fronteira de escrita: em
  `RoleRatesService.calcularTarifaAPartirDoCusto` antes do upsert, e em
  `createHourlyInvoice`/`approveCartToInvoiceDraft` por linha e no total
  (soma de valores já arredondados, não arredondamento só no fim, pra não
  reproduzir o mesmo acúmulo de ponto flutuante que a auditoria achou).
  **Não alterada** a precisão da coluna `Decimal` no schema (proposta do
  relatório) — mudar o tipo re-arredondaria valores HISTÓRICOS já
  gravados no banco de verdade, uma alteração de dado que não é desta
  rodada pra decidir sozinho.
- **A5 (aprovação de horas sem gate)** — `@AdminOnly()` em
  `POST /time-entries/:id/approve`. **Deliberadamente sem** bloquear
  `entry.userId === approverUserId`: o próprio relatório (seção "5
  correções em que a versão óbvia piora") avisa que isso quebraria o
  faturamento pra um estúdio de uma pessoa só — o caso real de hoje.
  `updateTimeEntry`/`deleteTimeEntry` passaram a escopar por dono
  (qualquer staff só mexe no próprio lançamento; admin continua podendo
  mexer em qualquer um).
- **A6 (checkout de FF&E duplicado)** — mesmo padrão do A1/A2: `updateMany`
  condicional (`clientApproved: false`) dentro de uma transação, com o
  `count` resultante tendo que bater com a quantidade pedida antes de criar
  o Invoice. `@AdminOnly()` no endpoint (mesma classe de decisão financeira
  do `PhaseInvoiceController`).
- **A8 (`phaseId` órfão depois de mudar de projeto)** — `updateTimeEntry`
  agora zera `phaseId` quando `projectId` muda e nenhum `phaseId` novo vem
  junto, em vez de deixar apontando pra uma fase do projeto antigo.
  `createHourlyInvoice` também passou a escopar por `phaseId` E
  `projectId` junto, como segunda linha de defesa.
- **A9 (crons sem eleição de líder)** — `runWithCronLock` (novo helper em
  `common/cron-lock.ts`) usa `pg_try_advisory_xact_lock` — global pro
  banco, não por conexão — em volta do corpo dos 4 `@Cron`. Quem chega
  primeiro roda; quem chega depois sai sem executar, sem ficar esperando.
  Não exigiu tabela nova.
- **A3 (sinais fracos de retenção LGPD)** — `listRetentionCandidateClients`
  passou a trazer `timeEntries`/`invoices`/`phases` de cada projeto do
  cliente, e o cron passou a considerar também `Activity` de
  `PROJECT`/`OPPORTUNITY` (antes só `CLIENT`) no cálculo de última
  atividade; `status === 'ativo'` virou `status !== 'encerrado'` (um
  projeto pausado não é "cliente abandonado"). `anonymizeClient` ganhou
  uma trava de verdade: recusa com 422 se o cliente tiver fatura não paga,
  ou NFS-e emitida dentro do prazo de guarda fiscal configurado — antes
  disso, um aviso errado do cron conseguia destruir o dado sem nenhuma
  segunda checagem.
- Verificado: typecheck + Jest limpos (api e web). Suíte de smoke
  estendida com ~10 asserções novas provando os comportamentos NOVOS de
  verdade (fatura complementar de A2, tarifa congelada de A7, bloqueio de
  A5/A6, trava de A3), não só ausência de regressão — rodada contra uma
  API local de pé, 358 passaram/6 falharam (mesmas 6 falhas pré-existentes
  de sempre, confirmadas idênticas antes/depois). Achado no processo,
  registrado à parte por não ser sobre o código: um processo `nest start
  --watch` de uma rodada anterior desta sessão sobreviveu a um `TaskStop`
  e ficou ocupando a porta 3001 em segundo plano, fazendo uma primeira
  bateria de verificação rodar contra código ANTIGO sem avisar (só o
  `EADDRINUSE` no log do processo novo denunciou) -- refeita do zero
  depois de matar o processo de verdade (`taskkill /F`) e confirmar a
  porta livre antes de cada tentativa de subir o servidor.

## Correção — autenticação/autorização do staff (A19-A23 do relatório completo)

Sequência direta da rodada anterior (A1-A9): usuário disse "keep going".
A19 já tinha sido fechado como parte do achado A5 da rodada anterior
(mesmo `@AdminOnly()` em `POST /time-entries/:id/approve` cobre os dois).
Os 4 achados restantes desta seção (`A20-A23`) foram corrigidos aqui.

- **A20 (`PATCH /v1/users/:id` sem self-scope)** — faltava a checagem mais
  básica: qualquer staff dava PATCH no cadastro de QUALQUER colega, não só
  no próprio (a tela em `/team` nem escondia o formulário). Agora exige
  `id === session.userId` pra quem não é admin, e `role` passou a ser
  admin-only junto de `costPerHour`/`accessLevel` -- `role` é a chave de
  precificação da fatura por hora (`createHourlyInvoice` agrupa por
  `User.role` × `RoleRate.hourlyRate`), mesma razão pela qual
  `RoleRatesController` já é admin-only. UI: o formulário de editar
  colega só aparece na própria linha ou pra admin; campo "Papel" só é
  editável por admin, aparece como texto simples pro próprio staff.
- **A21 (`/v1/bi/executivo` sem gate)** — `@AdminOnly()` só no handler
  `executivo`, não na classe: `capacidade`/`ffe` continuam abertos, porque
  alimentam `/dashboard/capacidade` que staff legitimamente usa (a
  auditoria cita esse exato erro de "gate na classe inteira" como
  correção que piora o problema). Link "Dashboard" no nav virou
  `adminOnly: true`, mesmo padrão já usado em Tarifas/Financeiro/Log.
- **A22 (`budget` de fase sem gate)** — `budget` virou admin-only (strip
  silencioso na borda HTTP, mesmo padrão de `costPerHour`) e travado com
  `PHASE_BUDGET_LOCKED` depois que o gate é aprovado OU a fase já tem
  fatura -- `startDate`/`dueDate` continuam abertos a qualquer staff
  (planejamento/Gantt/Calendário não deveria travar). UI: campo
  "Orçamento" no cronograma só aparece pra admin.
- **A23 (chave de API sobrevive à remoção do allow-list)** — o ramo
  `x-api-key` do `AuthGuard` não aplicava `isEmailAllowed`, ao contrário
  do ramo Bearer; sem rota de exclusão de `User` nem flag de usuário
  desativado, remover alguém de `ALLOWED_EMAILS` fechava o login Google
  mas deixava a chave de API dessa pessoa funcionando pra sempre. Corrigido
  aplicando a mesma checagem nos dois ramos. Também adicionada
  `DELETE /v1/users/:id/api-key` (admin-only) -- antes só o próprio dono
  conseguia revogar a própria chave, um admin não tinha NENHUM jeito de
  desligar a chave de outra pessoa pela API.
- Verificado: typecheck + Jest limpos (api e web). Suíte de smoke
  estendida com 9 asserções novas provando os comportamentos de verdade
  (self-scope de A20 com strip silencioso de `role`, gate por rota de
  A21, strip + lock de A22, revogação admin de A23) -- 367 passaram/6
  falharam (mesmas 6 falhas pré-existentes de sempre). Processo repetido
  desta vez com o cuidado aprendido na rodada anterior: `netstat`/
  `taskkill /F` confirmados ANTES de cada tentativa de subir o servidor,
  não só depois -- outro zumbi de uma rodada anterior desta sessão foi
  encontrado e morto antes de gerar o mesmo problema de novo.

## Correção — deploy/infra: da exposição crítica do Supabase aos gaps de CI (A10-A18)

Terceira rodada seguida da mesma auditoria de 30 ago 2026 ("keep going").
Cobre a seção "Deploy, Docker, Render, Supabase, CI e manuseio de
segredos" inteira -- o achado `CRÍTICO` do relatório inteiro (A10) e os 8
achados de infraestrutura ao redor dele (A11-A18).

- **A10 (crítico) — Data API do Supabase expõe o banco inteiro** — o
  mesmo projeto Supabase hospeda o schema da aplicação E o Realtime do
  quadro (cuja `anon key` vai deliberadamente pro bundle do navegador).
  Sem RLS em nenhuma tabela, essa mesma chave pública lê/escreve
  qualquer coisa via PostgREST (`/rest/v1`) — Client (CPF/e-mail/
  telefone), Invoice, GoogleCredential. Escrito
  `docs/fase-0/supabase-rls-lockdown.sql` (RLS + REVOKE + `alter default
  privileges` em `anon`/`authenticated`, cobrindo inclusive o token de
  convidado do quadro com `role: "authenticated"` descrito no relatório
  completo) — **deliberadamente não é uma migration Prisma**: SQL puro
  pra rodar manualmente no SQL Editor do Supabase, mesmo padrão de
  `supabase-realtime-policy.sql`, porque não faz sentido contra o
  Postgres local de dev e não deveria disparar sozinho a cada deploy
  (mesmo raciocínio do achado A18 abaixo). **Não aplicado a nenhum
  projeto real nesta sessão** — falta ainda a AÇÃO do usuário, só
  possível no painel: desligar a Data API (a correção mais barata e mais
  eficaz das quatro) e considerar separar o projeto do Realtime.
- **A11 (Postgres sem TLS forçado) + A15 (guia recomendava a conexão
  errada)** — corrigidos juntos por serem a mesma seção do runbook.
  `packages/db/src/index.ts` agora falha no boot se `DATABASE_URL` for
  um host remoto sem `sslmode=` (silencioso antes: a aplicação
  funcionava igual sem TLS nenhum). Runbook e `render.yaml` corrigidos
  pra recomendar o **pooler** (6543), não a conexão direta (5432) — a
  justificativa antiga ("conflito com prepared statements") é do engine
  Rust do Prisma, que não se aplica ao `@prisma/adapter-pg` usado aqui;
  a conexão direta também só resolve em IPv6 sem o add-on pago do
  Supabase, contra a saída IPv4 do Render.
- **A12 (URLs sem esquema)** — `fromService` do Render entrega hostname
  puro (`araci-api:3001`), mas o código sempre concatenou como origem
  completa. Novo helper `withScheme()` (`apps/web/src/lib/url.ts`,
  `apps/api/src/common/url.ts`) prefixa `http://` quando falta, aplicado
  nos 6 pontos de consumo (proxy BFF, healthcheck, webhook passthrough,
  os dois magic-link de portal). Sem isso, o healthcheck do `araci-web`
  nunca ficaria saudável no primeiro deploy.
- **A13 (chave de criptografia do Google em formato errado)** —
  `render.yaml` trocado de `generateValue: true` (produz base64) pra
  `sync: false` (o código exige hex de 32 bytes). `main.ts` agora chama
  `loadKey()` no boot e avisa alto se o formato estiver errado, em vez
  de só descobrir na primeira tentativa de conectar uma credencial
  Google.
- **A14 (Codex sem sandbox num job com permissão de escrita)** —
  `--dangerously-bypass-approvals-and-sandbox` trocado por `--sandbox
  workspace-write --ask-for-approval never` nos dois usos do agente
  Codex em `pr-visual-recap.yml`. `continue-on-error: true` já protegia
  os dois passos — se o sandbox não inicializar neste runner, o passo
  falha e é pulado, nunca um bypass silencioso.
- **A16 (.dockerignore não recursivo)** — `*.pfx`/`*.p12`/`*.pem`/`*.key`
  só casavam na raiz do contexto de build; um certificado numa subpasta
  seria ignorado pelo git (nada no diff) e assado numa camada da imagem
  sem aviso. Adicionadas as variantes `**/`.
- **A17 (CI nunca roda os testes)** — `ci.yml` fazia build + typecheck,
  nunca `jest`, apesar de `turbo.json` já declarar a task `test` e
  existirem specs reais (`pricing.spec.ts`, `google-drive.service.spec.ts`,
  etc.). Adicionado `npx turbo run test` depois do build, e
  `permissions: contents: read` no topo (o job nunca precisa escrever
  nada). Verificado rodando local: 34/34 testes, `apps/web` pulado
  (sem task `test`) sem quebrar o comando.
- **A18 (migration destrutiva sem confirmação)** — uma migration já
  mergeada faz `DROP TABLE` sem backfill; o `preDeployCommand` aplicaria
  isso sem confirmação contra o MESMO Supabase de desenvolvimento (dado
  real, não um banco zerado). Nada a desfazer na migration em si — o
  runbook ganhou um passo 0.5 (backup do Supabase antes do primeiro
  Apply) e uma regra pra qualquer `DROP` futuro precisar de migração de
  dados explícita antes.
- Verificado: typecheck limpo (api, web, packages/db) e Jest 34/34
  (confirma que o boot-check de TLS do A11 não quebra o Postgres local
  de dev, que não é um host remoto). `npx turbo run test` verificado
  rodando da raiz do monorepo — é exatamente o comando novo do CI.
  Smoke suite: 367 passaram/6 falharam, mesma baseline de sempre — como
  esperado, nada nesta rodada toca lógica de negócio testável pelo
  smoke-test (é tudo infra/CI/docs). Zumbi do `nest start --watch` de
  uma rodada anterior encontrado e morto (de novo) antes de começar —
  `netstat`/`taskkill /F` seguem sendo checados antes de toda tentativa
  de subir o servidor nesta sessão.

## Correção — corretude fiscal da NFS-e: emissão/substituição/cancelamento (A24-A31)

Quarta rodada seguida da mesma auditoria de 30 ago 2026 ("keep going").
Cobre a seção de corretude fiscal do relatório completo — os métodos
`emitirParaFatura`/`substituirParaFatura`/`cancelarParaFatura` de
`nfse.service.ts`.

- **A24 (substituição não atualizava `nfseNumber`)** — `substituirParaFatura`
  já atualizava `nfseChaveAcesso`/`nfseIdDps`/etc. da NFS-e nova, mas
  deixava `nfseNumber` com o valor da NFS-e ANTIGA (substituída). Corrigido
  espelhando o mesmo campo que `emitirParaFatura` já grava.
- **A26 (`emitirParaFatura` regredia fatura `paga` de volta pra `emitida`)**
  — reemitir a NFS-e de uma fatura já paga (ex.: correção depois do
  pagamento) sobrescrevia `status` incondicionalmente. Agora só grava
  `status: 'emitida'` quando o status atual NÃO é `paga`.
- **A28 (emissão de homologação tratada como emissão real)** — o maior
  achado desta rodada. Antes, emitir em ambiente de HOMOLOGAÇÃO (teste,
  sem validade fiscal) já marcava a fatura como `emitida`, gravava
  `nfseNumber` e disparava o guard `NFSE_ALREADY_ISSUED` contra qualquer
  nova tentativa — ou seja, um teste travava a emissão real depois.
  Introduzido o conceito `isRealEmission`/`isRealSubstitution`
  (`ambiente === producao`): `status`/`issuedAt`/`nfseNumber` só são
  gravados numa emissão real; `nfseChaveAcesso`/`nfseIdDps`/
  `nfseAmbienteEmissao` continuam sendo gravados sempre (rastreabilidade).
  O guard `NFSE_ALREADY_ISSUED` agora só dispara se a NFS-e existente foi
  emitida em produção — reemitir depois de um teste em homologação é
  legítimo. UI (`/projects/[id]`) ganhou um aviso explícito "NFS-e de
  TESTE — sem validade fiscal" pra homologação, distinto da emissão real.
- **A29 (substituição usava o ambiente ATUAL da conta, não o da emissão
  original)** — se a conta trocasse de homologação pra produção (ou
  vice-versa) entre a emissão e a substituição, `substituirParaFatura`
  chamava a SEFIN no ambiente errado — substituir uma NFS-e real de
  produção como se fosse homologação (ou o oposto). Corrigido lendo
  `invoice.nfseAmbienteEmissao` (o ambiente de quando a NFS-e ATUAL foi
  emitida) em vez de `account.nfseAmbiente`; se divergirem, novo erro
  `NFSE_AMBIENTE_MISMATCH` (422) orienta a mudar o ambiente da conta
  antes de substituir.
- **A30 (parcial — janela de dados irreconciliáveis entre SEFIN e banco)**
  — a chamada de rede pro Google Drive (arquivar o XML) acontecia ANTES
  de persistir os campos críticos da resposta da SEFIN; um crash entre as
  duas deixava uma NFS-e autorizada de verdade na SEFIN sem nenhum
  registro no banco. Persistência do resultado fiscal movida pra ANTES do
  arquivamento nos três métodos — encolhe a janela vulnerável, não
  elimina (reconciliação via `ConsultarDPS` fica fora do escopo desta
  rodada).
- **A31 (corrida entre requisições concorrentes sobrescrevia o motivo de
  rejeição)** — duas chamadas concorrentes pro mesmo `POST .../nfse`
  podiam fazer a que rejeitou (por último) sobrescrever
  `nfseRejectionReason` por cima do sucesso já persistido pela outra. Nos
  três `catch`, antes de gravar a rejeição a invoice é relida do banco —
  se já tiver sido autorizada/cancelada/substituída por uma chamada
  concorrente vencedora, a rejeição não é gravada por cima.
- **A27 (regressão introduzida por A30, corrigida na mesma rodada)** — com
  o arquivamento movido pra depois, uma falha nele (Drive fora do ar,
  token revogado) parava de aparecer em lugar nenhum pro usuário.
  Adicionado `Invoice.nfseXmlArchiveError` e exibição na tela do projeto.
- Verificado: build limpo (`nest build`, `next build`) e Jest 34/34
  (`nfse.service.spec.ts` incluso). Re-verificação real contra a SEFIN
  Nacional Homologação via `apps/api/scripts/verify-nfse-invoice.ts`
  reescrito pra bater com a semântica nova de A28 (homologação não seta
  `status`/`nfseNumber`, duplicidade em homologação vira rejeição de
  verdade da SEFIN em vez do guard client-side) e um bloco novo pro guard
  de A29 — todos os checks passaram, incluindo uma rejeição `E0014`
  (DPS duplicado) genuína da própria SEFIN confirmando o novo
  comportamento esperado. Suíte de smoke: 368 passaram/6 falharam (mesma
  baseline de sempre — as 6 continuam as pré-existentes, nenhuma nova).
  Duas correções feitas no próprio `smoke-test.ts` nesta rodada, sem
  relação com a lógica fiscal em si: o token JWT que o script forja pra
  rodar a suíte inteira tinha `expiresIn: 60s` fixo desde sempre — com o
  arquivo crescendo a cada rodada de auditoria, a suíte já estava
  chegando perto desse limite e passou a expirar no meio da execução
  (aumentado pra 15m, é só um token de teste do próprio script, não tem
  relação com o TTL real de 60s do JWT interno de produção); e um fixture
  de teste de A23 gravava um `apiKeyHash` LITERAL fixo no banco — se
  qualquer rodada anterior tivesse crashado depois desse ponto sem chegar
  na própria limpeza, a linha órfã ficava pra trás e colidia (unique
  constraint) com a rodada seguinte (corrigido pra incluir
  `Date.now()`, mesmo padrão já usado por `fakeChaveAcesso` ali do lado).

## Correção — gestão documental no Drive e vazamentos de frontend (A32-A47)

Quinta rodada seguida da mesma auditoria de 30 ago 2026 ("keep going" /
"Keep going till finish the document"). Cobre as duas seções "Gestão
documental no Drive" e "Frontend: fronteiras de erro, server actions,
sessão e vazamento de dados" inteiras -- 16 achados.

- **A32 + A45 (bytes do Drive servidos inline, mesma origem, sem
  allowlist)** -- o achado mais sério da rodada: `Content-Type`/
  `Content-Disposition` vinham crus do Drive pro navegador, na MESMA
  origem do dashboard de staff, sem `X-Content-Type-Options`. Um arquivo
  HTML/SVG vinculado com título "contrato.pdf" (a extensão do título é só
  UI, texto livre) rodava script na origem da aplicação, com a sessão de
  quem abrisse. Corrigido com allowlist (`PublicPresentationController.
  downloadDocument`): só PDF/imagens raster passam como `inline`, tudo o
  resto vira `application/octet-stream` + `attachment`, sempre com
  `nosniff` -- independente do que a extensão do título sugere.
  `next.config.ts` ganhou `headers()` com `nosniff`/`Referrer-Policy`/
  `X-Frame-Options` globais (baixo risco de quebrar algo); uma CSP
  completa (`default-src` etc.) ficou deliberadamente de fora -- exige
  testar cada página de verdade num navegador pra não quebrar Supabase
  Realtime/Google OAuth/Sentry sem aviso, o que esta sessão não consegue
  verificar.
- **A46 (proxy de documento sem validação de segmento)** -- a mesma
  guarda de `/api/v1/[...path]/route.ts` (allowlist de caracteres, recusa
  `..`) não existia na rota de download do link de apresentação, que é
  alcançável por qualquer visitante sem sessão. Aplicada a mesma regex;
  aproveitado pra também aplicar `withScheme` (gap do achado A12 de uma
  rodada anterior, que nasceu depois desta rota existir).
- **A33 (credencial de Drive "qualquer admin" incompatível com
  drive.file)** -- drive.file é concessão por (app, usuário, arquivo); a
  credencial de outro admin responde 404 pro arquivo que alguém mais
  vinculou, e o código confundia isso com "apagado de verdade". Novo
  `OfficeLink.linkedByUserId` (migration
  `20260831202944_add_office_link_linked_by_and_indexes`) guarda quem de
  fato criou cada vínculo (a pessoa do Picker, ou quem resolveu a
  credencial na hora de provisionar pasta/arquivar XML);
  `resolveDriveAccessToken` passa a preferir essa credencial, com
  `orderBy` determinístico no fallback "qualquer admin". Coberto por
  teste novo em `google-drive.service.spec.ts`.
- **A34 (checagem de vínculos quebrados: um erro aborta a conta inteira e
  perde notificação pra sempre)** -- `getFile` lançando por rate
  limit/5xx/token expirado no meio da varredura subia até o cron, que só
  logava e pulava a conta -- os vínculos já processados ficavam com
  `brokenAt` gravado mas a notificação nunca saía, e o vínculo com erro
  virava "quebrado" pra sempre no próximo ciclo (`isBroken && !brokenAt`
  já seria falso). Cada `getFile` agora tem seu próprio try/catch:
  indeterminado (erro) não marca quebrado nem aborta a conta, só pula pro
  próximo -- a varredura sempre completa e sempre notifica o que achou
  nesta execução. Coberto por teste novo.
- **A36 (duas chamadas concorrentes duplicam a árvore de pastas)** --
  `ensureProjectFolderTree` lia e criava sem transação nem constraint.
  Dois índices únicos PARCIAIS na mesma migration (`documentType =
  'pasta_projeto'`/`'pasta_fase'` -- não representável em `@@unique` do
  schema.prisma, daí SQL puro) fazem a segunda gravação estourar P2002 em
  vez de duplicar; o catch relê a linha do vencedor em vez de lançar.
  Escrevendo o teste, achei e corrigi um bug que eu mesmo tinha acabado
  de introduzir nesta correção: a recuperação da pasta RAIZ (não das de
  fase, que já estavam certas) lia a linha existente mas esquecia de
  incluí-la no valor de retorno -- `archiveFiscalXml` (arquivamento do
  XML fiscal) não encontraria a pasta raiz pra quem tivesse perdido essa
  corrida específica.
- **A38 (checklist de documentos obrigatórios aceita vínculo nunca
  verificado, de qualquer provider, com externalId inventado)** --
  `getDocumentChecklist` agora exige `provider: DRIVE` e `lastCheckedAt`
  preenchido (não só `brokenAt: null`, que também é `null` num vínculo
  recém-criado nunca checado) -- sem isso, qualquer staff inventava um
  `OfficeLink` com `documentType` batendo e enganava a admin a aprovar um
  gate sem o documento de verdade. Pra não deixar todo vínculo
  permanentemente insatisfeito até o cron semanal passar, o token EFÊMERO
  do próprio Picker do navegador (nunca persistido) agora viaja até
  `office-links.service.ts` numa chamada só, que confirma o arquivo
  contra a Drive API e grava `lastCheckedAt` na hora -- fechando o A38 e
  reforçando o A33 (`linkedByUserId` vem do mesmo request) numa penada só.
- **A39 (FK `phaseId` sem índice, exatamente a coluna do checklist)** --
  `@@index([phaseId, brokenAt])` na mesma migration; `accountId` também
  entrou no `where` do checklist por defesa em profundidade de tenant.
- **A35 (grant offline carrega `gmail.readonly`/`calendar.events` que
  nada usa)** -- `GoogleCredentialsService.getAccessToken` só é consumido
  por `GoogleDriveService`; reduzido a só `drive.file`. Um vazamento do
  banco + chave de criptografia não dá mais leitura de e-mail/escrita de
  agenda de graça.
- **A37 (refresh token na query string do revoke)** -- ia na URL (query
  string é o lugar mais provável de segredo acabar em log de proxy/APM),
  mesmo já mandando `Content-Type` urlencoded com corpo vazio. Movido pro
  corpo com `URLSearchParams`, mesmo padrão já usado em `getAccessToken`.
- **A43 (URL de OfficeLink sem allowlist de esquema)** -- `z.url()`
  sozinho não restringe protocolo; `javascript:...` passava e
  `office-links-section.tsx` renderizava cru em `href`. Corrigido nos
  dois lados: `z.url({ protocol: /^https?$/ })` na API, e um `safeHref()`
  no frontend que renderiza texto simples (não `<a>`) pra qualquer coisa
  fora de http(s) -- proteção incondicional, não depende de ninguém
  bypassar a API pra existir (vínculos antigos já gravados continuam
  seguros de renderizar).
- **A41 (GET /absences vazava costPerHour de todo mundo)** -- terceira
  superfície com `include: { user: true }` sem redação, depois de
  Users/Allocations. Trocado por `select` explícito (só `id`/`name`, que
  é tudo que a tela usa) em vez de mais um `redactCost` -- uma coluna
  sensível nova no User não vaza por padrão de novo.
- **A47 (GET /users vazava apiKeyHash de todo mundo)** -- mesmo raciocínio
  de A41: `UsersService` trocado pra `select` explícito com um booleano
  derivado `hasApiKey` no lugar do hash. `AllocationsController.
  redactCost` (que já existia pro costPerHour do mesmo vazamento) ganhou
  a mesma remoção de `apiKeyHash` -- ali o `include` é grande demais
  (projeto+fases+cliente aninhados) pra valer a pena migrar pra `select`
  nesta rodada.
- **A44 (exportação LGPD "Meus dados" nunca funciona)** -- defeito
  funcional puro, não achado de segurança: `portal/verify/route.ts` grava
  o cookie `client_session` com `Path=/portal`, mas a rota de export
  vivia em `/api/portal/data-export` -- fora do escopo do cookie pelo
  algoritmo de path-match do RFC 6265, então o navegador nunca o
  enviava e a rota sempre devolvia 401. Estava assim desde que a
  funcionalidade nasceu (falha fechada, nunca gerou alerta). Rota movida
  pra `/portal/data-export`, dentro do escopo do cookie.
- **A42 (dashboard executivo expõe a staff o financeiro que outros 3
  controllers escondem)** -- já estava fechado NO SERVIDOR pelo achado
  A21 de uma rodada anterior (mesmo `bi.controller.ts`, mesmo
  `@AdminOnly()` só em `/executivo`); faltava só a página tratar o 403
  graciosamente (mesmo padrão de `financeiro/page.tsx`) pra quem abrisse
  `/dashboard` direto por URL/bookmark em vez de passar pelo nav (que já
  esconde o link).
- **A40 (JWT do Supabase com `role: authenticated` entregue a
  visitante anônimo)** -- avaliado sem mudança de código nesta rodada: a
  exposição real (`/rest/v1` devolvendo o banco inteiro pra quem tiver o
  token) já está fechada, na CAMADA DE DADOS, pelo RLS+REVOKE de
  `docs/fase-0/supabase-rls-lockdown.sql` (achado crítico A10, escrito
  numa rodada anterior) -- uma vez aplicado, nenhum JWT com `role:
  authenticated`, deste token ou de qualquer outro, lê nada de `/rest/
  v1` independente da claim que carregue. **`supabase-rls-lockdown.sql`
  continua não aplicado a nenhum projeto real** (ação do usuário, painel
  do Supabase) -- até lá, A40 continua tecnicamente aberto na prática,
  mesmo com o código pronto. A refinação adicional que o achado sugere
  (papel de banco dedicado só pra Realtime, sem GRANT nenhum nas tabelas
  do app, em vez de reusar `authenticated`) foi deliberadamente NÃO
  implementada: exigiria criar role/GRANT num projeto Supabase real e
  reconfigurar a autorização do Realtime de um jeito que esta sessão não
  consegue testar (Postgres local não tem o schema `realtime`) -- o risco
  de quebrar a sincronização ao vivo silenciosamente, sem conseguir
  verificar, pesou mais que o ganho de defesa-em-profundidade adicional
  quando a exposição de dados de verdade já está fechada em outra
  camada.
- Verificado: build limpo (`nest build`, `next build`). Jest 37/37 (3
  testes novos em `google-drive.service.spec.ts` cobrindo A33/A34/A36 --
  escrevê-los pegou o bug real de A36 descrito acima antes de qualquer
  execução manual). Smoke suite: 368 passaram/6 falharam, mesma baseline
  de sempre (as 4 falhas de `GOOGLE_DRIVE_NOT_CONNECTED` já eram
  conhecidas -- são justamente a superfície desta rodada num ambiente sem
  credencial Google real). Uma correção no próprio `smoke-test.ts`: o
  fixture do checklist de documentos obrigatórios criava o vínculo sem
  `lastCheckedAt` (a suíte não tem um token de Picker de verdade pra
  passar) -- ajustado pra simular a verificação direto no banco, mesmo
  padrão já usado pra certificado/credencial fiscal ausentes neste
  ambiente. `netstat`/`taskkill /F` seguem sendo checados antes de toda
  tentativa de subir o servidor; desta vez o processo antigo respondia
  normal (não era zumbi), mas foi reiniciado do zero mesmo assim porque
  `OfficeLinksService` ganhou uma dependência nova via DI
  (`GoogleDriveService`) que hot-reload não é garantia suficiente de
  verificar.

## Correção — portais voltados ao cliente, quadro colaborativo, portal do consultor e isolamento multi-inquilino (A48-A71)

Sexta rodada seguida da mesma auditoria de 30 ago 2026 ("keep going" /
"Keep going till finish the document"). Cobre as quatro últimas seções do
relatório completo inteiras -- 24 achados (A48-A71) mais dois itens que só
apareciam no Apêndice B (reverificação da auditoria anterior), sem número
de achado próprio na lista principal.

**Portal do cliente / link de apresentação (A48-A56):**
- **A48/A67 (export LGPD do portal devolvia composição interna de preço,
  motivo de perda, notas internas)** -- o achado mais sério da rodada:
  `ClientsService.exportClientData` (ferramenta de STAFF) era reaproveitado
  cru pelo portal do cliente, entregando `baseCost`/`adjustedCost`/
  `complexityMultiplier`/`packageDiscountPercent`/`lostReason` e as
  `Activity` internas pro próprio cliente. Nova
  `exportClientDataForSubject` com `select` explícito (nunca a composição
  de preço, nunca Activity) -- `exportClientData` original preservado
  intacto pra tela de staff.
- **A53 (achado corrigido só pela metade numa rodada anterior)** -- ao
  corrigir C-03, `supplier` continuou nos dois `select` de
  `public-presentation.service.ts` (um deles nem foi pego pelo
  `replace_all` da primeira tentativa, por indentação diferente -- achado
  e corrigido dentro da própria verificação desta rodada).
- **A49 (`clientApproved` carregava dois significados)** -- aprovação do
  cliente E "já faturado" no mesmo campo; item aprovado pelo link público
  saía do carrinho de FF&E pra sempre, sem nenhum Invoice existir. Novo
  `ProductSpecification.invoicedAt`, guarda de corrida do checkout movida
  pra ele; `clientApproved` volta a significar só "o cliente aprovou".
  Tabela de especificações ganhou um terceiro estado ("Aprovado
  (aguardando fatura)") em vez de só Aguardando/Aprovado.
- **A50 (delete/anonimização de Client não limpava as tabelas do
  portal)** -- `ClientMagicLink`/`ClientSession` têm FK `ON DELETE
  RESTRICT`; um cliente que já pediu magic link virava indeletável, e uma
  sessão emitida antes de anonimizar continuava válida por até 7 dias
  depois do "apagamento" LGPD. Limpas nas duas transações.
- **A52 (unique de `Client.email` sem migração de dados)** -- linhas
  gravadas com maiúscula antes da constraint nunca mais casavam no login
  do magic link (comparação exata desde então). Migração de dados
  corretiva (`lower(email)`), deliberadamente SEM consolidar duplicatas
  automaticamente -- estoura e falha alto se existir uma colisão de
  verdade, em vez de decidir sozinha qual registro é o titular.
- **A55 (índices de FK do portal)** -- `ClientMagicLink`/`ClientSession`
  sem `@@index([clientId])`.
- **A56/A69 (endpoint de lead sem limite de tamanho e escrevendo em
  Client de outra pessoa por e-mail)** -- `name`/`phone` sem `.max()`;
  pior, `consentedAt` de um Client JÁ EXISTENTE era sobrescrito a partir
  de uma rota `@Public`, sem prova nenhuma de posse do e-mail -- alguém
  que soubesse o e-mail de um cliente real destruía o registro da base
  legal LGPD dele a qualquer momento. Consentimento agora só é gravado na
  CRIAÇÃO; busca do Client escopada por `accountId` (defesa em
  profundidade -- `email` ainda é `@unique` global, redesenho pra
  `@@unique([accountId, email])` deliberadamente fora do escopo: sem
  segundo tenant real hoje, o ganho não paga o redesenho do login do
  magic link que dependeria disso).
- **A51/A58/A59 (snapshot do quadro: sem limite de tamanho, sem
  validação, sem tratamento de erro -- em conjunto, um vetor de negação
  de serviço)** -- três achados com a mesma causa raiz corrigidos juntos:
  `moodboardSnapshotInputSchema` trocado de `z.unknown()` pra forma
  mínima real de um `TLStoreSnapshot` (`store`/`schema.schemaVersion`);
  corpo HTTP limitado a 5MB nos dois lados (`main.ts` +
  `next.config.ts`, mesmo número documentado nos dois); `loadSnapshot`
  no cliente ganhou try/catch com degradação pra quadro vazio em vez de
  derrubar a página inteira; `flush()` (save com debounce) ganhou
  `.catch()` com aviso visível na tela em vez de unhandled rejection
  silenciosa. Rate limit novo (`/present/` POST, 60/min) fecha o resto do
  A51 (aprovar/desaprovar em loop gerando e-mail ilimitado). Comentário
  desatualizado que afirmava "o link de apresentação nunca escreve"
  corrigido -- é decisão de produto real (cliente colabora no quadro).
- **A60 (revogar convidado do quadro não invalida o JWT do Realtime já
  emitido)** -- TTL de 2h reduzido pra 15min; `revoke()` também apaga a
  `WhiteboardGuestSession` do convidado (força reautenticação, embora não
  invalide sozinho o JWT bearer -- renovação periódica ficou
  deliberadamente fora do escopo: exigiria um caminho de servidor pro
  client renovar sozinho, e a degradação graciosa que o canal já tem pra
  falha de sincronização faz o custo residual ser só "sem tempo real
  depois de 15min", nunca perda de dado).
- **A61 (client Supabase Realtime era um singleton de módulo)** --
  `setAuth` trocava o token da CONEXÃO INTEIRA; duas pranchas na mesma
  página (FF&E, apresentação) faziam a última montada sobrescrever o
  token das outras. Um client por canal agora, criado dentro de
  `createBoardChannel`.
- **A62 (tabelas novas do quadro sem índice de FK)** -- mesmo padrão já
  corrigido no resto do schema, reaberto nos cinco models do quadro.
- Verificado com um teste novo em `google-drive.service.spec.ts` (não
  desta seção, mas escrito nesta mesma sessão de verificação) e as
  correções acima confirmadas via build + smoke suite abaixo.

**Portal do consultor externo (A63-A66):**
- **A63 (Activity/notas internas iam inteiras e retroativas pro
  consultor)** -- sem filtro nenhum, todo histórico do projeto (inclusive
  escrito meses antes do consultor existir) chegava no portal read-only
  dele. Novo `Activity.visibleToCollaborator` (default false, opt-in
  explícito, mesmo padrão de `OfficeLink.visibleToClient`) -- checkbox
  "Visível para consultores externos" no formulário de nota (só aparece
  pra `entityType: PROJECT`), rótulo explícito na nota já marcada.
- **A64 (deleteProject não limpava `CollaboratorProjectAccess`)** --
  mesma classe do achado A-02 de uma rodada anterior, reaberta na tabela
  nova; `MoodboardsService.deleteMoodboard` já tratava o caso análogo
  (`WhiteboardGuestAccess`) e o comentário lá até citava o padrão
  explicitamente sem ninguém ter voltado pra aplicá-lo aqui.
- **A65 (convite de consultor não notifica ninguém)** -- `invite()`
  criava o acesso e retornava; o convidado nunca descobria que o portal
  existia. Novo e-mail apontando pra `/colaborador/login` (nunca um magic
  link direto -- esse continua de vida curta e emitido só sob pedido
  próprio), só no caminho em que o acesso é de fato novo (idempotente não
  reenvia).
- **A66 (magic link do consultor consumido por GET -- TOCTOU + queimado
  por scanner de e-mail)** -- corrigido o núcleo do achado (a corrida de
  verdade): `findUnique` + `update` separados trocados por um
  `updateMany` condicional numa instrução só, tanto no
  collaborator-portal quanto no client-portal (mesmo desenho, achado
  citado como valendo pros dois). A parte de UX (trocar o consumo de GET
  por uma página com botão que faz POST, pra sobreviver a
  prefetch/Safe Links) foi deliberadamente **NÃO implementada** -- exigia
  uma página nova + Server Action nas duas superfícies, e o risco real
  (alguém fica "preso" pedindo link de novo) é de confiabilidade, não de
  segurança, já que o TOCTOU (a parte que criava DUAS sessões de 7 dias)
  está fechado.

**Isolamento multi-inquilino (A68-A71):** avaliação geral da auditoria
confirma que não há vazamento entre contas em lugar nenhum hoje -- os
quatro achados aqui são sobre o dia em que uma SEGUNDA conta existir,
não sobre um buraco alcançável agora.
- **A68 (certificado fiscal/CNPJ é global de processo, nunca validado
  contra `Account.cnpj`)** -- `loadValidCertificate` passou a validar
  (quando `Account.cnpj` está preenchido) que o CNPJ do certificado bate
  com o da conta da fatura, com um `ApiError` explícito em vez de deixar
  a NFS-e sair no nome errado. `emitirTeste()` (sem fatura/conta no meio)
  continua sem essa checagem, de propósito.
- **A69** -- ver A56 acima (mesmo achado, seções diferentes da auditoria).
- **A70 (bootstrap de login resolve o inquilino com `account.findFirst()`
  sem vínculo nenhum com o e-mail)** -- hoje seguro só porque nunca existe
  mais de uma Account. Substituído por uma leitura de até 2 linhas com
  guarda: se alguma vez existir mais de uma Account, `ensureAccountAndUser`
  agora FALHA ALTO (erro explícito) em vez de silenciosamente atribuir o
  próximo login novo à conta errada. Resolução determinística de verdade
  (domínio/convite por conta) fica pra quando uma segunda conta for uma
  possibilidade real.
- **A71 (cooldown de aviso de certificado vencendo era checado sem
  filtro de conta)** -- uma notificação recente de QUALQUER conta
  suprimia o aviso de TODAS; movido pra dentro do loop por conta, mesmo
  padrão já usado por `getLastNotifiedAtByClientIds`.

**Dois itens do Apêndice B (reverificação da auditoria anterior, sem
achado próprio na lista principal) corrigidos nesta rodada por
completude:**
- **"Bloqueador 15" (lado web nunca falha o boot)** -- `apps/api`já tinha
  fail-fast desde uma rodada anterior; `apps/web/src/instrumentation.ts`
  só fazia `console.error` e CONTINUAVA subindo sem
  `NEXTAUTH_SECRET`/`API_URL`/`INTERNAL_API_SECRET` (healthcheck verde,
  login e toda chamada à API falhando em runtime). `process.exit(1)`
  extraído pra `validate-env.ts` à parte -- Turbopack acusa
  `process.exit` como API incompatível com o Edge Runtime mesmo dentro
  de um branch morto pra edge no mesmo arquivo; import dinâmico só no
  branch nodejs (mesmo padrão já usado pro `sentry.server.config` ali do
  lado) resolve sem esse aviso.
- **FKs sem índice nos models mais novos que a própria varredura de
  índices não cobriu** -- `ExternalCollaborator.accountId`,
  `CollaboratorProjectAccess.projectId` (o `@@unique` começa por
  `collaboratorId`, não serve pra busca por `projectId` sozinho),
  `CollaboratorMagicLink.collaboratorId`, `CollaboratorSession.
  collaboratorId`, `ProductImage.productId`, `StudioFixedCost.accountId`.

- Verificado: build limpo (`nest build`, `next build` -- o segundo sem
  nenhum warning depois da correção do Edge Runtime). Jest 37/37. Smoke
  suite rodada MÚLTIPLAS vezes nesta rodada por causa de duas classes de
  regressão real que a própria suíte pegou: (1) o fixture de snapshot do
  quadro (`fakeSnapshot`) não tinha a forma mínima que A59 passou a
  exigir -- corrigido em três pontos; (2) o teste de revogação de
  convidado do quadro esperava o comportamento ANTIGO (403, sessão ainda
  válida) que A60 deliberadamente mudou (401, sessão invalidada) --
  comentário e asserção atualizados pra refletir o comportamento novo,
  correto. Resultado final: 371 passaram/6 falharam, mesma baseline de
  sempre. Descoberta operacional nesta rodada: o repositório vive dentro
  de uma pasta sincronizada pelo OneDrive, cujo sync em segundo plano
  dispara eventos de mudança de arquivo espúrios que o watcher do `nest
  start --watch` capta como "recompilar" no MEIO de uma execução da
  smoke suite, derrubando a conexão em andamento (`ECONNRESET`) sem
  nenhuma edição real ter acontecido -- descoberto depois de duas
  tentativas de smoke suite falharem por esse motivo. Mitigação usada
  pro resto desta rodada: build + `start:prod` (sem watch) só pra rodar a
  verificação, servidor devolvido a `dev`/`--watch` no final pro uso
  interativo normal. Vale considerar registrar isso como uma nota
  permanente de ambiente (ex.: excluir a pasta do repo da sincronização
  do OneDrive, ou usar `start:prod` como padrão pra rodar a smoke suite
  daqui pra frente) -- não fiz a mudança permanente porque é uma decisão
  de ambiente do usuário, não do código.

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
