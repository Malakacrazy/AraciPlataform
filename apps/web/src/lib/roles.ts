// Lista canônica de papéis da equipe — reconciliada entre
// docs/fase-0/PEP_Interior.md (§2.1) e a planilha de precificação, que
// divergiam. Ver docs/fase-0/decisoes-pos-descoberta.md #2 para o
// raciocínio completo. `RoleRate.role` e `User.role` continuam string
// livre no schema (não um enum) — esta lista é a referência para
// seeds/UI, não uma validação obrigatória no banco.
export const CANONICAL_ROLES = [
  "Designer/Arquiteto Líder (RT)",
  "Coordenador de Projeto",
  "Designer Sênior",
  "Designer Pleno",
  "Designer Júnior",
  "Estagiário",
  "Especificador FF&E",
  "Lead 3D / Visualização",
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];
