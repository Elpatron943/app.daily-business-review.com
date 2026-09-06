import type { InactionValueKind, PersonalMotivationPolarity } from "../config/types";

/** Réponses brutes du funnel (avant enrichissement IA). */
export type OnboardingAnswers = {
  companyName: string;
  activity: string;
  offerKind: string;
  productCount: string;
  productNames: string;
  differentiators: string;
  targetCustomers: string;
  competitors: string;
  clientProblems: string;
  urgencyTriggers: string;
  inactionCosts: string;
  freeNotes: string;
};

export type OnboardingDraftItem = {
  label: string;
  description: string;
  /** Inclure à la soumission (revue admin). */
  selected: boolean;
};

export type OnboardingDraftProblem = OnboardingDraftItem & {
  familyLabel: string;
};

export type OnboardingDraftLever = OnboardingDraftItem & {
  familyLabel: string;
};

export type OnboardingDraftMotivation = OnboardingDraftItem & {
  polarity: PersonalMotivationPolarity;
};

export type OnboardingDraftInaction = OnboardingDraftItem & {
  valueKind: InactionValueKind;
};

export type OnboardingDraftSolution = OnboardingDraftItem & {
  name: string;
};

/** Proposition structurée soumise à validation admin. */
export type OnboardingDraft = {
  orgName: string;
  orgDescription: string;
  usps: OnboardingDraftItem[];
  solutions: OnboardingDraftSolution[];
  sectors: OnboardingDraftItem[];
  personae: OnboardingDraftItem[];
  competitors: OnboardingDraftItem[];
  compellingEvents: OnboardingDraftItem[];
  projectProblems: OnboardingDraftProblem[];
  projectLevers: OnboardingDraftLever[];
  personalMotivations: OnboardingDraftMotivation[];
  inactionLevers: OnboardingDraftInaction[];
  /** Synthèse libre pour l’admin. */
  summary: string;
};

export type FunnelStepId = keyof OnboardingAnswers;

export type FunnelStep = {
  id: FunnelStepId;
  botMessage: string;
  placeholder: string;
  multiline?: boolean;
  optional?: boolean;
};

export const EMPTY_ANSWERS: OnboardingAnswers = {
  companyName: "",
  activity: "",
  offerKind: "",
  productCount: "",
  productNames: "",
  differentiators: "",
  targetCustomers: "",
  competitors: "",
  clientProblems: "",
  urgencyTriggers: "",
  inactionCosts: "",
  freeNotes: "",
};

export const ONBOARDING_FUNNEL: FunnelStep[] = [
  {
    id: "companyName",
    botMessage: "Bonjour ! Pour démarrer, quel est le **nom de votre entreprise** ?",
    placeholder: "Ex. Acme Solutions",
  },
  {
    id: "activity",
    botMessage:
      "Que vendez-vous, et à qui ? Décrivez en quelques phrases votre activité, votre marché et votre proposition de valeur.",
    placeholder: "Ex. Nous vendons un logiciel de… à des DSI dans l’industrie…",
    multiline: true,
  },
  {
    id: "offerKind",
    botMessage:
      "Votre offre, c’est plutôt des **produits**, des **prestations / services**, ou un **mix** des deux ?",
    placeholder: "Ex. Mix SaaS + services d’intégration",
  },
  {
    id: "productCount",
    botMessage: "Combien de produits ou prestations principales commercialisez-vous ?",
    placeholder: "Ex. 3",
  },
  {
    id: "productNames",
    botMessage:
      "Quels sont leurs **noms** (et une courte description si possible) ? Séparez-les par des retours à la ligne ou des virgules.",
    placeholder: "Ex.\nPlateforme X — pilotage…\nAudit Y — …",
    multiline: true,
  },
  {
    id: "differentiators",
    botMessage:
      "Qu’est-ce qui vous différencie vraiment ? Listez vos **arguments clés / USP** (un par ligne).",
    placeholder: "Ex.\nExpertise métier\nTime-to-value < 30 j",
    multiline: true,
  },
  {
    id: "targetCustomers",
    botMessage:
      "Qui sont vos **clients types** ? Secteurs, tailles d’entreprise, et personae décideurs (DG, CFO, DSI…).",
    placeholder: "Ex. ETI industrielles, DSI + Directeur ops",
    multiline: true,
  },
  {
    id: "competitors",
    botMessage:
      "Qui sont vos **principaux concurrents** (noms) ? Un par ligne si possible.",
    placeholder: "Ex.\nConcurrent A\nConcurrent B",
    multiline: true,
  },
  {
    id: "clientProblems",
    botMessage:
      "**Pourquoi y a-t-il un projet chez le client ?** Quels problèmes, enjeux ou leviers déclenchent typiquement un achat chez vous ?",
    placeholder: "Ex. Process manuels, manque de visibilité, dette technique…",
    multiline: true,
  },
  {
    id: "urgencyTriggers",
    botMessage:
      "**Pourquoi maintenant ?** Quels événements, échéances ou urgences font avancer (ou bloquent) la décision ?",
    placeholder: "Ex. Fin d’exercice, audit, départ concurrent, nouvelle régulation…",
    multiline: true,
  },
  {
    id: "inactionCosts",
    botMessage:
      "Si le client **n’agit pas**, que perd-il ? (temps, CA, risques, coûts évités…) — éléments utiles pour le coût d’inaction.",
    placeholder: "Ex. 2 ETP perdus / an, retards livraison, amendes…",
    multiline: true,
  },
  {
    id: "freeNotes",
    botMessage:
      "Autre chose d’important pour paramétrer DBR (méthode de vente, jargon métier, cas clients…) ? Sinon répondez « non ».",
    placeholder: "Optionnel",
    multiline: true,
    optional: true,
  },
];
