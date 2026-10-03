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
    botMessage:
      "On y va ! Premier niveau : quel est le **nom de votre entreprise** ?",
    placeholder: "Ex. Acme Solutions",
  },
  {
    id: "activity",
    botMessage:
      "Pitch express : que vendez-vous, et à qui ? 3–5 phrases suffisent (activité, marché, promesse).",
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
    botMessage:
      "Combien de produits ou prestations principales avez-vous vraiment dans le catalogue (les piliers) ?",
    placeholder: "Ex. 3",
  },
  {
    id: "productNames",
    botMessage:
      "Listez-les : **noms** + une courte description. Un par ligne, c’est parfait.",
    placeholder: "Ex.\nPlateforme X — pilotage…\nAudit Y — …",
    multiline: true,
  },
  {
    id: "differentiators",
    botMessage:
      "Ce qui fait gagner face aux autres : vos **arguments clés / USP** (un par ligne).",
    placeholder: "Ex.\nExpertise métier\nTime-to-value < 30 j",
    multiline: true,
  },
  {
    id: "targetCustomers",
    botMessage:
      "Vos clients types ? Secteurs, tailles, et personae qui décident (DG, CFO, DSI…).",
    placeholder: "Ex. ETI industrielles, DSI + Directeur ops",
    multiline: true,
  },
  {
    id: "competitors",
    botMessage:
      "Contre qui jouez-vous le plus souvent ? **Noms des concurrents**, un par ligne.",
    placeholder: "Ex.\nConcurrent A\nConcurrent B",
    multiline: true,
  },
  {
    id: "clientProblems",
    botMessage:
      "**Pourquoi un projet démarre chez eux ?** Problèmes / enjeux qui déclenchent un achat chez vous.",
    placeholder: "Ex. Process manuels, manque de visibilité, dette technique…",
    multiline: true,
  },
  {
    id: "urgencyTriggers",
    botMessage:
      "**Pourquoi maintenant ?** Événements ou échéances qui font avancer (ou bloquent) la décision.",
    placeholder: "Ex. Fin d’exercice, audit, départ concurrent, nouvelle régulation…",
    multiline: true,
  },
  {
    id: "inactionCosts",
    botMessage:
      "Et s’ils **n’agissent pas** : que perdent-ils ? (temps, CA, risques, coûts…) — pour le coût d’inaction.",
    placeholder: "Ex. 2 ETP perdus / an, retards livraison, amendes…",
    multiline: true,
  },
  {
    id: "freeNotes",
    botMessage:
      "Dernier bonus : jargon métier, méthode de vente, cas clients… ? Sinon répondez « non ».",
    placeholder: "Optionnel",
    multiline: true,
    optional: true,
  },
];
