/**
 * MEDDPICC — grille de qualification des ventes complexes.
 *
 * Décision du fondateur (18 oct. 2026, 15 h 22) : « pour les ventes complexes,
 * il faut MEDDPICC ». La grille s'active à partir du niveau de complexité 3
 * (deal complexe ou très complexe). Chaque question du simulateur est
 * rattachée à une lettre ; le débrief dit, lettre par lettre, ce qui est
 * validé, ce qui est à risque et ce qui reste à creuser, sur tout le cycle.
 */

import type { BlockerFactorId } from "./blockerFactors";

export type MeddpiccId =
  | "metrics"
  | "economic-buyer"
  | "decision-criteria"
  | "decision-process"
  | "paper-process"
  | "pain"
  | "champion"
  | "competition";

export type MeddpiccLetter = {
  id: MeddpiccId;
  letter: string;
  /** Nom d'origine, gardé tel quel : c'est ainsi que les équipes le connaissent. */
  name: string;
  label: string;
  /** Ce qu'il faut savoir pour cocher la lettre. */
  question: string;
};

export const MEDDPICC: readonly MeddpiccLetter[] = [
  { id: "metrics", letter: "M", name: "Metrics", label: "Indicateurs", question: "Quel gain chiffré, sur quel indicateur, avec sa valeur actuelle ?" },
  { id: "economic-buyer", letter: "E", name: "Economic buyer", label: "Décideur économique", question: "Qui détient le budget et peut dire oui seul ?" },
  { id: "decision-criteria", letter: "D", name: "Decision criteria", label: "Critères de décision", question: "Sur quels critères le client choisira-t-il ?" },
  { id: "decision-process", letter: "D", name: "Decision process", label: "Processus de décision", question: "Par quelles étapes et quelles personnes passe la décision, et quand ?" },
  { id: "paper-process", letter: "P", name: "Paper process", label: "Circuit d'achat et de signature", question: "Achats, juridique, sécurité, signature : quelles étapes, quels délais ?" },
  { id: "pain", letter: "I", name: "Identify pain", label: "Douleur et urgence", question: "Quel problème, et que se passe-t-il si rien ne change ?" },
  { id: "champion", letter: "C", name: "Champion", label: "Champion", question: "Qui défend le projet en ton absence, avec du pouvoir et un intérêt à le faire ?" },
  { id: "competition", letter: "C", name: "Competition", label: "Concurrence", question: "Contre quoi es-tu comparé : concurrents, outil maison, statu quo, autres projets ?" },
];

/** Niveau de complexité à partir duquel la grille s'applique. */
export const MEDDPICC_MIN_LEVEL = 3;

/** Lettre par défaut d'un facteur de blocage (relances, retours, questions métier). */
const LETTER_BY_FACTOR: Record<BlockerFactorId, MeddpiccId> = {
  decideur: "economic-buyer",
  valeur: "metrics",
  "statu-quo": "pain",
  budget: "economic-buyer",
  priorites: "competition",
  influence: "champion",
  champion: "champion",
  consensus: "decision-process",
  achats: "paper-process",
  conformite: "decision-criteria",
  concurrence: "competition",
  capacite: "decision-criteria",
};

export function meddpiccForFactor(factor: BlockerFactorId | null | undefined): MeddpiccId | null {
  return factor ? LETTER_BY_FACTOR[factor] : null;
}

export function getMeddpicc(id: MeddpiccId): MeddpiccLetter {
  return MEDDPICC.find((m) => m.id === id)!;
}

/**
 * valide : la bonne question a été posée, rien de caché ;
 * risque : un blocage a été repéré mais pas creusé ;
 * a-creuser : la question a été ratée ou pas atteinte ;
 * non-aborde : aucune question sur cette lettre jusqu'ici.
 */
export type MeddpiccStatus = "valide" | "risque" | "a-creuser" | "non-aborde";

export const MEDDPICC_STATUS_LABEL: Record<MeddpiccStatus, string> = {
  valide: "Validé",
  risque: "Risque repéré",
  "a-creuser": "À creuser",
  "non-aborde": "Pas abordé",
};

/**
 * Bloc injecté dans le prompt de la revue IA pour un deal complexe :
 * la revue lit le deal lettre par lettre.
 */
export function buildMeddpiccAddendum(levelLabel: string): string {
  const lines = MEDDPICC.map((m) => `- ${m.letter} · ${m.name} (${m.label}) : ${m.question}`);
  return `# MEDDPICC (vente complexe : ${levelLabel})
Ce deal est une vente complexe : qualifie-le avec MEDDPICC.
${lines.join("\n")}

Pour chaque lettre, dis si <diagnostic> ou les réponses du commercial la valident, la mettent en risque, ou ne disent rien. Commence par la lettre la plus faible et pose la question qui la valide. Le Champion et le Decision process se prouvent par des faits (un accès obtenu, une étape datée), pas par une impression du commercial.`;
}

export type MeddpiccOutcome = MeddpiccLetter & {
  status: MeddpiccStatus;
  /** Statut venu d'un rendez-vous précédent, sans nouvelle question cette fois. */
  fromEarlier: boolean;
};
