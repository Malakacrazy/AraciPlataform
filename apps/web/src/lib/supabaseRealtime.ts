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

export interface BoardChannel {
  channel: RealtimeChannel;
  // Achado A61 da auditoria de 30 ago 2026 -- ver comentário abaixo:
  // devolvido pra quem chama poder desligar ESTE client específico no
  // cleanup, em vez de só dar unsubscribe no canal.
  disconnect: () => void;
}

// Achado A61 da auditoria de 30 ago 2026: um client Supabase de módulo
// (singleton) + setAuth trocando o token da CONEXÃO REALTIME INTEIRA (não
// do canal) parte da premissa de "um quadro por vez na página" -- falsa
// nas duas superfícies que renderizam mais de uma prancha ao mesmo tempo
// (ffe/page.tsx faz moodboards.map(...), present/[token]/page.tsx faz
// boards.map(...)): a última prancha a montar sobrescrevia o token de
// todas as outras, cujos canais passavam a falhar a policy silenciosamente
// (só um console.warn de CHANNEL_ERROR, que ninguém lê em produção) --
// diagnóstico natural ("a policy não foi aplicada") apontava pro lugar
// errado. Um client por CANAL (não mais um singleton de módulo) elimina a
// disputa: cada prancha tem sua própria conexão Realtime com seu próprio
// token, sem nenhuma pisar na auth da outra.
export function createBoardChannel(moodboardId: string, realtimeToken: string): BoardChannel {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados -- sincronização ao vivo do quadro indisponível.",
    );
  }
  const client = createClient(supabaseUrl, supabaseAnonKey);
  client.realtime.setAuth(realtimeToken);
  const channel = client.channel(`moodboard:${moodboardId}`, { config: { private: true } });
  return { channel, disconnect: () => client.realtime.disconnect() };
}
