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
      (aba 02 — margem-alvo hoje: 30%; carga tributária: ainda não configurada)

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
`modules/crm/pricing.ts`, não fica persistida como estado — só os inputs
(custos fixos, papel/tarifa, scores de complexidade) e o resultado
(proposta calculada) são dados.

**Conflito a resolver com a Giulia, não a inventar aqui:** os papéis da
equipe divergem entre os dois documentos — o PEP fala em "Designer
Sênior/Pleno/Júnior" e "Especificador FF&E"; a planilha fala em "Arquiteto
Sênior/Pleno/Júnior" e "Coordenador BIM" (não há BIM no escopo do PEP, que
é explícito: "Sem componente BIM — fluxo CAD + SketchUp/3D"). Os nomes de
papel no schema devem esperar essa reconciliação em vez de escolher um dos
dois lados agora.

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
tiver números reais de custo/margem. Nenhum parceiro fiscal escolhido
ainda (resposta 9) — mantém a decisão em aberto no ADR. Consultoria
contábil vai revisar antes do go-live (resposta 10) — já era a
recomendação do plano, agora confirmada como plano real, não só sugestão.

## 5. Escopo e Office

Exclusão de acompanhamento de obras confirmada com motivo concreto
(resposta 16: o estúdio não consegue oferecer esse serviço hoje) — mais
forte que "escolha deliberada de posicionamento" do plano original, é
também uma limitação operacional atual. Uso paralelo da Canoa (resposta
17) segue em aberto.

Domínio corporativo Google Workspace confirmado: `studioaraci.com.br` —
já preenchido em `apps/web/src/lib/auth.ts` (`hd` restringindo o login a
esse domínio).

## Pendências abertas (não travam Fase 0, mas travam Fase 1 em algum ponto)

- Carga tributária efetiva a usar na fórmula de tarifa/hora (aba 02).
- Calibração real dos custos fixos do estúdio e das horas base por
  estágio (hoje são placeholders na planilha).
- Reconciliação dos nomes de papel da equipe entre o PEP e a planilha.
- Decidir, na Fase 3, como a captura da extensão Captura chega até a
  plataforma (extensão passa a chamar a API própria vs. a plataforma
  reimplementa a extração vs. os dois convivem por um tempo).
