import { ProjectStageName } from '@araci/db';

// Os 5 estágios do PEP real do estúdio, na ordem fixa em que acontecem —
// ver docs/fase-0/PEP_Interior.md. Compartilhado entre o motor de
// precificação (crm/pricing.service.ts) e a criação de projeto
// (erp/projects.service.ts) para não divergir em dois lugares.
export const PEP_STAGE_ORDER: ProjectStageName[] = [
  ProjectStageName.CAPTACAO_ALINHAMENTO,
  ProjectStageName.BRIEFING,
  ProjectStageName.CRIACAO_CONCEITO,
  ProjectStageName.DETALHAMENTO_ACABAMENTOS,
  ProjectStageName.EXECUTIVO,
];
