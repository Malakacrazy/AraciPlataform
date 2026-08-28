// Só pra deixar rótulo legível em texto gerado no servidor (documento da
// ZapSign, nome de pasta no Drive) -- apps/web tem o mesmo mapa
// (lib/pep-stages.ts) mas não é importável daqui (ADR 0002: apps/api não
// depende de apps/web nem vice-versa), então é uma cópia deliberada, não
// uma referência viva. Um único lugar dentro de apps/api, não um por
// arquivo que precisa do rótulo (era assim antes: proposal-signing.service.ts
// tinha sua própria cópia local).
export const STAGE_LABELS: Record<string, string> = {
  CAPTACAO_ALINHAMENTO: 'Captação/Alinhamento',
  BRIEFING: 'Briefing',
  CRIACAO_CONCEITO: 'Criação de Conceito',
  DETALHAMENTO_ACABAMENTOS: 'Detalhamento/Acabamentos',
  EXECUTIVO: 'Executivo',
};
