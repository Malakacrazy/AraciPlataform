# Auditoria de 30 de agosto de 2026 — segunda revisão

Revisão completa do código, recomeçando do zero, 92 commits depois da auditoria
anterior. Dez dimensões revisadas em paralelo; cada achado severo passou por um
verificador independente encarregado de **refutá-lo**.

**Método:** somente `apps/*/src`, `packages/db/prisma/schema.prisma`,
`apps/api/scripts/smoke-test.ts`, `render.yaml`, Dockerfiles e workflows.
Afirmações de `docs/`, de comentários de código e de mensagens de commit não
foram usadas como evidência — e isso importou: um comentário afirmava "seis
famílias" de rota pública quando existiam oito, e uma mensagem de commit
apontava o rate limiting para um arquivo que nunca existiu.

**Nada foi executado.** Sem build, sem `npm install`, sem smoke test rodando,
sem navegador. Toda conclusão vem de leitura de código.

## Resultado

| | |
|---|---|
| Itens da auditoria anterior reverificados | 55 (com sobreposição entre revisores) |
| Confirmados corrigidos | **40** |
| Parciais | 12 |
| Não corrigidos | 2 |
| Regrediram | 1 |
| Achados novos | 71 — 1 crítico distinto, 24 altos, 28 médios, 17 baixos |
| Severos com refutação adversarial | 13 verdictos: **9 confirmados, 4 parciais, 0 refutados** |
| Severos sem refutação | 13 |

Zero refutados num código que acabou de passar por uma rodada de correções é o
sinal mais informativo do relatório: o que restou não é leitura equivocada de
código bem-feito.

## O que está genuinamente resolvido

Vale registrar porque são os piores achados da rodada anterior, e estão fechados
no código, não só no commit:

- **Login restrito ao domínio, enforçado nos dois lados** — callback `signIn`
  nega no servidor (não é mais só o hint `hd`), e o mesmo allow-list é
  reaplicado no `AuthGuard`. Os dois falham fechado sem a variável.
- **A rota de escalonamento por chave de API deixou de existir** — não foi
  gateada, foi removida; a chave é self-scoped.
- **Preço ao cliente com markup**, pela mesma fórmula do checkout, coberto por
  smoke test.
- **NFS-e real** — caminho Invoice → DPS → autorização → persistência,
  idempotência antes da chamada à SEFIN, `@unique` em `nfseChaveAcesso`, e gate
  de ambiente por `Account.nfseAmbiente` (não por variável de ambiente).
- **Nenhum segredo jamais entrou no git** — 92 revisões, 446 caminhos, nada.
- **Isolamento por conta consistente** — 40 modelos, 43 services, nenhum caminho
  cross-tenant. Sub-recursos são provados por join. Uma única query raw
  (`SELECT 1` do health), sem interpolação.
- **O portal do consultor externo é o código novo mais limpo do repositório** —
  identidade separada, header dedicado que nenhuma outra rota consulta, escopo
  no servidor, 403 idêntico para projeto alheio e inexistente, read-only pela
  ausência de código de escrita, revogação efetiva no request seguinte.

## 1. Crítico — a Data API do Supabase expõe o banco

O banco de produção passou a ser um projeto Supabase, e é **o mesmo projeto** que
serve o Realtime do quadro. Duas propriedades, juntas, abrem o banco:

1. A `anon key` vai deliberadamente para o bundle do navegador (o Realtime
   precisa dela).
2. A Data API (`/rest/v1`) é pública por construção; o que a contém é RLS. Grep
   por `enable row level security`, `create policy`, `revoke`, `force_row` nas
   38 migrações: **zero ocorrências**. O único `.sql` de policy do repositório
   (`docs/fase-0/supabase-realtime-policy.sql`) age só sobre
   `realtime.messages`.

Resultado: as tabelas do Prisma ficam alcançáveis pela API pública com uma chave
que qualquer visitante lê do bundle — cliente, fatura, custo/hora, `apiKeyHash`,
sessões de portal. Agrava que a decisão registrada em
`docs/fase-0/especificacao-tecnica.md` é explicitamente "não confiar em RLS":
coerente com o Prisma como única porta, incompatível com hospedar esse schema
num projeto cuja porta alternativa está aberta.

**A correção óbvia não basta.** Habilitar RLS em tudo, sozinho, é a parte mais
cara e não fecha o buraco. Ordem recomendada:

1. **Desligar a Data API do projeto.** O código nunca a usa — `grep -rn "\.from(\|rest/v1" apps/web/src apps/api/src`
   não encontra chamada; o Prisma usa conexão direta. É a peça mais barata e a
   mais eficaz.
2. `REVOKE` em `anon`/`authenticated` sobre o schema `public`.
3. RLS habilitado (mesmo sem policies, o padrão passa a negar).
4. **Separar o projeto Supabase do Realtime do projeto que hospeda o banco**, para
   que chave publicada e schema de aplicação não voltem a coabitar.

> Confirmar no painel antes de agir: se a Data API já estiver desligada, o
> achado cai para baixo. Essa configuração não está no repositório.

> **Atualização de 31 ago 2026**: itens 2+3 (REVOKE + RLS) estão prontos
> em `docs/fase-0/supabase-rls-lockdown.sql`, mas **não aplicados** a
> nenhum projeto real ainda -- é SQL pra rodar manualmente no SQL Editor
> do Supabase, não uma migration automática (mesmo raciocínio de manter
> ações de infraestrutura fora do `preDeployCommand`, ver achado A18).
> Itens 1 (desligar a Data API) e 4 (separar o projeto do Realtime)
> continuam sendo decisão exclusiva sua, só no painel.

## 2. Cinco correções em que a versão óbvia piora

Ler antes de pegar qualquer item da lista de achados.

| Item | Por que a correção óbvia está errada |
|---|---|
| Carrinho de FF&E (`clientApproved` acumula "aprovou" e "faturado") | Fazer o carrinho parar de filtrar aprovados **cria cobrança duplicada**: `approveCartToInvoiceDraft` não tem idempotência além desse booleano. Separar os dois estados primeiro. |
| Autoaprovação de horas | `if (entry.userId === approverUserId) throw` quebra o smoke test em dois pontos e **impossibilita faturar num estúdio de uma pessoa** — o caso atual. Gate por papel, com caminho explícito para operador único. |
| `/v1/bi/executivo` sem `@AdminOnly` | `@AdminOnly()` na classe `BiController` também fecha `GET /v1/bi/capacidade`, que alimenta `/dashboard/capacidade` e é dado que staff legitimamente usa. Gate por rota. |
| `PATCH /v1/users/:id` sem self-scope | `@AdminOnly` cru quebra a tela `/team` (o form aparece para staff; o submit passaria a 403 sem mensagem). Autorizar no **service**, não na borda HTTP. |
| Snapshot de quadro malformado | `try/catch` pelado troca DoS por **perda silenciosa** do quadro. Precisa de três partes: isolar a falha na prancha, travar o autossalvamento quando o load falhou, e subir o limite do body parser nos dois hops. |

## 3. Altos confirmados

### Dinheiro e estado fiscal

- **Emitir NFS-e em fatura paga regride o status para `emitida`** e apaga a
  receita realizada — `apps/api/src/erp/fiscal/nfse.service.ts:245` grava
  `status: 'emitida'` incondicional, e o fluxo desenhado é exatamente esse
  (webhook marca `paga` → `notifyNfseReady` → admin emite). `paidAt` não é
  destruído. Correção: `status: invoice.status === 'paga' ? undefined : 'emitida'`.
- **Nenhum arredondamento monetário** no caminho `invoices.service.ts` → Asaas →
  NFS-e: fatura, cobrança e nota podem divergir em centavos.
- **"Uma fatura por fase" é só `check-then-act`** — sem `@@unique` em
  `Invoice.phaseId` (`invoices.service.ts:93-101`), duas requisições
  concorrentes passam as duas. Adicionar a constraint e traduzir P2002 para o
  422 que já existe.
- **Horas aprovadas depois da fatura do estágio ficam permanentemente não
  faturáveis**, e a `RoleRate` não é congelada na fatura — horas antigas são
  reprecificadas pela tarifa de hoje.
- **Substituição de NFS-e:** ~~`nDpsVariant: substituicao-${Date.now()}`
  (`nfse.service.ts:400`) abandona a idempotência que o comentário na mesma
  classe (linha 227) documenta como invariante.~~ **Corrigido em 31 ago
  2026** — semeado de `chaveAntiga` em vez de `Date.now()`, re-verificado
  contra a Homologação real da SEFIN Nacional. Continua aberto: o `update`
  da substituição não atualiza `nfseNumber`, então a tela segue mostrando a
  chave da nota cancelada.

### Autorização entre staff

- **`/v1/bi/executivo` sem `@AdminOnly`** entrega o financeiro do estúdio a
  qualquer staff e permite **derivar** o `costPerHour` que
  `users.controller.ts` redige com cuidado. Mesmo dado, outra porta.
- **`PATCH /v1/users/:id` não é self-scoped nem admin-only** — qualquer staff
  reescreve o registro de um colega, inclusive `role`, que é a chave por onde
  `createHourlyInvoice` escolhe a `RoleRate`. Trocar o papel altera o valor
  faturado das horas do colega.
- **`POST /v1/time-entries/:id/approve` sem gate** — e a aprovação é o único
  portão entre hora lançada e linha de fatura. O diretório `erp` usa
  `@AdminOnly` em onze outros controllers; a omissão é pontual.
- **`GET /v1/absences` devolve `costPerHour` de todos** — a redação foi aplicada
  em dois controllers e esquecida no terceiro.

### Vazamento por projeção

- **O export LGPD entrega ao cliente a composição interna de preço**
  (`ProposalStage.baseCost/adjustedCost/baseHours`,
  `Proposal.complexityMultiplier/packageDiscountPercent`),
  `Opportunity.lostReason` e as notas internas —
  `clients.service.ts:94-111` usa `include` sem `select` em nenhum dos três
  níveis. É a composição que `listPendingProposals` declara excluir. Corrigir no
  próprio `exportClientData`, não bifurcar por chamador.
- **`product.supplier` continua saindo pela rota pública de apresentação**
  (`public-presentation.service.ts:85`) — o achado C-03 fechou `sourceUrl` e
  `markupPercent`, mas não este.
- **Bytes do Drive servidos inline, na origem da aplicação, com `Content-Type`
  do arquivo, sem CSP nem `nosniff`.** O filtro de autorização é sólido e não
  foi furado; o problema é o cabeçalho de resposta.
- **Token do Drive resolvido como "um admin qualquer"** mas `drive.file` é
  concessão por (app, **usuário**, arquivo) — o token de um admin não abre o
  arquivo que outro vinculou. Causa **corrupção de dados**: a detecção de link
  quebrado recebe 404 legítimo e marca vínculos saudáveis como quebrados. Só
  adicionar `orderBy` piora (torna determinístico); é preciso registrar o dono
  da concessão no vínculo.

## 4. Regressão e não corrigidos

**Regressão — índices de FK.** A migração `20260828005223` adicionou 19 índices e
fechou o achado. A seguinte, `20260828132000`, criou as cinco tabelas do quadro
com FKs e **nenhum índice**. Mesmo caso em `OfficeLink.phaseId` (adicionada
depois da auditoria, e é a coluna que o checklist do gate consulta isoladamente)
e em `ClientMagicLink.clientId`/`ClientSession.clientId`. Falta o mecanismo, não
a correção pontual: sem checagem automática de "FK nova tem índice?", o próximo
modelo repete.

**Não corrigido — escopo por projeto para staff interno.** Revisores divergiram
sobre este item, e os dois estavam certos: para o **consultor externo** existe
(`CollaboratorProjectAccess`, negando por padrão); para o **staff interno**
nada mudou. `accessLevel` continua `admin`/`staff`, `ProjectMember` é lista de
equipe e não regra de acesso. Consequência concreta: qualquer staff marca
`visibleToClient` em qualquer vínculo de qualquer projeto.

## 5. Parciais que valem conhecer

- **"Baixar meus dados" nunca funciona** — o cookie do portal tem
  `Path=/portal` e a rota é `/api/portal/data-export`, então nunca é enviado e a
  resposta é sempre 401. O recurso de LGPD que existe está inacessível ao
  titular.
- **`/privacidade` é esqueleto honesto** — todas as seções trazem
  `[A PREENCHER — revisão jurídica necessária antes de publicar]` e a página
  avisa que não cumpre a LGPD. Documentado, não escondido; continua pendente.
- **A unicidade de `Client.email` foi criada sem normalizar nem deduplicar** os
  registros existentes, e a busca do magic link deixou de ser case-insensitive.
- **O blueprint de deploy nunca foi aplicado** e tem três defeitos que impedem a
  primeira subida: `API_URL`/`WEB_URL` vindos de `fromService` sem esquema de
  URL (o código concatena direto — toda chamada web→api e todo magic link
  quebram), `GOOGLE_CREDENTIAL_ENCRYPTION_KEY` com `generateValue: true` (nunca
  satisfaz o validador de 32 bytes), e a recomendação de conexão direta na 5432
  do Supabase, que pode ser inalcançável do Render.
- **O CI não roda o smoke test** — nenhum dos passos de `ci.yml` executa os 355
  checks.
- **`.dockerignore`: padrões de segredo não são recursivos** —
  `*.pfx`/`*.p12`/`*.pem`/`*.key` valem só na raiz do contexto. O caso concreto
  está coberto; a classe não.
- **Conexão com o Postgres não força TLS** (`packages/db/src/index.ts:6`; o
  default do `pg` é `ssl=false` e a connection string do painel não traz
  `sslmode`).

## 6. Médios e baixos que merecem atenção antes de operar com dinheiro real

- Substituição usa o ambiente **atual** da conta, não o ambiente onde a nota
  substituída vive (`nfse.service.ts:388`) — pode emitir substituta em produção
  para uma nota de homologação.
- Nota emitida em homologação é registrada como emissão real e apaga o sinal de
  "falta emitir NFS-e".
- Resposta perdida depois da autorização deixa a fatura irreconciliável: não há
  caminho de consulta, e o `archiveXmlBestEffort` (chamada de rede ao Drive)
  roda **entre** a autorização e o `update`.
- Falha no arquivamento do XML é gravada em `nfseXmlArchiveError`, campo que
  nenhum consumidor lê — e o XML não tem outra cópia durável.
- Os quatro `@Cron` não têm eleição de líder: escalar a API duplica notificações.
- Revogar convite de quadro não invalida o token do canal Realtime já emitido —
  convidado revogado segue lendo e escrevendo ao vivo.
- Várias pranchas na mesma página compartilham um client Supabase singleton: o
  `setAuth` do último quadro invalida o canal dos outros.
- Rota pública de lead escreve em `Client` existente encontrado por busca global
  de e-mail, sem escopo de conta.
- Notas internas (`Activity`) vão inteiras e retroativamente para o consultor
  externo, e quem escreve a nota não tem como saber disso.

## 7. Limites desta revisão

- **13 dos 26 achados severos não passaram por refutação adversarial** (corte em
  14 para limitar custo; 13 verdictos voltaram). Estão reportados com a
  confiança do revisor original, não com o mesmo escrutínio.
- **Nada foi executado.** O crítico do Supabase depende de configuração de
  painel fora do repositório.
- **A varredura de documentação não foi sistemática.**
  `especificacao-tecnica.md`, `decisoes-pos-descoberta.md`, os dois ADRs e
  `descoberta-questionario.md` não foram auditados linha a linha contra o código
  atual. O que foi corrigido nesta rodada: este documento, o `README`, o
  inventário de rotas públicas em `auth/public.decorator.ts`, `data-model.md`, a
  seção de NFS-e do roadmap e a legenda da tela de pipeline.
- **O relatório completo**, com os 71 achados detalhados (mecanismo, cenário de
  falha e correção por achado), os 55 itens reverificados e os 13 verdictos
  integrais, está em `auditoria-2026-08-30-detalhada.md` — este documento é o
  resumo acionável.
