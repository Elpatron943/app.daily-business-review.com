/**
 * Rendez-vous simulés à boutons — PATTERNS communs à tous les secteurs.
 *
 * Chaque pattern est un moment de rendez-vous qui existe dans tous les
 * secteurs. Les variables du secteur client (sectorModels.ts) remplissent les
 * trous ; le profil vendeur ajoute son objection.
 *
 * Facteurs de blocage (blockerFactors.ts) : chaque partie cache un ou
 * plusieurs facteurs réels (décideur, valeur, budget, projets en cours,
 * circuit d'influence…), tirés selon le secteur et l'offre. Un pattern sonde
 * un facteur : si ce facteur bloque le deal, la bonne question le révèle ;
 * un argument ou une question vague le laisse caché. Le débrief dit ce qui
 * bloquait réellement le deal.
 *
 * Moteur déterministe (graine) : pas d'appel IA, partie rejouable, coût nul.
 */

import {
  getBlockerFactor,
  type BlockerFactorId,
} from "./blockerFactors";
import {
  getClientSectorModel,
  getMeetingType,
  getSellerProfile,
  computeComplexity,
  type ClientSectorModel,
  type ClientSizeId,
  type ComplexityLevel,
  type MeetingTypeId,
  type SectorVariables,
  type SellerProfile,
} from "./sectorModels";

export type ChoiceKind = "question" | "argument" | "vague";

export type SimRisk = {
  factor: BlockerFactorId;
  level: "risque" | "risque_majeur";
  text: string;
  action: string;
};

export type SimChoice = {
  id: string;
  kind: ChoiceKind;
  label: string;
};

export type SimStep = {
  id: string;
  /** base : question du rendez-vous ; relance : débloquée par une bonne question ; retour : blocage raté qui revient. */
  origin: "base" | "relance" | "retour";
  theme: string;
  /** Facteur de blocage que cette étape permet de vérifier. */
  factor: BlockerFactorId | null;
  buyerLine: string;
  choices: SimChoice[];
  goodQuestion: string;
  replies: Record<ChoiceKind, string>;
  /** Vrai si le facteur sondé bloque ce deal. */
  risky: boolean;
  risk?: SimRisk;
};

export type Simulation = {
  model: ClientSectorModel;
  complexity: { level: ComplexityLevel; label: string };
  seller: SellerProfile | null;
  meeting: MeetingTypeId;
  multiEntity: boolean;
  interlocutor: string;
  opening: string;
  /** Facteurs qui bloquent réellement ce deal (cachés pendant la partie). */
  blockers: BlockerFactorId[];
  /** Blocages ratés au rendez-vous précédent, qui reviennent en début de rendez-vous. */
  carried: BlockerFactorId[];
  /** Facteurs déjà explorés aux rendez-vous précédents (l'acheteur s'en souvient). */
  known: BlockerFactorId[];
  /** Nombre de réponses faibles que l'acheteur tolère avant d'écourter. */
  patience: number;
  steps: SimStep[];
  issue: string;
};

export type PlayedStep = {
  step: SimStep;
  /** Réplique de l'acheteur telle qu'affichée (avec un éventuel rappel). */
  buyerLine: string;
  turn: SimTurn;
};

export type SimState = {
  /** Étapes restantes ; la première est l'étape en cours. */
  queue: SimStep[];
  played: PlayedStep[];
  patience: number;
  maxPatience: number;
  endedEarly: boolean;
  /** Questions perdues quand l'acheteur écourte. */
  lost: SimStep[];
  closingLine: string | null;
  known: BlockerFactorId[];
  revealed: BlockerFactorId[];
  dug: BlockerFactorId[];
  /** Récit de la partie, pour le débrief. */
  events: string[];
};

export type SimTurn = {
  stepId: string;
  kind: ChoiceKind;
  label: string;
  reply: string;
  riskFound?: SimRisk;
};

export type BlockerOutcome = {
  factor: BlockerFactorId;
  label: string;
  /** creuse : repéré puis relancé ; repere : repéré sans relance ; manque : pas trouvé. */
  status: "creuse" | "repere" | "manque";
  /** Blocage revenu d'un rendez-vous précédent. */
  carried: boolean;
  found: boolean;
  /** Ce qui l'a révélé, ou la question qui l'aurait révélé. */
  evidence: string;
  action: string;
};

export type SimDebrief = {
  asked: string[];
  missed: string[];
  risksFound: SimRisk[];
  risksMissed: SimRisk[];
  /** Ce qui bloquait réellement le deal, repéré ou non. */
  blockers: BlockerOutcome[];
  /** Questions perdues parce que l'acheteur a écourté. */
  lost: string[];
  endedEarly: boolean;
  /** Récit de l'enchaînement. */
  events: string[];
  /** Blocages non traités, qui reviendront au rendez-vous suivant. */
  carryOver: BlockerFactorId[];
  /** Facteurs explorés, dont l'acheteur se souviendra. */
  known: BlockerFactorId[];
  issueReached: boolean;
  nextStep: string;
};

type Ctx = {
  v: SectorVariables;
  group: SectorVariables | null;
  seller: SellerProfile | null;
  meeting: MeetingTypeId;
};

type PatternOutput = {
  buyerLine: string;
  question: string;
  good: string;
  /** Réponse quand le facteur sondé bloque le deal. */
  riskReply?: string;
  risk?: Omit<SimRisk, "factor">;
  argument: [label: string, reply: string];
  vague: [label: string, reply: string];
};

type PatternDef = {
  id: string;
  theme: string;
  meeting: MeetingTypeId;
  factor: BlockerFactorId | null;
  /** Niveau de complexité à partir duquel la question apparaît (1 à 4). */
  minLevel: ComplexityLevel;
  when?: (ctx: Ctx) => boolean;
  build: (ctx: Ctx) => PatternOutput;
};

const ISSUES: Record<MeetingTypeId, string> = {
  R1: "Problème relié à un indicateur, décideurs et veto identifiés, budget et mode d'achat connus, démonstration datée.",
  R2: "Cas d'usage validé par les utilisateurs, soutiens et opposants connus, critère de succès fixé.",
  R3: "Exigences listées avec leurs preuves, clauses connues, capacité de déploiement vérifiée, date de l'avis.",
  R4: "Procédure, budget, signataire, consensus interne et date de décision connus.",
};

function q(text: string): string {
  return `« ${text} »`;
}

/* ------------------------------------------------------------------ */
/* Patterns communs                                                    */
/* ------------------------------------------------------------------ */

const PATTERNS: PatternDef[] = [
  // ---------- R1 · Découverte ----------
  {
    id: "r1-probleme",
    theme: "Le problème et sa valeur",
    meeting: "R1",
    factor: "valeur",
    minLevel: 1,
    build: () => ({
      buyerLine: "On m'a dit que vous pouviez nous aider. Je vous écoute, j'ai vingt minutes.",
      question: q("Quel problème voulez-vous résoudre, et que vous coûte-t-il aujourd'hui ?"),
      good: "Mes équipes perdent du temps à consolider l'information, et la direction le voit dans ses indicateurs.",
      riskReply: "Je ne sais pas trop, c'est la direction qui m'a demandé de regarder.",
      risk: {
        level: "risque",
        text: "Valeur non perçue : le client ne formule ni problème ni gain.",
        action: "Faire formuler le gain attendu et son indicateur, avec ses mots.",
      },
      argument: [q("Je vous présente d'abord ce que fait notre offre."), "Très bien… mais je ne vois pas encore en quoi ça me concerne."],
      vague: [q("Tout va bien de votre côté ?"), "Oui, globalement ça va."],
    }),
  },
  {
    id: "r1-urgence",
    theme: "L'urgence",
    meeting: "R1",
    factor: "statu-quo",
    minLevel: 2,
    build: () => ({
      buyerLine: "C'est un sujet dont on parle depuis un moment.",
      question: q("Que se passe-t-il si vous ne faites rien d'ici un an ?"),
      good: "On perd des affaires : la direction veut que ce soit réglé avant la fin de l'année.",
      riskReply: "Rien de grave : on vit avec depuis des années.",
      risk: {
        level: "risque",
        text: "Statu quo : rien n'oblige le client à changer maintenant.",
        action: "Chercher l'événement qui rend le changement nécessaire maintenant.",
      },
      argument: [q("Plus vous attendez, plus ça vous coûtera."), "C'est ce que disent tous les fournisseurs."],
      vague: [q("C'est un sujet important pour vous ?"), "Oui, comme beaucoup d'autres."],
    }),
  },
  {
    id: "r1-entite",
    theme: "Qui paie dans le groupe",
    meeting: "R1",
    factor: "budget",
    minLevel: 1,
    when: (c) => Boolean(c.group),
    build: (c) => ({
      buyerLine: "Je précise : nous sommes une filiale d'un groupe.",
      question: q("Quelle entité paiera : votre filiale, une autre, ou le groupe ?"),
      good: "Notre filiale, sur son propre budget.",
      riskReply: c.group!.budgetRisk,
      risk: {
        level: "risque_majeur",
        text: "Budget au groupe : le sponsor ne le détient pas.",
        action: "Identifier qui détient le budget au groupe et obtenir une introduction.",
      },
      argument: [q("Notre offre conviendra à tout le groupe."), "Peut-être, mais ce n'est pas moi qui en décide."],
      vague: [q("Le groupe est au courant ?"), "Plus ou moins."],
    }),
  },
  {
    id: "r1-decideurs",
    theme: "Les décideurs et le veto",
    meeting: "R1",
    factor: "decideur",
    minLevel: 1,
    build: ({ v }) => ({
      buyerLine: "Si ça m'intéresse, je peux avancer assez vite.",
      question: q(`En dehors de vous, qui devra valider : ${v.vetoRoles} ?`),
      good: `Il faudra l'accord de ${v.vetoRoles}. Je peux vous les présenter.`,
      riskReply: "On verra ça plus tard, c'est moi qui porte le sujet.",
      risk: {
        level: "risque_majeur",
        text: "Décideur inconnu : les rôles qui peuvent dire non ne sont pas identifiés.",
        action: "Proposer de cartographier ensemble le circuit de décision et obtenir un accès au décideur.",
      },
      argument: [q("Je vous envoie une proposition dès demain."), "Envoyez, je regarderai."],
      vague: [q("C'est bien vous qui décidez ?"), "Oui, c'est moi qui décide."],
    }),
  },
  {
    id: "r1-budget",
    theme: "Le budget",
    meeting: "R1",
    factor: "budget",
    minLevel: 1,
    when: (c) => !c.group,
    build: ({ v }) => ({
      buyerLine: "Sur le principe, l'idée me plaît.",
      question: q(`Sur quel budget ce projet passerait-il (${v.budget}), et qui l'arbitre ?`),
      good: `C'est sur ${v.budget}, et il y a une enveloppe pour ce type de sujet.`,
      riskReply: v.budgetRisk,
      risk: {
        level: "risque",
        text: "Pas de budget identifié.",
        action: "Obtenir la date du prochain arbitrage budgétaire et qui le défend.",
      },
      argument: [q("Pour vous situer, voici notre prix."), "C'est un chiffre, mais je ne sais pas encore à quoi le comparer."],
      vague: [q("Vous avez du budget ?"), "On trouve toujours du budget quand c'est utile."],
    }),
  },
  {
    id: "r1-priorites",
    theme: "Les projets en cours",
    meeting: "R1",
    factor: "priorites",
    minLevel: 3,
    build: () => ({
      buyerLine: "Je vous préviens, nous avons beaucoup de sujets en ce moment.",
      question: q("Qu'est-ce qui est déjà en cours chez vous, et où se place ce projet par rapport à eux ?"),
      good: "Ce projet fait partie des trois priorités de l'année, juste après la migration en cours.",
      riskReply: "Honnêtement, on lance un gros projet interne : tout le reste passe après.",
      risk: {
        level: "risque_majeur",
        text: "Projets en cours : un autre chantier passe avant et mobilise les équipes.",
        action: "Situer le projet dans leur feuille de route et trouver ce qui le rend prioritaire.",
      },
      argument: [q("Notre solution peut se déployer en parallèle sans effort."), "Tout le monde dit ça, et ça finit toujours par nous prendre du temps."],
      vague: [q("Vous êtes débordés en ce moment ?"), "Comme tout le monde."],
    }),
  },
  {
    id: "r1-achat",
    theme: "Le mode d'achat",
    meeting: "R1",
    factor: "achats",
    minLevel: 2,
    build: ({ v }) => ({
      buyerLine: "Admettons que ça marche chez nous.",
      question: q(`Comment achetez-vous ce type d'offre (${v.procurement}) ?`),
      good: "Pour ce montant, c'est assez simple : les achats suivront.",
      riskReply: v.procurementRisk,
      risk: {
        level: "risque_majeur",
        text: `Achats et procédure : « ${v.procurementRisk} »`,
        action: `${capitalize(v.procurementAction)}.`,
      },
      argument: [q("Nous pouvons démarrer dès la semaine prochaine."), "La rapidité, c'est bien, mais ce ne sont pas les opérationnels qui achètent."],
      vague: [q("Les achats, ça ne pose pas de problème ?"), "Pas plus que d'habitude."],
    }),
  },
  {
    id: "r1-historique",
    theme: "Les tentatives passées",
    meeting: "R1",
    factor: "concurrence",
    minLevel: 4,
    build: () => ({
      buyerLine: "Ce n'est pas la première fois qu'on regarde ce sujet.",
      question: q("Qu'avez-vous déjà essayé pour régler ce problème, et pourquoi ça n'a pas suffi ?"),
      good: "On a tenté un tableur partagé : personne ne le tenait à jour.",
      riskReply: "On a déjà un outil pour ça : personne ne l'utilise, mais il est payé pour trois ans.",
      risk: {
        level: "risque",
        text: "Concurrence ou fait-maison : une solution déjà en place et payée.",
        action: "Comprendre pourquoi l'outil en place n'est pas utilisé et qui l'a choisi.",
      },
      argument: [q("Notre solution est bien meilleure que tout ce qui existe."), "Vous ne savez pas ce qu'on a essayé."],
      vague: [q("Vous avez déjà regardé le sujet ?"), "Un peu."],
    }),
  },
  {
    id: "r1-calendrier",
    theme: "Les échéances internes",
    meeting: "R1",
    factor: "priorites",
    minLevel: 4,
    build: () => ({
      buyerLine: "Chez nous, rien ne se décide vite.",
      question: q("Quelles échéances internes (budget, comités, réorganisation) vont rythmer la décision ?"),
      good: "Le comité de direction de fin de trimestre : c'est là que ça se décidera.",
      riskReply: "Une réorganisation vient d'être annoncée : tout est suspendu jusqu'à nouvel ordre.",
      risk: {
        level: "risque_majeur",
        text: "Projets en cours : une réorganisation gèle les décisions.",
        action: "Identifier qui portera le sujet après la réorganisation et garder le lien.",
      },
      argument: [q("On peut aller plus vite que vos comités."), "Non, on ne peut pas."],
      vague: [q("Ça prend du temps chez vous ?"), "Toujours."],
    }),
  },
  {
    id: "r1-suite",
    theme: "La prochaine étape",
    meeting: "R1",
    factor: null,
    minLevel: 1,
    build: () => ({
      buyerLine: "Bon, il faut que je file.",
      question: q("Qui faut-il réunir pour la démonstration, et à quelle date ?"),
      good: "Faisons-la dans deux semaines, avec deux personnes de l'équipe.",
      argument: [q("Je vous rappelle la semaine prochaine ?"), "Rappelez-moi, oui."],
      vague: [q("Merci beaucoup pour votre temps."), "Avec plaisir, au revoir."],
    }),
  },

  // ---------- R2 · Démonstration ----------
  {
    id: "r2-cas",
    theme: "Le cas concret",
    meeting: "R2",
    factor: "valeur",
    minLevel: 1,
    build: ({ v }) => ({
      buyerLine: `Allons-y. ${v.demo}`,
      question: q("Sur quel cas concret de votre quotidien voulez-vous juger ce que nous proposons ?"),
      good: "Prenons le dossier qui nous a posé problème le mois dernier.",
      riskReply: "Je ne sais pas… montrez-nous ce que vous montrez d'habitude.",
      risk: {
        level: "risque",
        text: "Valeur non perçue : aucun cas réel à résoudre, la démonstration reste théorique.",
        action: "Obtenir un cas réel avant la démonstration, ou la reporter.",
      },
      argument: [q("Je vous montre tout, du début à la fin."), "C'est très complet… mais ce n'est pas notre façon de travailler."],
      vague: [q("Vous avez des questions ?"), "Pas pour l'instant."],
    }),
  },
  {
    id: "r2-influence",
    theme: "Soutiens et opposants",
    meeting: "R2",
    factor: "influence",
    minLevel: 2,
    build: () => ({
      buyerLine: "Personnellement, je trouve ça intéressant.",
      question: q("Qui d'autre que vous doit être convaincu, et qui pourrait s'y opposer ?"),
      good: "Le directeur financier, mais il suivra si l'équipe est convaincue.",
      riskReply: "Le directeur financier est contre tout nouvel outil cette année.",
      risk: {
        level: "risque_majeur",
        text: "Circuit d'influence : un opposant influent n'est pas traité.",
        action: "Rencontrer l'opposant avec le sponsor et comprendre son critère.",
      },
      argument: [q("Avec votre soutien, ça passera sans problème."), "Je ne suis pas seul à décider."],
      vague: [q("Tout le monde est partant ?"), "Je pense."],
    }),
  },
  {
    id: "r2-utilisateurs",
    theme: "Les utilisateurs",
    meeting: "R2",
    factor: "consensus",
    minLevel: 1,
    build: () => ({
      buyerLine: "Mon équipe est là : c'est elle qui l'utiliserait au quotidien.",
      question: q("Qui l'utilisera chaque semaine, et que fera-t-il autrement ?"),
      good: "Les deux personnes ici : elles arrêteraient de tout consolider à la main.",
      riskReply: "Eux ? Ils s'adapteront, c'est moi qui décide.",
      risk: {
        level: "risque",
        text: "Désaccord interne : les utilisateurs ne sont pas embarqués.",
        action: "Demander un atelier avec deux utilisateurs.",
      },
      argument: [q("Regardez nos fonctions avancées."), "Impressionnant, mais on n'en utiliserait pas la moitié."],
      vague: [q("Ça vous plaît ?"), "Oui, c'est joli."],
    }),
  },
  {
    id: "r2-groupe",
    theme: "Le groupe dans la boucle",
    meeting: "R2",
    factor: "consensus",
    minLevel: 1,
    when: (c) => Boolean(c.group),
    build: (c) => ({
      buyerLine: c.group!.demo,
      question: q("Qui, côté groupe, doit voir la démonstration, et sur quels critères ?"),
      good: "Le responsable métier du groupe : il regardera surtout l'extension aux autres filiales.",
      riskReply: "Le groupe ? On lui présentera le projet une fois décidé.",
      risk: {
        level: "risque_majeur",
        text: "Désaccord interne : le groupe n'est pas dans la boucle et peut bloquer ensuite.",
        action: "Inviter un représentant du groupe avant la revue.",
      },
      argument: [q("Le groupe suivra, c'est certain."), "Vous ne connaissez pas notre groupe."],
      vague: [q("Le groupe est d'accord ?"), "En principe."],
    }),
  },
  {
    id: "r2-concurrence",
    theme: "Les alternatives",
    meeting: "R2",
    factor: "concurrence",
    minLevel: 2,
    build: () => ({
      buyerLine: "On regarde aussi d'autres options, vous vous en doutez.",
      question: q("Qu'est-ce que vous regardez d'autre, y compris faire en interne, et sur quels critères ?"),
      good: "Deux autres offres, et nous comparerons surtout la facilité d'usage.",
      riskReply: "Notre DSI propose de le développer en interne.",
      risk: {
        level: "risque",
        text: "Concurrence ou fait-maison : une solution interne est sur la table.",
        action: "Comparer avec eux le coût et le délai du fait-maison, sans dénigrer.",
      },
      argument: [q("Nous sommes les meilleurs du marché."), "On verra."],
      vague: [q("Vous avez vu d'autres fournisseurs ?"), "Quelques-uns."],
    }),
  },
  {
    id: "r2-valeur-chiffree",
    theme: "La valeur chiffrée",
    meeting: "R2",
    factor: "valeur",
    minLevel: 3,
    build: () => ({
      buyerLine: "Pour défendre le projet, il me faudra des arguments.",
      question: q("Combien vaut ce gain pour vous, et qui devra valider ce chiffre ?"),
      good: "Le contrôle de gestion validera, sur la base du temps gagné par l'équipe.",
      riskReply: "Je ne saurais pas le chiffrer, et la direction voudra un chiffre.",
      risk: {
        level: "risque",
        text: "Valeur non perçue : le gain n'est pas chiffré, le projet sera difficile à défendre.",
        action: "Construire le chiffrage avec le client et le faire valider par celui qui arbitre.",
      },
      argument: [q("Le retour sur investissement est évident."), "Pas pour notre directeur financier."],
      vague: [q("Ça vaut le coup, non ?"), "Sans doute."],
    }),
  },
  {
    id: "r2-integration",
    theme: "L'intégration",
    meeting: "R2",
    factor: "capacite",
    minLevel: 4,
    build: () => ({
      buyerLine: "Il faudra que ça fonctionne avec ce qu'on a déjà.",
      question: q("Avec quels outils et quelles équipes la solution devra-t-elle fonctionner ?"),
      good: "Notre outil client et l'équipe informatique, qui a du temps le mois prochain.",
      riskReply: "Avec une dizaine d'outils, et l'équipe informatique n'a pas de disponibilité cette année.",
      risk: {
        level: "risque",
        text: "Capacité de mise en œuvre : intégration lourde sans équipe disponible.",
        action: "Réduire le périmètre de départ et dater l'intégration avec la DSI.",
      },
      argument: [q("Nous nous intégrons à tout."), "C'est ce qu'on nous dit à chaque fois."],
      vague: [q("L'intégration, ça devrait aller ?"), "On verra."],
    }),
  },
  {
    id: "r2-critere",
    theme: "Le critère de succès",
    meeting: "R2",
    factor: "valeur",
    minLevel: 1,
    build: () => ({
      buyerLine: "On commence à voir l'intérêt.",
      question: q("À quoi verrez-vous, dans trois mois, que ça a marché ?"),
      good: "Si l'équipe gagne une demi-journée par semaine sur la consolidation, c'est gagné.",
      riskReply: "Je ne sais pas, on verra à l'usage.",
      risk: {
        level: "risque",
        text: "Valeur non perçue : aucun critère de succès, la valeur ne pourra pas être prouvée.",
        action: "Fixer avec eux un critère mesurable.",
      },
      argument: [q("Nos clients gagnent beaucoup de temps."), "Chez les autres, peut-être. Et chez nous ?"],
      vague: [q("Vous êtes convaincus ?"), "À moitié."],
    }),
  },

  // ---------- R3 · Revue sécurité et conformité ----------
  {
    id: "r3-exigences",
    theme: "Les exigences",
    meeting: "R3",
    factor: "conformite",
    minLevel: 1,
    build: ({ v }) => ({
      buyerLine: `Je suis là pour ${v.review}.`,
      question: q("Quelles sont vos exigences, et sous quelle forme voulez-vous les preuves ?"),
      good: `Il nous faut ${v.reviewProof}.`,
      riskReply: "Nos exigences vont au-delà de ce que vous avez montré jusqu'ici.",
      risk: {
        level: "risque_majeur",
        text: "Sécurité et conformité : une exigence que le vendeur ne peut peut-être pas prouver.",
        action: "Lister ce qui est prouvable et remonter le reste : aucune garantie sans preuve.",
      },
      argument: [q("Nous sommes conformes à tout."), "Tout le monde dit ça. Je veux des documents."],
      vague: [q("C'est une formalité, non ?"), "Ce n'est jamais une formalité."],
    }),
  },
  {
    id: "r3-donnees",
    theme: "Les données et leurs règles",
    meeting: "R3",
    factor: null,
    minLevel: 2,
    build: ({ v }) => ({
      buyerLine: "Parlons des données.",
      question: q("Quelles données exactement, et quelles règles internes s'y appliquent ?"),
      good: `Ce sont ${v.data}, avec nos règles d'hébergement et de conservation.`,
      argument: [q("Laissez-moi vous détailler notre architecture."), "Je lirai la documentation. Ma question portait sur nos règles."],
      vague: [q("Les données, ça pose problème ?"), "Ça dépend."],
    }),
  },
  {
    id: "r3-capacite",
    theme: "La capacité à déployer",
    meeting: "R3",
    factor: "capacite",
    minLevel: 2,
    build: () => ({
      buyerLine: "Côté technique, je vous préviens, on est très chargés.",
      question: q("Qui, chez vous, aura le temps de mettre en place la solution, et quand ?"),
      good: "Une personne de mon équipe, à mi-temps, à partir du mois prochain.",
      riskReply: "Personne avant six mois : l'équipe est sur d'autres chantiers.",
      risk: {
        level: "risque",
        text: "Capacité de mise en œuvre : personne n'est disponible pour déployer.",
        action: "Proposer une mise en place légère ou dater le démarrage avec eux.",
      },
      argument: [q("La mise en place est très simple."), "C'est toujours plus long que prévu."],
      vague: [q("Vous avez du monde pour le projet ?"), "On s'organisera."],
    }),
  },
  {
    id: "r3-contrat",
    theme: "Les clauses",
    meeting: "R3",
    factor: "conformite",
    minLevel: 2,
    build: () => ({
      buyerLine: "Il y aura aussi le volet contractuel.",
      question: q("Quel modèle de contrat et quelles clauses de sécurité imposez-vous ?"),
      good: "Nos clauses types : je vous les envoie ce soir.",
      riskReply: "Il faudra accepter nos clauses d'audit sur site.",
      risk: {
        level: "risque",
        text: "Sécurité et conformité : clause lourde à négocier.",
        action: "Remonter à la direction : contrat et clauses sont son arbitrage.",
      },
      argument: [q("Partons sur notre contrat standard."), "Nous travaillons avec nos modèles."],
      vague: [q("Votre juridique est d'accord ?"), "Il n'a pas encore vu le dossier."],
    }),
  },
  {
    id: "r3-reversibilite",
    theme: "La sortie",
    meeting: "R3",
    factor: "conformite",
    minLevel: 3,
    build: () => ({
      buyerLine: "Nous devons aussi prévoir la fin du contrat.",
      question: q("Quelles conditions de sortie et de récupération des données exigez-vous ?"),
      good: "Un export complet à tout moment et un accompagnement à la sortie.",
      riskReply: "Il nous faut un plan de sortie détaillé et testé avant de signer.",
      risk: {
        level: "risque",
        text: "Sécurité et conformité : plan de sortie exigé avant signature.",
        action: "Préparer le plan de sortie et le faire valider tôt.",
      },
      argument: [q("Vous ne voudrez jamais partir."), "Ce n'est pas la question."],
      vague: [q("La sortie, c'est important pour vous ?"), "Oui."],
    }),
  },
  {
    id: "r3-comite",
    theme: "Le comité de validation",
    meeting: "R3",
    factor: "decideur",
    minLevel: 4,
    build: () => ({
      buyerLine: "Mon avis ne suffira pas.",
      question: q("Le dossier doit-il passer devant un comité, qui y siège et quand se réunit-il ?"),
      good: "Le comité des risques, dans un mois : je présenterai le dossier.",
      riskReply: "Le comité ne se réunit qu'une fois par trimestre, et l'ordre du jour est déjà plein.",
      risk: {
        level: "risque_majeur",
        text: "Décideur : un comité décide, son calendrier repousse la décision.",
        action: "Obtenir une inscription à l'ordre du jour et préparer le dossier avec le sponsor.",
      },
      argument: [q("Vous pouvez valider sans le comité ?"), "Non."],
      vague: [q("Il y a d'autres validations ?"), "Peut-être."],
    }),
  },
  {
    id: "r3-avis",
    theme: "L'avis et son délai",
    meeting: "R3",
    factor: null,
    minLevel: 1,
    build: () => ({
      buyerLine: "Je ne pourrai pas conclure aujourd'hui.",
      question: q("Qui rend l'avis final, et dans quel délai ?"),
      good: "Moi, d'ici trois semaines si j'ai toutes les pièces.",
      argument: [q("Vous pouvez valider aujourd'hui ?"), "Ce n'est pas possible sans les pièces."],
      vague: [q("J'attends votre retour."), "Vous l'aurez."],
    }),
  },

  // ---------- R4 · Achats et contrat ----------
  {
    id: "r4-procedure",
    theme: "La procédure",
    meeting: "R4",
    factor: "achats",
    minLevel: 1,
    build: ({ v }) => ({
      buyerLine: "Je reprends le dossier côté achats.",
      question: q(`Quelle procédure s'applique ici (${v.procurement}) ?`),
      good: "Pour ce montant, une consultation simple suffit.",
      riskReply: v.procurementRisk,
      risk: {
        level: "risque_majeur",
        text: `Achats et procédure : « ${v.procurementRisk} »`,
        action: `${capitalize(v.procurementAction)}.`,
      },
      argument: [q("Avec une remise, on peut aller plus vite ?"), "Une remise ne change pas la procédure."],
      vague: [q("C'est compliqué, chez vous ?"), "Ça dépend du montant."],
    }),
  },
  {
    id: "r4-groupe",
    theme: "Le référencement groupe",
    meeting: "R4",
    factor: "achats",
    minLevel: 1,
    when: (c) => Boolean(c.group),
    build: (c) => ({
      buyerLine: "Je dois aussi en parler au groupe.",
      question: q("Faut-il un référencement groupe, et qui signe : la filiale ou le groupe ?"),
      good: "Le groupe vous référence, puis la filiale signe.",
      riskReply: c.group!.procurementRisk,
      risk: {
        level: "risque_majeur",
        text: `Achats et procédure : « ${c.group!.procurementRisk} »`,
        action: `${capitalize(c.group!.procurementAction)}.`,
      },
      argument: [q("On peut signer sans passer par le groupe ?"), "Ce n'est pas comme ça que ça marche ici."],
      vague: [q("Le groupe suit ?"), "Je ne sais pas."],
    }),
  },
  {
    id: "r4-budget",
    theme: "L'arbitrage budgétaire",
    meeting: "R4",
    factor: "budget",
    minLevel: 2,
    build: ({ v }) => ({
      buyerLine: "Il faut maintenant que je défende le budget.",
      question: q("Qui arbitre ce budget, et face à quels autres projets ?"),
      good: `C'est sur ${v.budget} : l'arbitrage est favorable si le dossier est complet.`,
      riskReply: "Le budget est gelé jusqu'au prochain exercice.",
      risk: {
        level: "risque_majeur",
        text: "Budget gelé : la décision glisse au prochain exercice.",
        action: "Obtenir la date du dégel et préparer le dossier pour cet arbitrage.",
      },
      argument: [q("Notre prix est très compétitif."), "Le prix n'est pas le sujet, c'est l'enveloppe."],
      vague: [q("Le budget, ça va ?"), "On verra."],
    }),
  },
  {
    id: "r4-consensus",
    theme: "Le consensus interne",
    meeting: "R4",
    factor: "consensus",
    minLevel: 3,
    build: () => ({
      buyerLine: "En interne, on en discute encore.",
      question: q("Sur quoi les avis divergent-ils, et qui tranche ?"),
      good: "Tout le monde est aligné, il reste juste la signature.",
      riskReply: "La DSI et le métier ne veulent pas la même chose.",
      risk: {
        level: "risque_majeur",
        text: "Désaccord interne : métier et DSI ne sont pas d'accord.",
        action: "Organiser un point commun pour fixer les critères de décision.",
      },
      argument: [q("Notre offre répond à tout le monde."), "Ce n'est pas aussi simple."],
      vague: [q("Tout le monde est d'accord ?"), "Globalement."],
    }),
  },
  {
    id: "r4-signataire",
    theme: "Le signataire",
    meeting: "R4",
    factor: "decideur",
    minLevel: 1,
    build: ({ v }) => ({
      buyerLine: "Votre offre est en cours d'analyse.",
      question: q(`Qui signe, et faut-il passer par ${v.signature} ?`),
      good: `Oui, par ${v.signature} ; la prochaine occasion est à la fin du mois.`,
      riskReply: "Je ne sais pas encore qui signera.",
      risk: {
        level: "risque",
        text: "Décideur : signataire inconnu, la date de signature n'est pas défendable.",
        action: "Obtenir le circuit de signature par écrit.",
      },
      argument: [q("On peut signer avant la fin du trimestre ?"), "Votre fin de trimestre n'est pas notre calendrier."],
      vague: [q("Ça va signer ?"), "Probablement."],
    }),
  },
  {
    id: "r4-conditions",
    theme: "Les conditions",
    meeting: "R4",
    factor: null,
    minLevel: 2,
    build: () => ({
      buyerLine: "Il reste à cadrer les conditions.",
      question: q("Quelles conditions sont non négociables pour vous ?"),
      good: "Nos délais de paiement habituels, la réversibilité et nos clauses types.",
      argument: [q("Nos conditions générales sont standard."), "Nous verrons ça avec le juridique."],
      vague: [q("Il y a des points bloquants ?"), "Pas à ma connaissance."],
    }),
  },
  {
    id: "r4-juridique",
    theme: "La relecture juridique",
    meeting: "R4",
    factor: "conformite",
    minLevel: 4,
    build: () => ({
      buyerLine: "Le contrat partira chez nos juristes.",
      question: q("Qui relit le contrat côté juridique, et combien de temps faut-il prévoir ?"),
      good: "Notre juriste, sous deux semaines.",
      riskReply: "Nos juristes ont plusieurs semaines de retard et voudront revoir toutes les clauses.",
      risk: {
        level: "risque",
        text: "Sécurité, conformité, juridique : relecture longue qui décale la signature.",
        action: "Envoyer le contrat tôt et proposer une réunion avec les juristes.",
      },
      argument: [q("Le contrat est standard, ça ira vite."), "Nos juristes en décideront."],
      vague: [q("Le juridique, ça va aller ?"), "On verra."],
    }),
  },
  {
    id: "r4-delai",
    theme: "La date de décision",
    meeting: "R4",
    factor: null,
    minLevel: 1,
    build: ({ v }) => ({
      buyerLine: "Vous voulez sans doute une date.",
      question: q(`Compte tenu de ${v.delay}, quelle date de décision est réaliste ?`),
      good: "Réaliste ? D'ici deux mois, si tout est complet.",
      argument: [q("Visons une signature dans quinze jours."), "C'est votre souhait, pas notre calendrier."],
      vague: [q("C'est pour bientôt ?"), "On verra."],
    }),
  },
];

/** Objection du profil vendeur, insérée avant la dernière étape. */
function sellerObjectionPattern(seller: SellerProfile, objection: string, meeting: MeetingTypeId): PatternDef {
  const factor = getBlockerFactor(seller.objectionFactor)!;
  return {
    id: "objection-vendeur",
    theme: `L'objection (${seller.label})`,
    meeting,
    factor: seller.objectionFactor,
    minLevel: 1,
    build: () => ({
      buyerLine: objection,
      question: q("Qu'est-ce qui vous amène à poser cette question ?"),
      good: `On a déjà été déçus là-dessus. Ce qui nous rassurerait : ${lowerFirst(seller.proofs[0] ?? "des preuves concrètes")}.`,
      riskReply: `Pour être franc, c'est le point qui peut tout faire échouer chez nous.`,
      risk: {
        level: "risque_majeur",
        text: `${factor.label} : l'objection cache un vrai blocage.`,
        action: factor.action,
      },
      argument: [q("Je vous réponds point par point."), "C'est ce que disent tous les fournisseurs."],
      vague: [q("Je peux faire un geste sur le prix."), "Le sujet n'est pas le prix."],
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Moteur                                                              */
/* ------------------------------------------------------------------ */

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out.at(i)!;
    out[i] = out.at(j)!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Tire les facteurs qui bloquent ce deal parmi ceux que le rendez-vous peut
 * révéler. Poids (mécanique de jeu, pas une statistique) : facteur fréquent
 * du secteur 3, du profil vendeur ou de la couche groupe 2, autre 1.
 */
function drawBlockers(
  available: BlockerFactorId[],
  likely: { sector: BlockerFactorId[]; other: BlockerFactorId[] },
  count: number,
  rand: () => number,
): BlockerFactorId[] {
  const pool = [...new Set(available)];
  const picked: BlockerFactorId[] = [];
  while (picked.length < count && pool.length > 0) {
    const weights = pool.map((f) =>
      likely.sector.includes(f) ? 3 : likely.other.includes(f) ? 2 : 1,
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= weights.at(idx)!;
      if (r < 0) break;
    }
    picked.push(pool.at(idx)!);
    pool.splice(idx, 1);
  }
  return picked;
}

export type SimulationSetup = {
  clientSectorId: string | null | undefined;
  sellerProfileId: string | null | undefined;
  multiEntity?: boolean;
  /** Taille du client : augmente la complexité. */
  clientSize?: ClientSizeId | null;
  meeting: MeetingTypeId;
  seed: number;
  /** Blocages ratés au rendez-vous précédent. */
  carryOver?: BlockerFactorId[];
  /** Facteurs explorés aux rendez-vous précédents. */
  known?: BlockerFactorId[];
};

export function buildSimulation(setup: SimulationSetup): Simulation {
  const model =
    getClientSectorModel(setup.clientSectorId) ?? getClientSectorModel("generique")!;
  const groupModel = setup.multiEntity ? getClientSectorModel("grands-groupes") : null;
  const seller = getSellerProfile(setup.sellerProfileId);
  const meeting = getMeetingType(setup.meeting)?.id ?? "R1";
  const ctx: Ctx = {
    v: model.vars,
    group: groupModel?.vars ?? null,
    seller,
    meeting,
  };
  const rand = seededRandom(setup.seed);
  const complexity = computeComplexity({
    clientSectorId: model.id,
    clientSize: setup.clientSize ?? null,
    multiEntity: Boolean(groupModel),
  });

  // Plus le deal est complexe, plus le rendez-vous compte de questions.
  const defs = PATTERNS.filter(
    (p) =>
      p.meeting === meeting &&
      p.minLevel <= complexity.level &&
      (!p.when || p.when(ctx)),
  );
  if (seller) {
    const objection =
      seller.objections.at(Math.floor(rand() * seller.objections.length)) ??
      seller.objections[0]!;
    defs.splice(
      Math.max(defs.length - 1, 0),
      0,
      sellerObjectionPattern(seller, objection, meeting),
    );
  }

  const carried = [...new Set(setup.carryOver ?? [])].filter((f) => getBlockerFactor(f));
  const built = defs.map((def) => ({ def, out: def.build(ctx) }));
  const available = built
    .filter(({ def, out }) => def.factor && out.riskReply && out.risk)
    .map(({ def }) => def.factor!)
    .filter((f) => !carried.includes(f));
  // Plus le deal est complexe, plus il y a de blocages.
  const target = complexity.level === 1 ? 1 : complexity.level === 4 ? 3 : 2;
  // Les blocages qui reviennent comptent dans le total, avec au moins un nouveau.
  const count = Math.max(1, target - carried.length);
  const blockers = drawBlockers(
    available,
    {
      sector: model.likelyBlockers,
      other: [...(seller?.likelyBlockers ?? []), ...(groupModel?.likelyBlockers ?? [])],
    },
    count,
    rand,
  );

  const baseSteps: SimStep[] = built.map(({ def, out }) => {
    const risky = Boolean(def.factor && out.riskReply && out.risk && blockers.includes(def.factor));
    const choices = shuffle(
      [
        { id: `${def.id}:question`, kind: "question" as const, label: out.question },
        { id: `${def.id}:argument`, kind: "argument" as const, label: out.argument[0] },
        { id: `${def.id}:vague`, kind: "vague" as const, label: out.vague[0] },
      ],
      rand,
    );
    return {
      id: def.id,
      origin: "base" as const,
      theme: def.theme,
      factor: def.factor,
      buyerLine: out.buyerLine,
      choices,
      goodQuestion: out.question,
      replies: {
        question: risky ? out.riskReply! : out.good,
        argument: out.argument[1],
        vague: out.vague[1],
      },
      risky,
      risk: out.risk && def.factor ? { ...out.risk, factor: def.factor } : undefined,
    };
  });

  const steps: SimStep[] = [
    ...carried.map((f, i) => carriedStep(f, i, rand)),
    ...baseSteps,
  ];

  const interlocutor = (groupModel && meeting !== "R3" ? groupModel : model).interlocutors[meeting];
  const meetingLabel = getMeetingType(meeting)?.label ?? meeting;
  return {
    model,
    complexity: { level: complexity.level, label: complexity.label },
    seller,
    meeting,
    multiEntity: Boolean(groupModel),
    interlocutor,
    opening: `Rendez-vous ${meeting} · ${meetingLabel}. Vous êtes face à : ${interlocutor} (${model.label}${groupModel ? ", filiale d'un groupe" : ""}).`,
    blockers: [...carried, ...blockers],
    carried,
    known: [...new Set(setup.known ?? [])],
    patience: PATIENCE[complexity.level],
    steps,
    issue: ISSUES[meeting],
  };
}

/* ------------------------------------------------------------------ */
/* Enchaînement : patience, relances, retours, rappels                 */
/* ------------------------------------------------------------------ */

/** Réponses faibles tolérées avant que l'acheteur écourte (mécanique de jeu). */
const PATIENCE: Record<ComplexityLevel, number> = { 1: 3, 2: 3, 3: 2, 4: 2 };

type FollowUp = { buyerLine: string; question: string; good: string };

/** Relance débloquée quand une bonne question révèle un blocage. */
const FOLLOW_UPS: Record<BlockerFactorId, FollowUp> = {
  decideur: {
    buyerLine: "C'est un vrai sujet, je vous l'accorde.",
    question: "Qui précisément peut dire non, et comment le rencontrer avec vous ?",
    good: "Le directeur général : je peux vous obtenir quinze minutes avec lui si le dossier est solide.",
  },
  valeur: {
    buyerLine: "Je ne suis pas sûr de pouvoir le défendre.",
    question: "Si vous deviez convaincre votre direction en une phrase, que diriez-vous ?",
    good: "Qu'on arrête de perdre des affaires faute de visibilité : c'est ce qui la fait réagir.",
  },
  "statu-quo": {
    buyerLine: "On s'en accommode, c'est vrai.",
    question: "Quel événement pourrait rendre ce sujet urgent cette année ?",
    good: "Le prochain audit interne : il pointera forcément ce problème.",
  },
  budget: {
    buyerLine: "Le budget, c'est le vrai frein.",
    question: "Qui arbitre ce budget, et à quelle date ?",
    good: "Le directeur financier, au comité budgétaire du mois prochain.",
  },
  priorites: {
    buyerLine: "On est vraiment pris ailleurs.",
    question: "Qu'est-ce qui ferait passer ce projet avant les autres ?",
    good: "S'il aide le gros projet en cours au lieu de lui prendre du monde, il passera.",
  },
  influence: {
    buyerLine: "Cette personne pèse beaucoup.",
    question: "Qu'est-ce qui la ferait changer d'avis, et pouvons-nous la rencontrer ensemble ?",
    good: "Elle veut des garanties sur le coût total. Je peux organiser un point.",
  },
  consensus: {
    buyerLine: "Ce désaccord n'est pas nouveau.",
    question: "Sur quel critère précis faudrait-il se mettre d'accord, et qui peut trancher ?",
    good: "Le périmètre de départ ; la directrice des opérations peut trancher.",
  },
  achats: {
    buyerLine: "C'est la règle chez nous.",
    question: "Quelle est la première étape pour être en règle, et combien de temps prend-elle ?",
    good: "Le dossier fournisseur : comptez trois semaines s'il est complet.",
  },
  conformite: {
    buyerLine: "Je ne transigerai pas là-dessus.",
    question: "Quelles preuves exactement, et qui les vérifiera ?",
    good: "Vos certifications et notre questionnaire : c'est mon équipe qui vérifiera.",
  },
  concurrence: {
    buyerLine: "Ce n'est pas exclu.",
    question: "Qu'est-ce qui ferait pencher la balance d'un côté ou de l'autre ?",
    good: "Le temps de mise en route : celui qui démarre le plus vite l'emportera.",
  },
  capacite: {
    buyerLine: "C'est la réalité de nos équipes.",
    question: "Que faudrait-il pour que la mise en place ne repose pas sur vos équipes ?",
    good: "Que vous preniez en charge le paramétrage : là, on pourrait démarrer.",
  },
};

/** Ce que dit l'acheteur quand un blocage raté revient au rendez-vous suivant. */
const ESCALATIONS: Record<BlockerFactorId, string> = {
  decideur: "Avant de commencer : la direction a demandé à revoir le dossier, elle ne savait pas qu'il existait.",
  valeur: "Je dois être franc : en interne, on se demande encore à quoi ça va servir.",
  "statu-quo": "On a fait le point : beaucoup pensent qu'on peut continuer comme avant.",
  budget: "Mauvaise nouvelle : le budget vient d'être gelé, personne ne l'avait vu venir.",
  priorites: "Le gros projet interne a pris du retard : il mobilise tout le monde, le vôtre passe après.",
  influence: "Le directeur financier a entendu parler du projet, et il n'y est pas favorable.",
  consensus: "En interne, ça se tend : la DSI et le métier ne sont pas d'accord.",
  achats: "Les achats viennent de rappeler qu'on ne peut rien commander sans référencement.",
  conformite: "La sécurité s'est saisie du dossier et bloque tant qu'elle n'a pas ses preuves.",
  concurrence: "Un concurrent nous a fait une proposition entre-temps.",
  capacite: "L'équipe qui devait déployer a été réaffectée.",
};

/** Ce que dit l'acheteur quand on revient sur un sujet déjà exploré. */
const RECALLS: Partial<Record<BlockerFactorId, string>> = {
  decideur: "Comme je vous l'ai dit, plusieurs personnes devront valider.",
  budget: "On a déjà parlé du budget tout à l'heure.",
  valeur: "Vous avez compris ce qu'on attend, je ne reviens pas dessus.",
  achats: "Vous connaissez déjà notre circuit d'achat.",
  conformite: "Vous savez déjà ce que la sécurité attend.",
  consensus: "Je vous ai dit que tout le monde n'était pas aligné.",
};
const RECALL_DEFAULT = "Vous m'avez déjà interrogé là-dessus.";

const WEAK_FOLLOW_UP = {
  argument: [q("Ce n'est pas un vrai problème, nous savons gérer ça."), "Pour nous, si."] as [string, string],
  vague: [q("D'accord, je note."), "Très bien."] as [string, string],
};

function followUpStep(factor: BlockerFactorId, rand: () => number): SimStep {
  const f = FOLLOW_UPS[factor];
  const label = getBlockerFactor(factor)!.label;
  const question = q(f.question);
  return {
    id: `relance-${factor}`,
    origin: "relance",
    theme: `Relance : ${label}`,
    factor,
    buyerLine: f.buyerLine,
    choices: shuffle(
      [
        { id: `relance-${factor}:question`, kind: "question" as const, label: question },
        { id: `relance-${factor}:argument`, kind: "argument" as const, label: WEAK_FOLLOW_UP.argument[0] },
        { id: `relance-${factor}:vague`, kind: "vague" as const, label: WEAK_FOLLOW_UP.vague[0] },
      ],
      rand,
    ),
    goodQuestion: question,
    replies: { question: f.good, argument: WEAK_FOLLOW_UP.argument[1], vague: WEAK_FOLLOW_UP.vague[1] },
    risky: false,
  };
}

function carriedStep(factor: BlockerFactorId, index: number, rand: () => number): SimStep {
  const f = FOLLOW_UPS[factor];
  const factorDef = getBlockerFactor(factor)!;
  const question = q(f.question);
  return {
    id: `retour-${factor}-${index}`,
    origin: "retour",
    theme: `Blocage qui revient : ${factorDef.label}`,
    factor,
    buyerLine: ESCALATIONS[factor],
    choices: shuffle(
      [
        { id: `retour-${factor}:question`, kind: "question" as const, label: question },
        { id: `retour-${factor}:argument`, kind: "argument" as const, label: WEAK_FOLLOW_UP.argument[0] },
        { id: `retour-${factor}:vague`, kind: "vague" as const, label: WEAK_FOLLOW_UP.vague[0] },
      ],
      rand,
    ),
    goodQuestion: question,
    replies: { question: f.good, argument: WEAK_FOLLOW_UP.argument[1], vague: WEAK_FOLLOW_UP.vague[1] },
    risky: true,
    risk: {
      factor,
      level: "risque_majeur",
      text: `${factorDef.label} : raté au rendez-vous précédent, il revient plus grave.`,
      action: factorDef.action,
    },
  };
}

export function playChoice(step: SimStep, choiceId: string): SimTurn {
  const choice = step.choices.find((c) => c.id === choiceId) ?? step.choices[0]!;
  const riskFound =
    choice.kind === "question" && step.risky && step.risk ? step.risk : undefined;
  return {
    stepId: step.id,
    kind: choice.kind,
    label: choice.label,
    reply: step.replies[choice.kind],
    riskFound,
  };
}

/** Réplique de l'acheteur pour l'étape, avec un rappel si le sujet a déjà été exploré. */
export function buyerLineFor(state: SimState, step: SimStep): string {
  if (step.origin !== "base" || !step.factor || !state.known.includes(step.factor)) {
    return step.buyerLine;
  }
  return `${RECALLS[step.factor] ?? RECALL_DEFAULT} ${step.buyerLine}`;
}

export function startSimulation(sim: Simulation): SimState {
  return {
    queue: [...sim.steps],
    played: [],
    patience: sim.patience,
    maxPatience: sim.patience,
    endedEarly: false,
    lost: [],
    closingLine: null,
    known: [...sim.known],
    revealed: [],
    dug: [],
    events: sim.carried.map(
      (f) => `Un blocage raté au rendez-vous précédent revient : ${getBlockerFactor(f)!.label}.`,
    ),
  };
}

export function currentStep(state: SimState): SimStep | undefined {
  return state.queue[0];
}

export function isFinished(state: SimState): boolean {
  return state.queue.length === 0;
}

/**
 * Joue un bouton. Une bonne question rassure l'acheteur, et si elle révèle un
 * blocage, elle débloque une relance. Un argument ou une question vague
 * l'agace : à bout de patience, il écourte et les questions restantes sont perdues.
 */
export function applyChoice(state: SimState, choiceId: string): SimState {
  const step = state.queue[0];
  if (!step) return state;
  const turn = playChoice(step, choiceId);
  const order = state.played.length + 1;
  const next: SimState = {
    ...state,
    queue: state.queue.slice(1),
    played: [...state.played, { step, buyerLine: buyerLineFor(state, step), turn }],
    known: [...state.known],
    revealed: [...state.revealed],
    dug: [...state.dug],
    events: [...state.events],
    lost: [...state.lost],
  };

  if (turn.kind === "question") {
    next.patience = Math.min(state.maxPatience, state.patience + 1);
    if (step.factor && !next.known.includes(step.factor)) next.known.push(step.factor);
    if (step.origin === "relance" && step.factor) {
      next.dug.push(step.factor);
      next.events.push(`Étape ${order} : relance réussie, le blocage « ${getBlockerFactor(step.factor)!.label} » est creusé.`);
    }
    if (step.origin === "retour" && step.factor) {
      next.revealed.push(step.factor);
      next.dug.push(step.factor);
      next.events.push(`Étape ${order} : le blocage revenu (« ${getBlockerFactor(step.factor)!.label} ») est traité.`);
    }
    if (turn.riskFound && step.origin === "base") {
      const factor = turn.riskFound.factor;
      next.revealed.push(factor);
      next.events.push(`Étape ${order} : bonne question, blocage repéré — ${getBlockerFactor(factor)!.label}.`);
      if (!next.dug.includes(factor) && !next.queue.some((s) => s.id === `relance-${factor}`)) {
        const rand = seededRandom(order * 7919 + factor.length);
        next.queue = [followUpStep(factor, rand), ...next.queue];
      }
    }
    return next;
  }

  next.patience = state.patience - 1;
  next.events.push(
    `Étape ${order} : ${turn.kind === "argument" ? "argument" : "question vague"} — l'acheteur ${next.patience > 0 ? "s'agace" : "décroche"}.`,
  );
  if (next.patience <= 0 && next.queue.length > 0) {
    next.endedEarly = true;
    next.lost = [...next.queue];
    next.queue = [];
    next.closingLine = "Je vais devoir vous laisser, on se rappelle.";
    next.events.push(
      `L'acheteur écourte le rendez-vous : ${next.lost.length} question${next.lost.length > 1 ? "s" : ""} perdue${next.lost.length > 1 ? "s" : ""}.`,
    );
  }
  return next;
}

export function buildDebrief(sim: Simulation, state: SimState): SimDebrief {
  const asked: string[] = [];
  const missed: string[] = [];
  const risksFound: SimRisk[] = [];
  const risksMissed: SimRisk[] = [];
  for (const { step, turn } of state.played) {
    if (turn.kind === "question") asked.push(step.goodQuestion);
    else missed.push(step.goodQuestion);
    if (step.risky && step.risk) {
      if (turn.riskFound) risksFound.push(step.risk);
      else risksMissed.push(step.risk);
    }
  }
  for (const step of state.lost) {
    missed.push(step.goodQuestion);
    if (step.risky && step.risk) risksMissed.push(step.risk);
  }

  const allSteps = [...state.played.map((p) => p.step), ...state.lost];
  const blockers: BlockerOutcome[] = sim.blockers.map((id) => {
    const factor = getBlockerFactor(id)!;
    const carried = sim.carried.includes(id);
    const status: BlockerOutcome["status"] = state.dug.includes(id)
      ? "creuse"
      : state.revealed.includes(id)
        ? "repere"
        : "manque";
    const revealing = state.played.find(
      (p) => p.step.factor === id && (p.turn.riskFound || (p.step.origin === "retour" && p.turn.kind === "question")),
    );
    const candidate =
      allSteps.find((s) => s.factor === id && s.risky) ?? allSteps.find((s) => s.factor === id);
    const evidence =
      status === "manque"
        ? `Question qui l'aurait ${carried ? "traité" : "révélé"} : ${candidate?.goodQuestion ?? `«\u00a0${factor.question}\u00a0»`}`
        : status === "creuse"
          ? carried
            ? `Revenu du rendez-vous précédent, traité grâce à ${revealing?.step.goodQuestion ?? "la bonne question"}`
            : `Repéré grâce à ${revealing?.step.goodQuestion ?? "la bonne question"}, puis creusé par la relance`
          : `Repéré grâce à ${revealing?.step.goodQuestion ?? "la bonne question"}, mais pas creusé`;
    return {
      factor: id,
      label: factor.label,
      status,
      carried,
      found: status !== "manque",
      evidence,
      action: candidate?.risk?.action ?? factor.action,
    };
  });

  // Ce qui n'est pas creusé revient au rendez-vous suivant.
  const carryOver = blockers.filter((b) => b.status !== "creuse").map((b) => b.factor);
  const lost = state.lost.map((s) => s.goodQuestion);
  const issueReached = !state.endedEarly && missed.length === 0;
  const hidden = blockers.find((b) => b.status === "manque");
  const shallow = blockers.find((b) => b.status === "repere");
  const nextStep = state.endedEarly
    ? `L'acheteur a écourté : dans le vrai deal, obtiens un nouveau rendez-vous en partant de son problème, pas de ton offre.${hidden ? ` Puis vérifie ce blocage : ${hidden.label}.` : ""}`
    : hidden
      ? `Dans le vrai deal, vérifie d'abord ce blocage : ${hidden.label}. ${hidden.action}`
      : shallow
        ? `Creuse le blocage repéré : ${shallow.label}. ${shallow.action}`
        : missed[0]
          ? `Dans le vrai deal, pose la question oubliée : ${missed[0]}`
          : `Issue atteinte : ${sim.issue}`;
  return {
    asked,
    missed,
    risksFound,
    risksMissed,
    blockers,
    lost,
    endedEarly: state.endedEarly,
    events: state.events,
    carryOver,
    known: state.known,
    issueReached,
    nextStep,
  };
}

/** Pour la doc et les tests : patterns communs par rendez-vous. */
export function listPatterns(): Array<{
  id: string;
  theme: string;
  meeting: MeetingTypeId;
  factor: BlockerFactorId | null;
  sectorSpecific: boolean;
}> {
  return PATTERNS.map((p) => ({
    id: p.id,
    theme: p.theme,
    meeting: p.meeting,
    factor: p.factor,
    sectorSpecific: Boolean(p.when),
  }));
}
