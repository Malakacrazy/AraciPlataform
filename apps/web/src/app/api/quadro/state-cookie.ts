// Compartilhado por authorize/route.ts e callback/route.ts, mesmo motivo
// de api/google/state-cookie.ts: route.ts só permite exports específicos
// (GET, POST, config...), qualquer outro export quebra a checagem de
// tipos gerada pelo App Router.
export const STATE_COOKIE = "quadro_oauth_state";

// Guarda pra onde voltar depois do login (o quadro que o convite
// apontava) -- sem isto, o convidado sempre cairia na lista de quadros
// em vez de já abrir o quadro que foi convidado a ver.
export const REDIRECT_BOARD_COOKIE = "quadro_oauth_redirect_board";
