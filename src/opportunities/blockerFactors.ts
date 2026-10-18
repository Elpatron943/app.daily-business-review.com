/**
 * Facteurs de blocage d'un deal — grille commune au produit.
 *
 * Un deal peut être bloqué par plusieurs facteurs à la fois (décision du
 * fondateur, 18 oct. 2026 : « c'est critique dans le produit »). Cette grille
 * sert à la fois :
 * - au simulateur à boutons : chaque partie cache un ou plusieurs facteurs
 *   que le commercial doit découvrir en posant les bonnes questions ;
 * - à l'analyse d'opportunité : les constats du diagnostic sont rattachés à un
 *   facteur, et la revue IA doit nommer le ou les facteurs en jeu.
 */

import type { DiagnosisFinding, FindingCode } from "./dealDiagnosis";

export type BlockerFactorId =
  | "decideur"
  | "valeur"
  | "statu-quo"
  | "budget"
  | "priorites"
  | "influence"
  | "consensus"
  | "achats"
  | "conformite"
  | "concurrence"
  | "capacite";

export type BlockerFactor = {
  id: BlockerFactorId;
  label: string;
  /** Ce que recouvre le facteur. */
  description: string;
  /** Ce qu'on entend quand il est à l'œuvre. */
  signals: string[];
  /** La question qui le vérifie. */
  question: string;
  /** Ce qu'on fait quand il est confirmé. */
  action: string;
};

export const BLOCKER_FACTORS: readonly BlockerFactor[] = [
  {
    id: "decideur",
    label: "Décideur",
    description: "Le vrai décideur n'est pas identifié, pas rencontré, ou pas favorable.",
    signals: ["« C'est moi qui décide » sans pouvoir le prouver", "Personne ne sait qui signe"],
    question: "Qui signe, et qui peut dire non au dernier moment ?",
    action: "Obtenir un accès au décideur par le sponsor, avec une raison qui le concerne.",
  },
  {
    id: "valeur",
    label: "Valeur non perçue",
    description: "Le client ne voit pas ce que la solution change pour lui, ou pas assez pour payer.",
    signals: ["« C'est intéressant, mais… »", "Aucun indicateur ni gain formulé par le client"],
    question: "Qu'est-ce que ça changerait concrètement pour vous, et comment le mesurerez-vous ?",
    action: "Faire formuler au client le gain attendu et son indicateur, avec ses mots.",
  },
  {
    id: "statu-quo",
    label: "Statu quo",
    description: "Rien n'oblige à changer maintenant : le client vit avec le problème.",
    signals: ["« Ce n'est pas urgent »", "« On fait comme ça depuis des années »"],
    question: "Que se passe-t-il si vous ne faites rien d'ici un an ?",
    action: "Chercher l'événement qui rend le changement nécessaire maintenant, ou décaler sans perdre le contact.",
  },
  {
    id: "budget",
    label: "Budget",
    description: "Pas d'enveloppe, budget gelé, ou budget détenu par une autre entité.",
    signals: ["« Ce n'est pas budgété »", "« C'est le groupe qui paie »"],
    question: "Sur quel budget ce projet passerait-il, et qui l'arbitre ?",
    action: "Obtenir la date du prochain arbitrage et qui défend le projet.",
  },
  {
    id: "priorites",
    label: "Projets en cours",
    description: "D'autres projets passent avant : ressources et attention sont prises ailleurs.",
    signals: ["« On a beaucoup de sujets en ce moment »", "Un gros projet interne mobilise tout le monde"],
    question: "Qu'est-ce qui est déjà en cours chez vous, et où se place ce projet par rapport à eux ?",
    action: "Situer le projet dans leur feuille de route et trouver ce qui le rend prioritaire.",
  },
  {
    id: "influence",
    label: "Circuit d'influence",
    description: "Champion faible ou absent, opposant non traité, influence cachée.",
    signals: ["Un seul contact porte tout", "Quelqu'un « n'est pas très favorable »"],
    question: "Qui d'autre que vous doit être convaincu, et qui pourrait s'y opposer ?",
    action: "Rencontrer l'opposant avec le sponsor et comprendre son critère.",
  },
  {
    id: "consensus",
    label: "Désaccord interne",
    description: "Les membres du comité ne veulent pas la même chose.",
    signals: ["« Les avis sont partagés »", "Métier et DSI ne disent pas la même chose"],
    question: "Sur quoi les avis divergent-ils, et qui tranche ?",
    action: "Organiser un point commun pour fixer les critères de décision.",
  },
  {
    id: "achats",
    label: "Achats et procédure",
    description: "Référencement, centrale, appel d'offres ou circuit d'achat qui bloque ou retarde.",
    signals: ["« Vous n'êtes pas référencés »", "« Il faudra passer par un appel d'offres »"],
    question: "Comment achetez-vous ce type d'offre, et faut-il être référencé ?",
    action: "Lancer tout de suite le référencement ou identifier la procédure et son calendrier.",
  },
  {
    id: "conformite",
    label: "Sécurité, conformité, juridique",
    description: "Une revue obligatoire (sécurité, données, réglementation, contrat) peut dire non.",
    signals: ["« Il faudra l'avis de la sécurité »", "Clauses ou exigences difficiles à prouver"],
    question: "Quelles exigences s'appliquent, et qui rend l'avis ?",
    action: "Lister ce qui est prouvable et remonter le reste : aucune garantie sans preuve.",
  },
  {
    id: "concurrence",
    label: "Concurrence ou fait-maison",
    description: "Un concurrent, un prestataire en place ou une solution interne est préféré.",
    signals: ["« On regarde aussi d'autres solutions »", "« Notre DSI pourrait le faire »"],
    question: "Qu'est-ce que vous regardez d'autre, y compris en interne, et sur quels critères ?",
    action: "Comparer sur leurs critères, sans dénigrer, et nommer ce qui compte pour eux.",
  },
  {
    id: "capacite",
    label: "Capacité de mise en œuvre",
    description: "Le client n'a pas le temps ni les équipes pour déployer.",
    signals: ["« On est très chargés »", "Personne n'est désigné pour la mise en place"],
    question: "Qui, chez vous, aura le temps de mettre en place la solution, et quand ?",
    action: "Proposer une mise en place légère ou dater le démarrage avec eux.",
  },
];

export function getBlockerFactor(id: string | null | undefined): BlockerFactor | null {
  if (!id) return null;
  return BLOCKER_FACTORS.find((f) => f.id === id) ?? null;
}

/**
 * Rattache les constats du diagnostic déterministe à un facteur de blocage.
 * Les constats de complétude de fiche (process, calendrier, actions) n'ont
 * pas de facteur : ils signalent un manque d'information, pas une cause.
 */
const FINDING_FACTOR: Partial<Record<FindingCode, BlockerFactorId>> = {
  C1: "decideur",
  C2: "decideur",
  C3: "influence",
  C4: "influence",
  C5: "influence",
  C6: "influence",
  U1: "statu-quo",
  U2: "valeur",
  U3: "valeur",
  M2: "concurrence",
};

export function factorForFinding(code: FindingCode): BlockerFactorId | null {
  return FINDING_FACTOR[code] ?? null;
}

export type FactorSummary = {
  factor: BlockerFactor;
  /** Nombre de constats rattachés. */
  findings: number;
  /** Au moins un constat bloquant. */
  blocking: boolean;
};

/** Facteurs de blocage signalés par le diagnostic, du plus grave au moins grave. */
export function summarizeFactors(findings: Pick<DiagnosisFinding, "code" | "severity">[]): FactorSummary[] {
  const map = new Map<BlockerFactorId, FactorSummary>();
  for (const f of findings) {
    const id = factorForFinding(f.code);
    if (!id) continue;
    const factor = getBlockerFactor(id)!;
    const cur = map.get(id) ?? { factor, findings: 0, blocking: false };
    cur.findings += 1;
    if (f.severity === "bloquant") cur.blocking = true;
    map.set(id, cur);
  }
  return [...map.values()].sort(
    (a, b) => Number(b.blocking) - Number(a.blocking) || b.findings - a.findings,
  );
}

/** Bloc injecté dans le prompt de la revue IA. */
export function buildBlockerFactorsAddendum(
  likely: BlockerFactorId[] = [],
): string {
  const lines = BLOCKER_FACTORS.map(
    (f) => `- ${f.id} · ${f.label} : ${f.description} Question qui le vérifie : « ${f.question} »`,
  );
  const likelyLine = likely.length
    ? `\nFacteurs fréquents pour ce secteur et ce type d'offre (hypothèse) : ${likely
        .map((id) => getBlockerFactor(id)?.label ?? id)
        .join(", ")}.`
    : "";
  return `# Facteurs de blocage
Un deal est souvent bloqué par plusieurs facteurs à la fois. Grille :
${lines.join("\n")}${likelyLine}

Pour chaque sujet traité, dis quel facteur est en jeu, ce qui le montre dans <diagnostic> ou dans les réponses du commercial, et pose la question qui le vérifie. Un facteur supposé se présente comme une hypothèse à vérifier, jamais comme un fait. Renseigne "facteurs" dans ta réponse JSON avec les identifiants des facteurs en jeu (ex. ["budget","influence"]).`;
}
