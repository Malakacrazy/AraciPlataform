-- Autorização do canal Realtime dos quadros (tldraw) -- APLICAR NO
-- PROJETO SUPABASE (SQL Editor). Sem isto, os canais privados recusam
-- todo mundo e a sincronização ao vivo simplesmente não acontece (o
-- quadro continua funcionando: Postgres, via apps/api, é o sistema de
-- registro -- o canal só acelera a entrega entre navegadores).
--
-- POR QUE ISTO EXISTE (achado de revisão de segurança): o canal era
-- PÚBLICO. Canal público no Supabase não aplica autorização nenhuma, e a
-- anon key é pública por desenho (vai no bundle do navegador). Resultado:
-- qualquer pessoa com a anon key e um Moodboard.id -- que não é segredo,
-- aparece na URL de /quadro/{id} e na resposta da API pública de
-- apresentação -- conseguia escutar todo traço e todo comentário ao vivo
-- sem convite/token/login, e ainda transmitir patches e comentários
-- forjados pra todo mundo com o quadro aberto.
--
-- COMO FUNCIONA AGORA: apps/web assina um JWT curto (2h) por quadro,
-- só DEPOIS que a superfície que pediu já autorizou aquela pessoa
-- naquele quadro -- staff pela sessão NextAuth, cliente pelo token do
-- link de apresentação, convidado pela sessão do Logto. A claim
-- board_topic carrega exatamente um tópico, e a policy abaixo só deixa
-- passar mensagem cujo tópico bata com ela. Ver
-- apps/web/src/lib/supabaseBoardToken.ts.

-- Pré-requisito: o segredo usado pra assinar precisa ser o JWT secret
-- DESTE projeto Supabase (Dashboard > Settings > API > JWT Settings >
-- JWT Secret), configurado como SUPABASE_JWT_SECRET no apps/web.

-- NÃO fazer `alter table realtime.messages enable row level security`
-- aqui: essa tabela pertence a supabase_realtime_admin, não ao papel
-- `postgres` do SQL Editor, então o comando falha com
-- "42501: must be owner of table messages" (achado rodando de verdade).
-- Também é desnecessário -- o Supabase já entrega realtime.messages com
-- RLS habilitado; o que falta é só a policy.

-- Recriar do zero pra que reaplicar o arquivo seja seguro.
drop policy if exists "araci_board_realtime_read" on realtime.messages;
drop policy if exists "araci_board_realtime_write" on realtime.messages;

-- Receber (o cliente lê as mensagens do tópico).
create policy "araci_board_realtime_read"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = (auth.jwt() ->> 'board_topic')
  );

-- Transmitir (o cliente publica broadcast no tópico). `with check` é o
-- que vale pra INSERT -- sem ele, qualquer autenticado publicaria em
-- qualquer tópico, que é exatamente o buraco que estamos fechando.
create policy "araci_board_realtime_write"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() = (auth.jwt() ->> 'board_topic')
  );
