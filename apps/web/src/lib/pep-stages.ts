import type { PepStage } from "./types";

// Ordem fixa do PEP (mesma de apps/api/src/pep.ts PEP_STAGE_ORDER) --
// duplicada aqui em vez de importada porque apps/web não depende de
// apps/api (ver ADR 0002).
export const PEP_STAGES: { key: PepStage; label: string }[] = [
  { key: "CAPTACAO_ALINHAMENTO", label: "Captação/Alinhamento" },
  { key: "BRIEFING", label: "Briefing" },
  { key: "CRIACAO_CONCEITO", label: "Criação de Conceito" },
  { key: "DETALHAMENTO_ACABAMENTOS", label: "Detalhamento/Acabamentos" },
  { key: "EXECUTIVO", label: "Executivo" },
];

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  PEP_STAGES.map((s) => [s.key, s.label]),
);
