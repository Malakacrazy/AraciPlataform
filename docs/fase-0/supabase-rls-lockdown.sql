-- Fecha a exposição do achado CRÍTICO A10 da auditoria de 30 ago 2026
-- (docs/auditoria-2026-08-30-detalhada.md) -- APLICAR NO PROJETO SUPABASE
-- (SQL Editor), NUNCA via `prisma migrate deploy`/preDeployCommand: isto
-- não é uma migração de schema, é um endurecimento de acesso específico
-- do Supabase que não faz sentido nenhum contra o Postgres local de dev.
--
-- POR QUE ISTO EXISTE: o banco de produção é um projeto Supabase, e é o
-- MESMO projeto que serve o Realtime do quadro (ver
-- supabase-realtime-policy.sql, já aplicado). Duas propriedades, juntas,
-- abrem o banco inteiro pra qualquer visitante:
--   1. A `anon key` vai DELIBERADAMENTE pro bundle do navegador --
--      Realtime precisa dela (NEXT_PUBLIC_SUPABASE_ANON_KEY).
--   2. A Data API do Supabase (PostgREST, `/rest/v1`) é pública por
--      construção; o único freio dela é RLS. Nenhuma das 38+ migrações
--      deste projeto habilita RLS em tabela nenhuma -- toda tabela do
--      Prisma fica alcançável pela Data API com a MESMA anon key
--      pública: Client (CPF, e-mail, telefone), Invoice, RoleRate
--      (costPerHour), GoogleCredential (refresh token cifrado, mas ainda
--      assim a linha inteira), sessões de portal.
-- A decisão de arquitetura já registrada (especificacao-tecnica.md) é
-- explicitamente "não confiar em RLS, Prisma é a única porta" -- coerente
-- SOZINHA, incompatível com hospedar esse schema num projeto cuja porta
-- alternativa (a Data API) está aberta.
--
-- O QUE ISTO NÃO FAZ (ação manual sua, só no painel -- nenhum SQL resolve):
--   1. DESLIGAR A DATA API DO PROJETO. Settings -> API -> Data API ->
--      desligar. O código nunca a usa (`grep -rn "\.from(\|rest/v1"
--      apps/web/src apps/api/src` não encontra chamada nenhuma -- o
--      Prisma usa conexão direta/pooler, nunca PostgREST) -- é a correção
--      MAIS BARATA E MAIS EFICAZ das quatro, porque fecha a porta em vez
--      de só trancá-la. Faça isto ANTES ou DEPOIS de rodar este arquivo,
--      mas faça -- o resto daqui é defesa em profundidade, não
--      substituto.
--   2. SEPARAR O PROJETO SUPABASE DO REALTIME do projeto que hospeda o
--      schema da aplicação, pra que a anon key publicada no bundle e o
--      schema de negócio parem de coabitar o mesmo projeto. Trabalho de
--      infraestrutura (criar projeto novo, migrar Realtime, atualizar
--      NEXT_PUBLIC_SUPABASE_URL), não uma linha de SQL.
--
-- Idempotente -- seguro rodar de novo (ex.: depois de uma migração nova
-- do Prisma criar uma tabela).

-- 1) RLS habilitado em TODA tabela do schema public, sem policy nenhuma
-- -- o padrão do Postgres sem policy é NEGAR pra qualquer role que não
-- seja o dono/superuser. Prisma conecta como o dono das tabelas (ou um
-- role com BYPASSRLS), então a aplicação continua funcionando 100% igual;
-- só anon/authenticated (as roles que a Data API usa) passam a não ver
-- nada. Enable, não FORCE -- FORCE bloquearia até o próprio dono, e não é
-- isso que se quer aqui.
do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- 2) REVOKE explícito em cima do RLS, não em vez dele -- defesa em
-- profundidade: mesmo que uma policy futura acabe liberando demais por
-- engano, anon/authenticated não têm o GRANT de base pra explorar isso.
-- Schema USAGE não é revogado aqui de propósito -- é mais amplo que o
-- necessário pra este achado e pode quebrar uso legítimo futuro de
-- Supabase Auth; os GRANTs de tabela/sequência abaixo já bastam pra
-- Data API não conseguir ler/escrever nada.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 3) Sem isto, a PRÓXIMA `prisma migrate deploy` que criar uma tabela
-- nova reabriria o buraco sozinha -- o Supabase concede GRANT em objeto
-- novo pra anon/authenticated por default de fábrica. Precisa ser
-- executado pela MESMA role que o Prisma usa pra criar tabela (em geral
-- `postgres`, a role padrão do SQL Editor) -- confirme no painel se a
-- connection string de produção usa uma role diferente.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
