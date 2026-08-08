# Questionário de descoberta — Fase 0

Rascunho para a conversa de levantamento com a Giulia, cobrindo os itens
que o plano lista em "Próximos Passos" (nomenclatura de fases, modelos de
honorário, fluxo real de trabalho) e as decisões que o modelo de dados
esqueleto deixou em aberto. Cada resposta deve gerar um ajuste direto no
schema em `packages/db/prisma/schema.prisma` ou no roadmap de fases.

## Fluxo de projeto

1. As fases do plano (Estudo Preliminar, Anteprojeto, Projeto Executivo)
   batem com a nomenclatura real usada no dia a dia, ou há fases
   adicionais/diferentes (ex. briefing, pós-obra)? Está diferente, olhar PEP_Interior.md
2. Todo projeto passa por todas as fases na mesma ordem, ou varia por tipo
   de cliente/projeto? Varia olhar PEP_Interior.md
3. Quais marcos de cada fase disparam faturamento? Olhar PEP_Interior.md

## Modelos de honorário

4. Dos cinco modelos citados (% sobre CUB, valor por m², hora técnica,
   valor fixo, recorrente), quais são realmente usados hoje? Algum outro? Hora Tecnica. Olhar Base_Precificacao (fazer cópia).xlsx
5. Um mesmo projeto pode misturar modelos (ex. fixo para o projeto + hora
   técnica para revisões extras)? Hoje não.

## Equipe e horas

6. Como as horas são registradas hoje (planilha, outro sistema, nada
   ainda)? Isso muda a prioridade do timesheet na Fase 1. Nad ainda
7. Freelancers eventuais (renderistas, desenhistas) são contratados com
   que frequência? Isso valida a prioridade do RPA/retenções no ERP. Poua frequencia

## Financeiro e fiscal

8. Enquadramento atual: Simples Nacional Anexo III ou V? Já há histórico
   de folha/receita para calibrar o simulador de Fator R? Anexo III. Média de 7k/mês
9. Qual parceiro fiscal (se algum) já é usado ou cotado para NFS-e/boleto/
   Pix — Asaas, eNotas, NFE.io, Focus NFe, outro? Não tem
10. Existe contador/consultoria fiscal que deveria revisar o módulo
    financeiro antes do go-live (o plano recomenda isso antes da Fase 2)? Sim

## FF&E e Canoa Supply

11. Volume aproximado de produtos/especificações já cadastrados na Canoa
    Supply, para dimensionar o esforço de importação na Fase 3. Não precisa fazer importação
12. Quais fornecedores/sites são prioritários para o web scraper? Tem um prototipo de web scrapper já em outro repositorio
13. Como é o processo hoje de aprovação de itens pelo cliente (e-mail,
    reunião, PDF)? Isso define os requisitos do "modo de apresentação". Coisas menores via whatsapp. Coisas maiores por e-mail após reunião.  

## Office / Google Workspace

14. Todo o escritório já usa Google Workspace, ou há ferramentas
    paralelas (Outlook, Dropbox) que também precisam de atenção? Só workspace
15. Existe domínio corporativo único para restringir o SSO
    (`hd` no login Google), ou contas pessoais também precisam de acesso? Existe dominio corporativo

## Validação do escopo

16. Confirmar: acompanhamento de obras/canteiro e procurement geral
    permanecem fora do escopo mesmo sabendo que a maioria dos
    concorrentes brasileiros inclui isso por padrão? Sim, o escritorio hj não consegue oferecer esse tip de serviço, por isso está fora
17. A Canoa Supply continua em uso paralelo até a Fase 3 estar pronta,
    conforme recomendação do plano? A avaliar ainda
