// Achado A12 da auditoria de 30 ago 2026 (auditoria-2026-08-30-detalhada.md):
// as propriedades `fromService` do render.yaml (property: host / hostport)
// entregam o host SEM protocolo ("araci-api:3001",
// "araci-web.onrender.com"), mas o código sempre tratou API_URL/WEB_URL
// como origem completa e concatenou direto (`${API_URL}/v1/...`) -- contra
// um host sem esquema, fetch/undici rejeita, e o healthcheck do Render
// nunca marca o deploy como saudável. Rede de segurança, não substituto de
// configurar certo: o operador ainda deve digitar a URL completa
// (idealmente https://) no dashboard -- isto só evita o 500/503 silencioso
// quando esquece.
export function withScheme(url: string): string {
  return /^https?:\/\//.test(url) ? url : `http://${url}`;
}
