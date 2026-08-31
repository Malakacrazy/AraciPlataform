import { SignJWT } from "jose";

// Achado de revisão de segurança (o mais sério da rodada): o canal
// Realtime era PÚBLICO. Canal público no Supabase não exige autorização
// nenhuma -- e a anon key é, por desenho, pública (vai no bundle do
// navegador). Ou seja: qualquer pessoa com a anon key e um Moodboard.id
// (que não é segredo -- aparece na URL de /quadro/{id} e na resposta da
// API pública de apresentação) conseguia (a) escutar todo traço e todo
// comentário ao vivo, sem convite/token/login, e (b) transmitir patches
// e comentários forjados pra todo mundo que estivesse com o quadro
// aberto, inclusive assinando comentário com o nome de quem quisesse.
//
// A correção é canal PRIVADO: o Supabase passa a aplicar RLS sobre
// realtime.messages, e pra isso o cliente precisa de um JWT de verdade
// (não a anon key). Este módulo assina esse JWT do lado do servidor,
// DEPOIS que a superfície que chamou já provou que a pessoa pode ver
// aquele quadro (sessão de staff, token do link de apresentação, ou
// sessão de convidado do Logto) -- o token nunca é emitido "pra
// qualquer um que peça".
//
// Escopado a UM quadro por token (claim board_topic): o componente
// abre um quadro por vez, então não há motivo pra emitir credencial mais
// larga que isso. A policy que consome esta claim está em
// docs/fase-0/supabase-realtime-policy.sql -- precisa ser aplicada no
// projeto Supabase pra que isto tenha efeito.
//
// Achado A60 da auditoria de 30 ago 2026: revoke() de um convite (fim de
// contrato, pessoa desligada) apaga só WhiteboardGuestAccess -- o JWT
// deste módulo é bearer puro, sem nenhuma referência ao convite/sessão
// que a revogação consulta, então um convidado revogado continuava
// escutando E transmitindo no canal por até 2h depois de revogado. 15min
// encolhe a janela de 2h pra 15min (WhiteboardGuestsService.revoke()
// também passou a apagar as WhiteboardGuestSession do convidado, ver
// lá) -- não elimina de vez porque o token continua bearer (fecharia de
// verdade com renovação periódica reautorizando a cada emissão, ou uma
// claim de revogação consultável pela policy; deliberadamente não
// implementado aqui: exigiria um caminho de servidor pro client-side
// renovar sozinho enquanto a aba fica aberta, e a degradação graciosa
// já existente pra falha de canal -- ver createBoardChannel -- faz o
// custo de NÃO ter isso ser só "sincronização ao vivo para depois de
// 15min", não perda de dado nenhuma, já que o save em si vai direto pro
// apps/api, nunca pelo canal).
const TOKEN_TTL = "15m";

export function boardTopic(moodboardId: string): string {
  return `moodboard:${moodboardId}`;
}

// null (não throw) quando não configurado: sem SUPABASE_JWT_SECRET o
// quadro continua funcionando, só sem sincronização ao vivo -- mesma
// degradação graciosa que createBoardChannel já fazia quando faltava a
// URL/anon key. Derrubar a página inteira por causa do relay seria pior
// que perder o tempo real (Postgres é o sistema de registro, não o canal).
export async function mintBoardRealtimeToken(moodboardId: string): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return null;
  }

  return new SignJWT({
    role: "authenticated", // role que as policies de realtime.messages esperam
    board_topic: boardTopic(moodboardId),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`board:${moodboardId}`)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}
