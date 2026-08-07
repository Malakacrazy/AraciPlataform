# Modelo de dados — esqueleto inicial

Schema completo em `packages/db/prisma/schema.prisma`. Este documento
explica as escolhas e, mais importante, o que **ainda não está modelado** —
para não passar a falsa impressão de que o modelo está fechado.

## Estrutura por módulo

- **Tenancy**: `Account` é a raiz de tudo (a firma/escritório). Todas as
  entidades de domínio referenciam `accountId`, direta ou indiretamente,
  seguindo o princípio "dados organizados por conta/empresa desde o
  início" do plano.
- **CRM**: `Client` → `Opportunity` (pipeline) → `Proposal`. `Opportunity`
  ganha vira `Project` via `opportunityId` único (mapeia a conversão
  automática lead→projeto descrita no plano).
- **ERP Arquitetura**: `Project` → `ProjectPhase` → `Task`; `ProjectMember`
  liga `User` a `Project`; `TimeEntry` é o apontamento de horas;
  `Invoice` é o faturamento por projeto.
- **FF&E**: `Area` (ambiente do projeto) → `ProductSpecification` (linha do
  carrinho) → `Product` (catálogo). A soma das `ProductSpecification` com
  `clientApproved = true` é o orçamento/planilha final — não existe uma
  tabela "Cart" separada porque a especificação aprovada já é o carrinho.
- **Office**: deliberadamente não modelado como dados próprios. Arquivos do
  Drive, e-mails do Gmail e eventos do Calendar são referenciados por ID
  externo a partir de outras entidades (não incluído neste esqueleto) — o
  plano é explícito que a plataforma não deve recriar o Workspace.

## Campos fiscais incluídos de propósito

`Account.taxRegimeAnexo` e `Account.fatorRPercent` existem desde já porque
o plano cita a simulação de Fator R como diferencial competitivo real
(nenhum concorrente pesquisado oferece isso). `Invoice.nfseNumber` marca o
ponto de integração com o parceiro fiscal (Fase 2).

## O que NÃO está modelado ainda (intencional, não esquecido)

Estes pontos aparecem no plano mas dependem de decisões de Fase 0 que
ainda não foram tomadas (ex. qual parceiro fiscal, formato de RPA) — foram
deixados de fora para não travar uma estrutura errada cedo demais:

- Cálculo/retenções de RPA para freelancers (INSS, IRRF, ISS)
- Calendário de férias/ausências e planejamento de capacidade da equipe
- Checklist de RRT e vínculo com SICCAU/CAU
- Contas a pagar, fluxo de caixa e DRE simplificado
- Moodboards/pranchas de apresentação e o "modo de apresentação" por link
- Tear sheets (ficha técnica exportável) como entidade own — hoje seria
  gerado a partir de `Product`, mas o layout/template não está modelado
- Vínculo de arquivos do Google Drive/Gmail/Calendar a `Project`/`Client`
- Indicador de sustentabilidade/pegada de carbono por produto
- Campos da Reforma Tributária (CST-IBS, CST-CBS, cClassTrib) — o plano
  recomenda adicioná-los a partir da Fase 2, não antes

## Multi-tenancy: decisão pendente

O schema usa `accountId` em cada tabela (row-level tenancy num banco
único), adequado para uma única firma hoje com caminho de crescimento. Se
o produto vier a atender múltiplas firmas simultaneamente, vale reavaliar
isolamento mais forte (schema por tenant ou banco por tenant) — não é uma
decisão para a Fase 0 do projeto da Giulia, mas fica registrada aqui para
não ser esquecida se o produto for revendido no futuro.
