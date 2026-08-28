# Decisões pós-descoberta

O questionário de descoberta (`descoberta-questionario.md`) foi respondido e
apontou para dois documentos reais do estúdio que substituem suposições
genéricas do plano original: `PEP_Interior.md` (metodologia de projeto,
RIBA Plan of Work 2020 adaptado) e `Base_Precificacao (fazer cópia).xlsx`
(motor de precificação bottom-up). Este documento registra o que muda no
schema/spec por causa disso, e o que ainda está em aberto — para não deixar
essas mudanças implícitas espalhadas em commits sem explicação.

## 1. Fases do projeto — 5 estágios reais, não 3 genéricos

O plano original falava em "Estudo Preliminar, Anteprojeto, Projeto
Executivo". O PEP real do estúdio define **5 estágios**, com nomes,
critério de aceite e forma de aprovação específicos:

| Estágio | Nome | Equivalente NBR | Critério de aceite |
|---|---|---|---|
| 0 | Captação e Alinhamento | LV + PN inicial | Agendamento da reunião de briefing |
| 1 | Briefing | PN + LV detalhado | Assinatura do contrato |
| 2 | Criação e Conceito | EP | **Gate 1** — aprovação formal do conceito |
| 3 | Detalhamento de Acabamentos | AP | **Gate 2** — aprovação formal do memorial |
| 4 | Executivo | PE | **Gate 3** — aprovação formal, encerra o escopo |

Regras de aprovação que o modelo de dados precisa carregar, não só o nome
da fase:
- Aprovação é **por escrito** — e-mail conta, WhatsApp não conta.
- Cliente tem **7 dias úteis** para revisar cada entrega antes do gate.
- Faturamento é **por estágio concluído e aprovado** (confirma a resposta
  3 do questionário — sem gate aprovado, sem fatura daquele estágio).
- Mudança após um gate aprovado entra em fluxo de Change Request: o
  coordenador avalia impacto em **1 dia útil**; impacto acima de **4h de
  trabalho ao valor vigente da hora do Arquiteto Líder** (R$ 240,80 no
  cenário atual da planilha — é um valor derivado, não fixo) ou acima de
  **50% do valor já aprovado da etapa** exige aditivo formal.

→ `ProjectPhase` no schema passa a ter os 5 nomes canônicos, um campo de
aprovação (quem, quando, por qual canal) e um prazo de revisão, em vez de
nomes livres de fase.

## 2. Modelo de honorário — só hora técnica, mas com motor de cálculo real

Resposta 4 confirma que, na prática, só **hora técnica** é usada hoje (os
outros quatro modelos do plano — % CUB, m², fixo, recorrente — ficam no
schema como opções futuras, não como algo a construir na Fase 1). Resposta
5 confirma que não há mistura de modelos num mesmo projeto.

A planilha de precificação mostra que "hora técnica" aqui não é um valor
digitado à mão — é o resultado de um pipeline de cálculo:

```
custos fixos mensais do estúdio → overhead por hora faturável
      (aba 01)

salário + encargos por papel, horas faturáveis/mês → custo direto/hora
custo direto/hora + overhead → custo total/hora
custo total/hora × (1 + margem-alvo) / (1 − carga tributária) → tarifa/hora
      (aba 02 — margem-alvo hoje: 30%; carga tributária: 6%)

horas base por papel × estágio, calibradas em projeto baseline
      (aba 03)

5 dimensões de complexidade (tipologia, programa, terreno, regulatório,
ambição de design), score 1–5 cada → score médio → multiplicador de horas
      (aba 04 — 1.0 → 0.70x ... 5.0 → 1.50x; a complexidade multiplica
      horas, nunca a tarifa/hora — projeto complexo demanda mais iteração,
      não justifica cobrar mais caro por hora)

estágios contratados × horas ajustadas × tarifa/hora → subtotal
pacote de 4-5 estágios → desconto de 10% sobre o subtotal
      (aba 05 — o configurador)
```

A aba 06 já registra 6 cenários comerciais nomeados (Pacote Completo,
Cliente Antigo, Um Briefing/Dois Projetos, Consultoria, Executivo +
Memorial, Executivo Completo) com notas de venda (ex.: "Cenário A é a
oferta-âncora, mostre primeiro") — isso é direcionamento de produto real
para o builder de propostas do CRM, não só uma referência de preço.

**Importante:** vários números de entrada na planilha (aluguel = R$0,
software = R$0, hardware = R$0, 1 pessoa ativa no estúdio) são
placeholders não calibrados — a própria aba de instruções da planilha diz
isso explicitamente. A **lógica/estrutura do cálculo é real e deve ser
implementada**; os valores atuais não devem ser tratados como dados de
produção.

→ Mudanças de schema: `Proposal` ganha campos de complexidade/horas/
desconto; nova tabela `ProposalStage` (linha por estágio contratado,
espelhando a aba 05); nova tabela `RoleRate` (papel → tarifa/hora por
conta). A fórmula em si (overhead, margem, impostos) vira função pura em
`apps/api/src/crm/pricing.ts`, não fica persistida como estado — só os inputs
(custos fixos, papel/tarifa, scores de complexidade) e o resultado
(proposta calculada) são dados.

**Reconciliação de papéis — confirmada pela Giulia.** A primeira versão
deste documento propunha adotar "Designer" (raciocínio: o PEP usa esse
termo de forma consistente, e o estúdio é de Interior Design) — **essa
leitura estava errada**. Confirmado diretamente: é "Arquiteto" em todos
os níveis, sem Coordenador BIM, e sem "Especificador FF&E" como papel
próprio (a especificação de FF&E é feita pelos papéis de Arquiteto
existentes, não por uma função dedicada).

| Papel canônico |
|---|
| Arquiteto Líder (RT) |
| Coordenador de Projeto |
| Arquiteto Sênior |
| Arquiteto Pleno |
| Arquiteto Júnior |
| Estagiário |
| Lead 3D / Visualização |

Isso essencialmente confirma a planilha de precificação como já estava
(menos o Coordenador BIM, que segue removido — contradiz o PEP: "Sem
componente BIM — fluxo CAD + SketchUp/3D"), não o PEP. Lição para não
repetir: inferir a partir de qual documento "parece" mais autoritativo é
pior do que perguntar — o palpite anterior tinha uma lógica plausível e
mesmo assim estava invertido.

Lista canônica em código: `apps/web/src/lib/roles.ts`
(`CANONICAL_ROLES`) — referência para seed/UI, não uma trava no schema
(`RoleRate.role` continua string livre). Calibrar a planilha de
precificação com esses nomes é uma tarefa de planilha, fora deste repo.

## 3. FF&E — sem migração da Canoa, scraper já existe

Resposta 11 muda uma recomendação do próprio plano original: **não** é
necessário importar dados da Canoa Supply — o risco de "reconstruir FF&E
do zero" que o plano apontava como maior risco do roadmap fica menor.

Resposta 12: já existe um **protótipo de web scraper em outro repositório**
— [Malakacrazy/Captura](https://github.com/Malakacrazy/Captura), projeto
"Studio Araci · Orçamento FF&E". Vale ajustar a expectativa de arquitetura
que a `especificacao-tecnica.md` original tinha ("roda como job
assíncrono no backend"): não é isso. É uma **extensão de Chrome**
(Manifest V3, JS puro, sem backend) que injeta um botão flutuante nas
páginas de produto de 18 lojas brasileiras (Leroy Merlin, Tok&Stok,
Camicado, Dexco, Deca, Electrolux, Brastemp, entre outras), extrai nome/
marca/SKU/preço/imagem com seletor específico por loja e fallback
genérico via JSON-LD/Open Graph/varredura de texto, e já gera PDF de
orçamento com a identidade visual "Studio Araci" — tudo salvo localmente
no navegador (Chrome Storage API), sem persistir em nenhum backend hoje.

Isso muda a pergunta de arquitetura da Fase 3: não é "construir um scraper
do zero", é "decidir como uma captura que já roda no navegador do usuário
chega até o `Product`/`ProductSpecification` da plataforma" — ver opções
em `especificacao-tecnica.md`. Essa decisão fica para a Fase 3, não agora.

Resposta 13 mostra dois canais de aprovação com pesos diferentes: itens
menores por WhatsApp, itens maiores por e-mail após reunião. Isso não
contradiz a regra do PEP de "aprovação formal só por e-mail" — aquela
regra é para os **gates de estágio** (contratual); aprovação de item de
FF&E dentro de um estágio já aprovado é mais informal e pode ficar em
WhatsApp para itens pequenos. `ProductSpecification.clientApproved` não
precisa (por ora) do mesmo rigor de canal que `ProjectPhase`.

## 4. Fiscal

Anexo III confirmado, receita média ~R$ 7.000/mês (resposta 8) — útil para
calibrar o simulador de Fator R depois que a planilha de precificação
tiver números reais de custo/margem. Consultoria contábil vai revisar
antes do go-live (resposta 10) — já era a recomendação do plano, agora
confirmada como plano real, não só sugestão.

**Decidido**: emissão de **NFS-e** via
[nfewizard-org/nfewizard-io](https://github.com/nfewizard-org/nfewizard-io)
— não um parceiro SaaS (Asaas/eNotas/NFE.io/Focus NFe ficam descartados
para esse fim). É uma **biblioteca Node.js open source** que fala direto
com os webservices da SEFAZ/prefeitura, sem intermediário — e o estúdio
vai hospedar o próprio **certificado digital A1**. Isso não cobre
boleto/Pix (cobrança), que continua em aberto separadamente, com um
fornecedor possivelmente diferente. Isso muda o trade-off da emissão
fiscal, não só a escolha do provedor:

- **Sem custo de assinatura**, mas o estúdio passa a ser responsável por
  possuir e custodiar um **certificado digital A1** (arquivo `.pfx` +
  senha) em nome do CNPJ — hoje isso não existe no processo do estúdio.
- O módulo de NFS-e vive num pacote separado, `@nfewizard/nfse`, e o
  próprio README o marca como **"em fase de testes"** — não é hardened
  para produção ainda.
- Ele já mira especificamente a **NFS-e Nacional** (SEFIN Nacional, DPS —
  Declaração de Prestação de Serviços), que é exatamente o requisito que
  o plano original apontou como obrigatório desde janeiro de 2026 — bom
  sinal de que o mantenedor acompanha a mudança regulatória certa. Mas há
  uma issue aberta e sem solução definitiva sobre qual perfil de
  assinatura XML (XMLDSig) a SEFIN Nacional aceita para a DPS — o
  exemplo oficial da lib troca entre 4 perfis distintos "para testar qual
  funciona", o que é um sinal real de instabilidade nessa integração
  específica, não só um rótulo de "beta" genérico.
- Validação de schema XSD completa exige JDK no ambiente (tem um modo
  alternativo sem JDK, `validateSchemaJsBased`, mas com menos garantia).
  Isso importa para onde a Fase 2 for hospedada (Vercel, por exemplo, não
  tem JDK).
- Licença **GPL-3.0** (copyleft). Para uso como dependência de um backend
  privado que não é redistribuído (o caso daqui — é um SaaS interno, não
  um produto distribuído a terceiros), a leitura comum é que isso não
  obriga a abrir o código da plataforma (diferente de AGPL, que mira
  justamente uso via rede). Isso não é parecer jurídico — vale confirmar
  com a consultoria contábil/jurídica antes de depender disso, não supor.
- Mantida por uma única pessoa majoritariamente (projeto pede doação no
  próprio README) — risco de continuidade diferente de um fornecedor SaaS
  com SLA.

Consequência direta de hospedar o certificado: o arquivo `.pfx` e a senha
são segredo, não configuração — nunca em `.env.example`, nunca commitado,
nunca logado (`nfewizard-io` já grava logs em disco por padrão —
`pathLogs`/`armazenarLogs` precisam de cuidado para não vazar dado
sensível em texto claro). Guardar em variável de ambiente/secrets manager
do ambiente de produção, igual a `DATABASE_URL`/`NEXTAUTH_SECRET` hoje.
Renovação anual do certificado A1 vira uma tarefa operacional recorrente
do estúdio, não só um detalhe técnico único de setup.

**Dado fiscal real confirmado pela Giulia** (2026-08-24), depois da emissão
de teste mecânica ter funcionado contra a Homologação da SEFIN Nacional
(ver roadmap-atualizado.md, Fase 2):

- **Endereço do prestador**: Rua Poetisa Colombina, nº 143, Apto 184,
  Jardim Bonfiglioli, São Paulo/SP, CEP 05593-010. Achado testando de
  verdade: a SEFIN Nacional rejeita esse campo na DPS quando o emitente é
  o próprio prestador (E0128) — ela já resolve o endereço pelo CNPJ
  cadastrado, então isso não entra no payload, mas fica registrado aqui
  como a fonte da verdade.
- **Inscrição Municipal**: não existe (N/A) — confirmado, não pendência.
- **Arquitetura não pode ser MEI** (exige registro profissional/CAU, fora
  da lista de atividades permitidas ao MEI) — isso muda o código de
  serviço válido conforme o regime:
  - **Enquanto MEI** (regime real do estúdio hoje, `Account.taxRegime`):
    código nacional **170201** (Datilografia — a atividade de fato
    registrada no MEI atualmente, não Arquitetura).
  - **Depois de ME**: código nacional **070104** (Arquitetura) e código
    municipal de São Paulo **1520** (Arquitetura, ME only) — nenhum dos
    dois pode ser usado enquanto o regime for MEI.
- **Alíquota de ISS**: 0% enquanto MEI (recolhido de forma fixa via
  DAS-MEI, não variável por nota); 5% depois de ME.
- Implementado em `nfse-test-dps.ts`: `cTribNac` trocado de um placeholder
  arbitrário (`110101`, código de outro serviço só usado pra passar da
  validação de schema) para o código real e correto do regime atual
  (`170201`). Recomendação clara para quando a migração pra ME
  acontecer: o builder de DPS real (ainda não construído — isto aqui
  continua sendo só o teste mecânico com cliente/valor fictícios) precisa
  escolher `070104`/`1520` versus `170201` **condicionado a
  `Account.taxRegime`**, nunca hardcoded, porque emitir sob o código
  errado do regime é uma inconsistência fiscal real, não só um detalhe
  técnico.

## 5. Escopo e Office

Exclusão de acompanhamento de obras confirmada com motivo concreto
(resposta 16: o estúdio não consegue oferecer esse serviço hoje) — mais
forte que "escolha deliberada de posicionamento" do plano original, é
também uma limitação operacional atual. Uso paralelo da Canoa (resposta
17) segue em aberto.

Domínio corporativo Google Workspace confirmado: `studioaraci.com.br` —
já preenchido em `apps/web/src/lib/auth.ts` (`hd` restringindo o login a
esse domínio).

Carga tributária da fórmula de tarifa/hora (aba 02): **6%**.

**Confirmado (gestão documental, lacuna da matriz) — tipo do app OAuth do
Google já é Internal, não External.** A auditoria pediu essa decisão como
spike obrigatório antes de aprofundar em Drive; a checagem (2026-08-28)
confirmou que o app já estava configurado como Internal desde antes desta
sessão — nenhuma ação nova foi necessária. Como o domínio
`studioaraci.com.br` já é um Google Workspace confirmado (acima) e todo
mundo que loga na plataforma é `@studioaraci.com.br` (achado C-01, já
reforçado por `signIn` callback + `hd`), Internal restringe o app a
contas do próprio Workspace, sem processo de verificação do Google
nenhum, **mesmo para escopos "sensíveis"/"restritos"**
(`calendar.events`, `gmail.readonly`, `drive.file`) — elimina de vez a
necessidade da avaliação de segurança CASA que bloquearia produção com um
app External (ver bloqueador "decisão de produto escondida na
infraestrutura" da rodada de blockers), **desde que o uso continue só
interno** (equipe do estúdio). Se um dia o portal do cliente precisar de
login Google (não precisa hoje — magic link), isso mudaria a análise,
porque o cliente está fora do Workspace.

**Escopo `drive.file` (não um escopo mais amplo) para GoogleDriveService.**
Mesmo escopo que o Picker do Drive já usa no navegador (`DRIVE_SCOPE` em
`lib/google-client.ts`) — suficiente porque o modelo adotado é "a
plataforma cria e é dona da árvore de pastas" (recomendação da própria
auditoria: Drive continua guardando os arquivos, a plataforma só passa a
ser dona da árvore/metadados). `drive.file` dá acesso a qualquer arquivo/
pasta que o app CRIE dali em diante, sem precisar do escopo mais amplo
(`drive`) que enxergaria o Drive inteiro da pessoa conectada — menor
privilégio pelo mesmo motivo já documentado para `gmail.send` vs.
`gmail.readonly` acima.

## Pendências abertas (não travam Fase 0, mas travam Fase 1 em algum ponto)

- Calibração real dos custos fixos do estúdio e das horas base por
  estágio (hoje são placeholders na planilha).
- ~~Obter o certificado A1 do estúdio (emissão + custódia)~~ — resolvido:
  certificado real em `StudioAraci.pfx` (fora do git, `*.pfx` no
  `.gitignore`), configurado via `.env` e verificado (CNPJ
  53554180000110, válido até 24/08/2027). Ver
  `roadmap-atualizado.md` Fase 0.
- Decidir, na Fase 3, como a captura da extensão Captura chega até a
  plataforma (extensão passa a chamar a API própria vs. a plataforma
  reimplementa a extração vs. os dois convivem por um tempo).
