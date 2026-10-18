/**
 * Rendez-vous simulés à boutons — PATTERNS communs à tous les secteurs.
 *
 * Chaque pattern décrit un moment de rendez-vous qui existe dans tous les
 * secteurs (le problème, les décideurs, le budget, le mode d'achat, la revue,
 * le signataire…). Les variables du secteur client (sectorModels.ts) remplissent
 * les trous ; le profil vendeur ajoute son objection. Le moteur est déterministe
 * (graine) : pas d'appel IA, même partie rejouable, coût nul.
 *
 * À chaque étape, le commercial choisit entre trois boutons :
 * - une bonne question (révèle l'information, et le risque s'il y en a un) ;
 * - un argument (ligne DBR : on questionne, on n'argumente pas) ;
 * - une question vague ou fermée.
 */

import {
  getClientSectorModel,
  getMeetingType,
  getSellerProfile,
  type ClientSectorModel,
  type MeetingTypeId,
  type SectorVariables,
  type SellerProfile,
} from "./sectorModels";

export type ChoiceKind = "question" | "argument" | "vague";

export type SimRisk = {
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
  theme: string;
  /** Ce que dit l'acheteur avant le choix du commercial. */
  buyerLine: string;
  /** Trois boutons, dans un ordre tiré par la graine. */
  choices: SimChoice[];
  /** Libellé de la bonne question (pour le débrief). */
  goodQuestion: string;
  /** Réponse de l'acheteur, selon le choix. */
  replies: Record<ChoiceKind, string>;
  /** Branche tirée : si vrai, la bonne question révèle le risque. */
  risky: boolean;
  risk?: SimRisk;
};

export type Simulation = {
  model: ClientSectorModel;
  seller: SellerProfile | null;
  meeting: MeetingTypeId;
  multiEntity: boolean;
  interlocutor: string;
  opening: string;
  steps: SimStep[];
  issue: string;
};

export type SimTurn = {
  stepId: string;
  kind: ChoiceKind;
  label: string;
  reply: string;
  riskFound?: SimRisk;
};

export type SimDebrief = {
  asked: string[];
  missed: string[];
  risksFound: SimRisk[];
  risksMissed: SimRisk[];
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
  riskReply?: string;
  risk?: SimRisk;
  argument: [label: string, reply: string];
  vague: [label: string, reply: string];
};

type PatternDef = {
  id: string;
  theme: string;
  meeting: MeetingTypeId;
  /** Pattern actif seulement si la condition est vraie. */
  when?: (ctx: Ctx) => boolean;
  build: (ctx: Ctx) => PatternOutput;
};

const ISSUES: Record<MeetingTypeId, string> = {
  R1: "Problème relié à un indicateur, décideurs et veto identifiés, budget et mode d'achat connus, démonstration datée.",
  R2: "Cas d'usage validé par les utilisateurs, critère de succès fixé, revue sécurité préparée.",
  R3: "Exigences listées avec leurs preuves, clauses connues, date de l'avis.",
  R4: "Procédure, signataire, conditions et date de décision connus.",
};

/* ------------------------------------------------------------------ */
/* Patterns communs                                                    */
/* ------------------------------------------------------------------ */

const PATTERNS: PatternDef[] = [
  // ---------- R1 · Découverte ----------
  {
    id: "r1-probleme",
    theme: "Le problème et son coût",
    meeting: "R1",
    build: () => ({
      buyerLine: "On m'a dit que vous pouviez nous aider. Je vous écoute, j'ai vingt minutes.",
      question: "« Quel problème voulez-vous résoudre, et que vous coûte-t-il aujourd'hui ? »",
      good: "Mes équipes perdent du temps à consolider l'information, et la direction le voit dans ses indicateurs.",
      riskReply: "Honnêtement, ce n'est pas urgent : ça fonctionne à peu près.",
      risk: {
        level: "risque",
        text: "Pas d'urgence : le deal risque de finir sans décision.",
        action: "Relier le sujet à un indicateur que le sponsor suit.",
      },
      argument: ["« Je vous présente d'abord ce que fait notre offre. »", "Très bien… mais je ne vois pas encore en quoi ça me concerne."],
      vague: ["« Tout va bien de votre côté ? »", "Oui, globalement ça va."],
    }),
  },
  {
    id: "r1-entite",
    theme: "Qui paie dans le groupe",
    meeting: "R1",
    when: (c) => Boolean(c.group),
    build: (c) => ({
      buyerLine: "Je précise : nous sommes une filiale d'un groupe.",
      question: "« Quelle entité paiera : votre filiale, une autre, ou le groupe ? »",
      good: "Notre filiale, sur son propre budget.",
      riskReply: c.group!.budgetRisk,
      risk: {
        level: "risque_majeur",
        text: "Le sponsor n'a pas le budget : la décision est au groupe.",
        action: "Identifier qui détient le budget au groupe et obtenir une introduction.",
      },
      argument: ["« Notre offre conviendra à tout le groupe. »", "Peut-être, mais ce n'est pas moi qui en décide."],
      vague: ["« Le groupe est au courant ? »", "Plus ou moins."],
    }),
  },
  {
    id: "r1-decideurs",
    theme: "Les décideurs et le veto",
    meeting: "R1",
    build: ({ v }) => ({
      buyerLine: "Si ça m'intéresse, je peux avancer assez vite.",
      question: `« En dehors de vous, qui devra valider : ${v.vetoRoles} ? »`,
      good: `Il faudra l'accord de ${v.vetoRoles}. Je peux vous les présenter.`,
      riskReply: "On verra ça plus tard, c'est moi qui porte le sujet.",
      risk: {
        level: "risque_majeur",
        text: "Comité inconnu : les rôles qui peuvent dire non ne sont pas identifiés.",
        action: "Proposer de cartographier ensemble le circuit de validation.",
      },
      argument: ["« Je vous envoie une proposition dès demain. »", "Envoyez, je regarderai."],
      vague: ["« C'est bien vous qui décidez ? »", "Oui, c'est moi qui décide."],
    }),
  },
  {
    id: "r1-budget",
    theme: "Le budget",
    meeting: "R1",
    build: ({ v }) => ({
      buyerLine: "Sur le principe, l'idée me plaît.",
      question: `« Sur quel budget ce projet passerait-il (${v.budget}), et y a-t-il une enveloppe ? »`,
      good: `C'est sur ${v.budget}, et il y a une enveloppe pour ce type de sujet.`,
      riskReply: v.budgetRisk,
      risk: {
        level: "risque",
        text: "Pas de budget identifié.",
        action: "Obtenir la date du prochain arbitrage budgétaire et qui le défend.",
      },
      argument: ["« Pour vous situer, voici notre prix. »", "C'est un chiffre, mais je ne sais pas encore à quoi le comparer."],
      vague: ["« Vous avez du budget ? »", "On trouve toujours du budget quand c'est utile."],
    }),
  },
  {
    id: "r1-achat",
    theme: "Le mode d'achat",
    meeting: "R1",
    build: ({ v }) => ({
      buyerLine: "Admettons que ça marche chez nous.",
      question: `« Comment achetez-vous ce type d'offre (${v.procurement}) ? »`,
      good: "Pour ce montant, c'est assez simple : les achats suivront.",
      riskReply: v.procurementRisk,
      risk: {
        level: "risque_majeur",
        text: `Mode d'achat bloquant : « ${v.procurementRisk} »`,
        action: `${capitalize(v.procurementAction)}.`,
      },
      argument: ["« Nous pouvons démarrer dès la semaine prochaine. »", "La rapidité, c'est bien, mais ce ne sont pas les opérationnels qui achètent."],
      vague: ["« Les achats, ça ne pose pas de problème ? »", "Pas plus que d'habitude."],
    }),
  },
  {
    id: "r1-suite",
    theme: "La prochaine étape",
    meeting: "R1",
    build: () => ({
      buyerLine: "Bon, il faut que je file.",
      question: "« Qui faut-il réunir pour la démonstration, et à quelle date ? »",
      good: "Faisons-la dans deux semaines, avec deux personnes de l'équipe.",
      argument: ["« Je vous rappelle la semaine prochaine ? »", "Rappelez-moi, oui."],
      vague: ["« Merci beaucoup pour votre temps. »", "Avec plaisir, au revoir."],
    }),
  },

  // ---------- R2 · Démonstration ----------
  {
    id: "r2-cas",
    theme: "Le cas concret",
    meeting: "R2",
    build: ({ v }) => ({
      buyerLine: `Allons-y. ${v.demo}`,
      question: "« Sur quel cas concret de votre quotidien voulez-vous juger ce que nous proposons ? »",
      good: "Prenons le dossier qui nous a posé problème le mois dernier.",
      argument: ["« Je vous montre tout, du début à la fin. »", "C'est très complet… mais ce n'est pas notre façon de travailler."],
      vague: ["« Vous avez des questions ? »", "Pas pour l'instant."],
    }),
  },
  {
    id: "r2-utilisateurs",
    theme: "Les utilisateurs",
    meeting: "R2",
    build: () => ({
      buyerLine: "Mon équipe est là : c'est elle qui l'utiliserait au quotidien.",
      question: "« Qui l'utilisera chaque semaine, et que fera-t-il autrement ? »",
      good: "Les deux personnes ici : elles arrêteraient de tout consolider à la main.",
      riskReply: "Eux ? Ils s'adapteront, c'est moi qui décide.",
      risk: {
        level: "risque",
        text: "Pas d'adhésion terrain : seul le sponsor parle.",
        action: "Demander un atelier avec deux utilisateurs.",
      },
      argument: ["« Regardez nos fonctions avancées. »", "Impressionnant, mais on n'en utiliserait pas la moitié."],
      vague: ["« Ça vous plaît ? »", "Oui, c'est joli."],
    }),
  },
  {
    id: "r2-groupe",
    theme: "Le groupe dans la boucle",
    meeting: "R2",
    when: (c) => Boolean(c.group),
    build: (c) => ({
      buyerLine: c.group!.demo,
      question: "« Qui, côté groupe, doit voir la démonstration, et sur quels critères ? »",
      good: "Le responsable métier du groupe : il regardera surtout l'extension aux autres filiales.",
      riskReply: "Le groupe ? On lui présentera le projet une fois décidé.",
      risk: {
        level: "risque_majeur",
        text: "Décision prise sans le groupe : elle peut être bloquée ensuite.",
        action: "Inviter un représentant du groupe avant la revue.",
      },
      argument: ["« Le groupe suivra, c'est certain. »", "Vous ne connaissez pas notre groupe."],
      vague: ["« Le groupe est d'accord ? »", "En principe."],
    }),
  },
  {
    id: "r2-critere",
    theme: "Le critère de succès",
    meeting: "R2",
    build: () => ({
      buyerLine: "On commence à voir l'intérêt.",
      question: "« À quoi verrez-vous, dans trois mois, que ça a marché ? »",
      good: "Si l'équipe gagne une demi-journée par semaine sur la consolidation, c'est gagné.",
      riskReply: "Je ne sais pas, on verra à l'usage.",
      risk: {
        level: "risque",
        text: "Aucun critère de succès : la valeur ne pourra pas être prouvée.",
        action: "Fixer avec eux un critère mesurable.",
      },
      argument: ["« Nos clients gagnent beaucoup de temps. »", "Chez les autres, peut-être. Et chez nous ?"],
      vague: ["« Vous êtes convaincus ? »", "À moitié."],
    }),
  },
  {
    id: "r2-donnees",
    theme: "Les données",
    meeting: "R2",
    build: ({ v }) => ({
      buyerLine: "Une question me vient pour la suite.",
      question: "« Quelles données passeront dans la solution, et qui devra le valider ? »",
      good: `Il y aura ${v.data} : il faudra passer par ${v.review}.`,
      argument: ["« Rassurez-vous, tout est sécurisé. »", "Vous direz ça à notre sécurité : ils voudront des preuves."],
      vague: ["« On passe à la suite ? »", "D'accord."],
    }),
  },

  // ---------- R3 · Revue sécurité et conformité ----------
  {
    id: "r3-exigences",
    theme: "Les exigences",
    meeting: "R3",
    build: ({ v }) => ({
      buyerLine: `Je suis là pour ${v.review}.`,
      question: "« Quelles sont vos exigences, et sous quelle forme voulez-vous les preuves ? »",
      good: `Il nous faut ${v.reviewProof}.`,
      riskReply: "Nos exigences vont au-delà de ce que vous avez montré jusqu'ici.",
      risk: {
        level: "risque_majeur",
        text: "Exigence que le vendeur ne peut peut-être pas prouver.",
        action: "Lister ce qui est prouvable et remonter le reste : aucune garantie sans preuve.",
      },
      argument: ["« Nous sommes conformes à tout. »", "Tout le monde dit ça. Je veux des documents."],
      vague: ["« C'est une formalité, non ? »", "Ce n'est jamais une formalité."],
    }),
  },
  {
    id: "r3-donnees",
    theme: "Les données et leurs règles",
    meeting: "R3",
    build: ({ v }) => ({
      buyerLine: "Parlons des données.",
      question: "« Quelles données exactement, et quelles règles internes s'y appliquent ? »",
      good: `Ce sont ${v.data}, avec nos règles d'hébergement et de conservation.`,
      argument: ["« Laissez-moi vous détailler notre architecture. »", "Je lirai la documentation. Ma question portait sur nos règles."],
      vague: ["« Les données, ça pose problème ? »", "Ça dépend."],
    }),
  },
  {
    id: "r3-contrat",
    theme: "Les clauses",
    meeting: "R3",
    build: () => ({
      buyerLine: "Il y aura aussi le volet contractuel.",
      question: "« Quel modèle de contrat et quelles clauses de sécurité imposez-vous ? »",
      good: "Nos clauses types : je vous les envoie ce soir.",
      riskReply: "Il faudra accepter nos clauses d'audit sur site.",
      risk: {
        level: "risque",
        text: "Clause lourde à négocier.",
        action: "Remonter à la direction : contrat et clauses sont son arbitrage.",
      },
      argument: ["« Partons sur notre contrat standard. »", "Nous travaillons avec nos modèles."],
      vague: ["« Votre juridique est d'accord ? »", "Il n'a pas encore vu le dossier."],
    }),
  },
  {
    id: "r3-avis",
    theme: "L'avis et son délai",
    meeting: "R3",
    build: () => ({
      buyerLine: "Je ne pourrai pas conclure aujourd'hui.",
      question: "« Qui rend l'avis final, et dans quel délai ? »",
      good: "Moi, d'ici trois semaines si j'ai toutes les pièces.",
      argument: ["« Vous pouvez valider aujourd'hui ? »", "Ce n'est pas possible sans les pièces."],
      vague: ["« J'attends votre retour. »", "Vous l'aurez."],
    }),
  },

  // ---------- R4 · Achats et contrat ----------
  {
    id: "r4-procedure",
    theme: "La procédure",
    meeting: "R4",
    build: ({ v }) => ({
      buyerLine: "Je reprends le dossier côté achats.",
      question: `« Quelle procédure s'applique ici (${v.procurement}) ? »`,
      good: "Pour ce montant, une consultation simple suffit.",
      riskReply: v.procurementRisk,
      risk: {
        level: "risque_majeur",
        text: `Mode d'achat bloquant : « ${v.procurementRisk} »`,
        action: `${capitalize(v.procurementAction)}.`,
      },
      argument: ["« Avec une remise, on peut aller plus vite ? »", "Une remise ne change pas la procédure."],
      vague: ["« C'est compliqué, chez vous ? »", "Ça dépend du montant."],
    }),
  },
  {
    id: "r4-groupe",
    theme: "Le référencement groupe",
    meeting: "R4",
    when: (c) => Boolean(c.group),
    build: (c) => ({
      buyerLine: "Je dois aussi en parler au groupe.",
      question: "« Faut-il un référencement groupe, et qui signe : la filiale ou le groupe ? »",
      good: "Le groupe vous référence, puis la filiale signe.",
      riskReply: c.group!.procurementRisk,
      risk: {
        level: "risque_majeur",
        text: `Blocage groupe : « ${c.group!.procurementRisk} »`,
        action: `${capitalize(c.group!.procurementAction)}.`,
      },
      argument: ["« On peut signer sans passer par le groupe ? »", "Ce n'est pas comme ça que ça marche ici."],
      vague: ["« Le groupe suit ? »", "Je ne sais pas."],
    }),
  },
  {
    id: "r4-signataire",
    theme: "Le signataire",
    meeting: "R4",
    build: ({ v }) => ({
      buyerLine: "Votre offre est en cours d'analyse.",
      question: `« Qui signe, et faut-il passer par ${v.signature} ? »`,
      good: `Oui, par ${v.signature} ; la prochaine occasion est à la fin du mois.`,
      riskReply: "Je ne sais pas encore qui signera.",
      risk: {
        level: "risque",
        text: "Signataire inconnu : la date de signature n'est pas défendable.",
        action: "Obtenir le circuit de signature par écrit.",
      },
      argument: ["« On peut signer avant la fin du trimestre ? »", "Votre fin de trimestre n'est pas notre calendrier."],
      vague: ["« Ça va signer ? »", "Probablement."],
    }),
  },
  {
    id: "r4-conditions",
    theme: "Les conditions",
    meeting: "R4",
    build: () => ({
      buyerLine: "Il reste à cadrer les conditions.",
      question: "« Quelles conditions sont non négociables pour vous ? »",
      good: "Nos délais de paiement habituels, la réversibilité et nos clauses types.",
      argument: ["« Nos conditions générales sont standard. »", "Nous verrons ça avec le juridique."],
      vague: ["« Il y a des points bloquants ? »", "Pas à ma connaissance."],
    }),
  },
  {
    id: "r4-delai",
    theme: "La date de décision",
    meeting: "R4",
    build: ({ v }) => ({
      buyerLine: "Vous voulez sans doute une date.",
      question: `« Compte tenu de ${v.delay}, quelle date de décision est réaliste ? »`,
      good: "Réaliste ? D'ici deux mois, si tout est complet.",
      argument: ["« Visons une signature dans quinze jours. »", "C'est votre souhait, pas notre calendrier."],
      vague: ["« C'est pour bientôt ? »", "On verra."],
    }),
  },
];

/** Objection du profil vendeur, insérée avant la dernière étape. */
function sellerObjectionPattern(seller: SellerProfile, objection: string): PatternDef {
  return {
    id: "objection-vendeur",
    theme: `L'objection (${seller.label})`,
    meeting: "R1",
    build: () => ({
      buyerLine: objection,
      question: "« Qu'est-ce qui vous amène à poser cette question ? »",
      good: `On a déjà été déçus là-dessus. Ce qui nous rassurerait : ${lowerFirst(seller.proofs[0] ?? "des preuves concrètes")}.`,
      argument: ["« Je vous réponds point par point. »", "C'est ce que disent tous les fournisseurs."],
      vague: ["« Je peux faire un geste sur le prix. »", "Le sujet n'est pas le prix."],
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

/** Part des étapes à risque tirées dans une partie (mécanique de jeu, pas une statistique). */
const RISK_DRAW = 0.45;

export type SimulationSetup = {
  clientSectorId: string | null | undefined;
  sellerProfileId: string | null | undefined;
  multiEntity?: boolean;
  meeting: MeetingTypeId;
  seed: number;
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

  const defs = PATTERNS.filter(
    (p) => p.meeting === meeting && (!p.when || p.when(ctx)),
  );
  if (seller) {
    const objection =
      seller.objections.at(Math.floor(rand() * seller.objections.length)) ??
      seller.objections[0]!;
    defs.splice(Math.max(defs.length - 1, 0), 0, sellerObjectionPattern(seller, objection));
  }

  let riskyCount = 0;
  const steps: SimStep[] = defs.map((def) => {
    const out = def.build(ctx);
    const canBeRisky = Boolean(out.risk && out.riskReply);
    const risky = canBeRisky && rand() < RISK_DRAW;
    if (risky) riskyCount += 1;
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
      theme: def.theme,
      buyerLine: out.buyerLine,
      choices,
      goodQuestion: out.question,
      replies: {
        question: risky ? out.riskReply! : out.good,
        argument: out.argument[1],
        vague: out.vague[1],
      },
      risky,
      risk: out.risk,
    };
  });

  // Au moins un risque par partie quand c'est possible : sinon le jeu n'apprend rien.
  if (riskyCount === 0) {
    const candidate = steps.find((s, i) => {
      const def = defs.at(i)!;
      return Boolean(def.build(ctx).riskReply && s.risk);
    });
    if (candidate) {
      const def = defs.find((d) => d.id === candidate.id)!;
      candidate.risky = true;
      candidate.replies.question = def.build(ctx).riskReply!;
    }
  }

  const interlocutor = (groupModel && meeting !== "R3" ? groupModel : model).interlocutors[meeting];
  const meetingLabel = getMeetingType(meeting)?.label ?? meeting;
  return {
    model,
    seller,
    meeting,
    multiEntity: Boolean(groupModel),
    interlocutor,
    opening: `Rendez-vous ${meeting} · ${meetingLabel}. Vous êtes face à : ${interlocutor} (${model.label}${groupModel ? ", filiale d'un groupe" : ""}).`,
    steps,
    issue: ISSUES[meeting],
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

export function buildDebrief(sim: Simulation, turns: SimTurn[]): SimDebrief {
  const byStep = new Map(turns.map((t) => [t.stepId, t]));
  const asked: string[] = [];
  const missed: string[] = [];
  const risksFound: SimRisk[] = [];
  const risksMissed: SimRisk[] = [];
  for (const step of sim.steps) {
    const turn = byStep.get(step.id);
    if (turn?.kind === "question") asked.push(step.goodQuestion);
    else missed.push(step.goodQuestion);
    if (step.risky && step.risk) {
      if (turn?.riskFound) risksFound.push(step.risk);
      else risksMissed.push(step.risk);
    }
  }
  const issueReached = missed.length === 0;
  const firstMissedRisk = risksMissed[0];
  const nextStep = firstMissedRisk
    ? `Dans le vrai deal, vérifie ce point : ${firstMissedRisk.text} ${firstMissedRisk.action}`
    : risksFound[0]
      ? `Traite le signal repéré : ${risksFound[0].action}`
      : missed[0]
        ? `Dans le vrai deal, pose la question oubliée : ${missed[0]}`
        : `Issue atteinte : ${sim.issue}`;
  return { asked, missed, risksFound, risksMissed, issueReached, nextStep };
}

/** Pour la doc et les tests : patterns communs par rendez-vous. */
export function listPatterns(): Array<{ id: string; theme: string; meeting: MeetingTypeId; sectorSpecific: boolean }> {
  return PATTERNS.map((p) => ({
    id: p.id,
    theme: p.theme,
    meeting: p.meeting,
    sectorSpecific: Boolean(p.when),
  }));
}
