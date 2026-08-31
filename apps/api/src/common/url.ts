// Achado A12 da auditoria de 30 ago 2026 (auditoria-2026-08-30-detalhada.md):
// as propriedades `fromService` do render.yaml (property: host / hostport)
// entregam o host SEM protocolo ("araci-web.onrender.com"), mas o código
// sempre tratou WEB_URL como origem completa e concatenou direto (ex.:
// magic link do portal do cliente/consultor externo) -- um cliente de
// e-mail trata um link sem esquema como caminho relativo, e ninguém
// consegue entrar. Rede de segurança, não substituto de configurar certo:
// o operador ainda deve digitar a URL completa (idealmente https://) no
// dashboard -- isto só evita o link quebrado silencioso quando esquece.
export function withScheme(url: string): string {
  return /^https?:\/\//.test(url) ? url : `http://${url}`;
}
