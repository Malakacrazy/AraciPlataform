// Lista canônica de papéis da equipe — reconciliada entre
// docs/fase-0/PEP_Interior.md (§2.1) e a planilha de precificação, que
// divergiam. Confirmado diretamente pela Giulia: é "Arquiteto" em todos
// os níveis (não "Designer"), sem Coordenador BIM, sem Especificador
// FF&E como papel próprio. Ver docs/fase-0/decisoes-pos-descoberta.md #2.
// `RoleRate.role` e `User.role` continuam string livre no schema (não um
// enum) — esta lista é a referência para seeds/UI, não uma validação
// obrigatória no banco.
export const CANONICAL_ROLES = [
  'Arquiteto Líder (RT)',
  'Coordenador de Projeto',
  'Arquiteto Sênior',
  'Arquiteto Pleno',
  'Arquiteto Júnior',
  'Estagiário',
  'Lead 3D / Visualização',
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];
