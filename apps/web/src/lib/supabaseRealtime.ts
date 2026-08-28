"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

// Correção "moodboard vira quadro tldraw": Postgres (via Prisma/apps/api)
// continua sendo o sistema de registro do snapshot -- este canal só
// retransmite ao vivo entre quem está olhando o mesmo quadro ao mesmo
// tempo, nunca persiste nada sozinho. NEXT_PUBLIC_* de propósito: roda
// inteiro no navegador (canvas colaborativo), a "chave anônima" do
// Supabase é feita pra ser pública -- o Realtime Broadcast usado aqui
// não toca em nenhuma tabela do Supabase, só relay de mensagem entre
// clientes no mesmo canal.
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
// (link de apresentação) ou convidado (portal do quadro via Logto).
export function createBoardChannel(moodboardId: string): RealtimeChannel {
  return getSupabaseClient().channel(`moodboard:${moodboardId}`);
}
