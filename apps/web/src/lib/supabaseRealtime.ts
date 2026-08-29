"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

// Correção "moodboard vira quadro tldraw": Postgres (via Prisma/apps/api)
// continua sendo o sistema de registro do snapshot -- este canal só
// retransmite ao vivo entre quem está olhando o mesmo quadro ao mesmo
// tempo, nunca persiste nada sozinho. NEXT_PUBLIC_* de propósito: roda
// inteiro no navegador (canvas colaborativo), a "chave anônima" do
// Supabase é feita pra ser pública.
//
// Achado de revisão de segurança: a anon key ser pública era justamente o
// problema, porque o canal era PÚBLICO -- canal público não aplica
// autorização nenhuma, então a anon key (que qualquer um extrai do
// bundle) + um Moodboard.id (que não é segredo) bastavam pra escutar e
// pra INJETAR patches/comentários forjados em todo mundo com o quadro
// aberto. Agora o canal é privado: o Supabase aplica RLS sobre
// realtime.messages, e o acesso vem de um JWT curto assinado no servidor
// (ver lib/supabaseBoardToken.ts) só depois que a superfície que chamou
// já autorizou aquela pessoa naquele quadro. A anon key continua sendo o
// que identifica o PROJETO Supabase; ela deixou de ser o que concede
// acesso ao canal.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados -- sincronização ao vivo do quadro indisponível.",
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}

// Um canal por prancha -- todo mundo olhando o mesmo Moodboard.id entra
// no mesmo canal, independente de ser staff (tela do projeto), cliente
// (link de apresentação) ou convidado (portal do quadro via Logto). A
// diferença agora é que cada um chega com um token que prova que pode
// estar ali, emitido pela própria superfície depois de checar o acesso.
export function createBoardChannel(moodboardId: string, realtimeToken: string): RealtimeChannel {
  const supabase = getSupabaseClient();
  // setAuth troca a anon key pelo JWT em TODA conexão realtime deste
  // client -- é a API que o supabase-js expõe pra isso; como o
  // componente abre um quadro por vez, não há sobreposição de tokens de
  // quadros diferentes na mesma página.
  supabase.realtime.setAuth(realtimeToken);
  return supabase.channel(`moodboard:${moodboardId}`, { config: { private: true } });
}
