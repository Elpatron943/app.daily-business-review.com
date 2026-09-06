export type ContactTypeDef = {
  id: string;
  label: string;
  /** Couleur CSS pour le liseré / pastille */
  color: string;
  active: boolean;
  order: number;
};

export type SolutionModuleDef = {
  id: string;
  label: string;
  /** Description de la feature / module (contexte IA). */
  description: string;
  /** USP de notre solution sur cette feature. */
  usps: UspDef[];
  active: boolean;
  order: number;
};

export type SolutionDef = {
  id: string;
  name: string;
  code?: string;
  /** Pitch / description de la solution. */
  description: string;
  active: boolean;
  order: number;
  /** Modules / features vendables (legacy — catalogue aplati). */
  modules: SolutionModuleDef[];
  /** Regroupements de features pour la grille concurrentielle. */
  featureGroups: SolutionFeatureGroupDef[];
  /** Features comparées (nous vs concurrents). */
  features: SolutionBattleFeatureDef[];
  /** Produits concurrents de cette solution. */
  competitors: SolutionCompetitorDef[];
};

/** Couverture d’une feature : totale, partielle ou absente. */
export type FeatureCoverage = "full" | "partial" | "none";

export const FEATURE_COVERAGES: {
  id: FeatureCoverage;
  label: string;
}[] = [
  { id: "full", label: "Totalement" },
  { id: "partial", label: "Partiellement" },
  { id: "none", label: "Pas du tout" },
];

export type SolutionFeatureGroupDef = {
  id: string;
  label: string;
  active: boolean;
  order: number;
};

/** Feature du marché à comparer (notre solution vs concurrents). */
export type SolutionBattleFeatureDef = {
  id: string;
  label: string;
  description: string;
  /** Groupe (null = hors regroupement). */
  groupId: string | null;
  /** Notre couverture de cette feature. */
  ourCoverage: FeatureCoverage;
  active: boolean;
  order: number;
};

export type SolutionCompetitorDef = {
  id: string;
  name: string;
  description: string;
  /** Couverture par featureId. */
  featureCoverage: Record<string, FeatureCoverage>;
  active: boolean;
  order: number;
};

/** Argument différenciant (entreprise ou feature). */
export type UspDef = {
  id: string;
  label: string;
  description: string;
  active: boolean;
  order: number;
};

/** Profil de notre entreprise (vendeur) — base pour reco IA. */
export type OrgProfile = {
  name: string;
  description: string;
  usps: UspDef[];
};

/** Feature côté concurrent (comparaison optionnelle avec nos modules). */
export type CompetitorFeatureDef = {
  id: string;
  label: string;
  description: string;
  /** Module / feature nôtre (solution.modules.id) pour aligner la comparaison. */
  ourModuleId: string | null;
  active: boolean;
  order: number;
};

export type CompetitorDef = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  order: number;
  features: CompetitorFeatureDef[];
};

/** Variable saisie sur une opportunité (nb users, licences…). */
export type OppVariableKind = "number" | "text" | "boolean";

export const OPP_VARIABLE_KINDS: {
  id: OppVariableKind;
  label: string;
}[] = [
  { id: "number", label: "Nombre" },
  { id: "text", label: "Texte" },
  { id: "boolean", label: "Oui / Non" },
];

export type OppVariableDef = {
  id: string;
  label: string;
  kind: OppVariableKind;
  active: boolean;
  order: number;
  /** Valeur proposée à la création (nombre ou texte). */
  defaultValue?: string | number | boolean;
};

/** Persona = profil acheteur cible (catalogue org — Qui vous êtes). */
export type PersonaDef = {
  id: string;
  name: string;
  active: boolean;
  order: number;
};

/** @deprecated alias migration — utiliser PersonaDef */
export type DirectionDef = PersonaDef;

/** Secteur d’activité (catalogue org — saisie via liste déroulante). */
export type SectorDef = {
  id: string;
  name: string;
  active: boolean;
  order: number;
};

/**
 * Rôle d’un champ dans le calculateur Business Outcomes (configurable admin).
 * - current_cost / future_cost → économies = max(0, current − future)
 * - annual_benefit → ajoute au bénéfice annuel
 * - annual_cost → retranche du bénéfice annuel
 * - one_time → investissement (ROI / payback)
 * - horizon → années de projection (1 seul champ actif attendu)
 */
export type BoFieldKind =
  | "current_cost"
  | "future_cost"
  | "annual_benefit"
  | "annual_cost"
  | "one_time"
  | "horizon";

export const BO_FIELD_KINDS: {
  id: BoFieldKind;
  label: string;
  hint: string;
}[] = [
  {
    id: "current_cost",
    label: "Base avant solution",
    hint: "Coût de référence avant (€ / an) — avec « Après solution » → économies",
  },
  {
    id: "future_cost",
    label: "Après solution",
    hint: "Coût une fois la solution en place (€ / an)",
  },
  {
    id: "annual_benefit",
    label: "Gain annuel (+)",
    hint: "Ajoute au bénéfice (€ / an) : uplift, risque évité…",
  },
  {
    id: "annual_cost",
    label: "Charge annuelle (−)",
    hint: "Retranche du bénéfice (€ / an) : maintenance, abonnement…",
  },
  {
    id: "one_time",
    label: "Investissement one-shot",
    hint: "Montant unique (€) pour ROI / payback",
  },
  {
    id: "horizon",
    label: "Horizon (années)",
    hint: "Durée de projection",
  },
];

export type BoCategoryDef = {
  id: string;
  label: string;
  active: boolean;
  order: number;
};

export type BoFieldDef = {
  id: string;
  label: string;
  kind: BoFieldKind;
  /** Catégorie métier (Réduction des coûts, Croissance…) */
  categoryId: string | null;
  active: boolean;
  order: number;
  /** Valeur proposée à la création d’une opp */
  defaultValue?: number;
};

/** Question de qualification Process (admin configurable). */
export type ProcessQuestionDef = {
  id: string;
  label: string;
  active: boolean;
  order: number;
};

/** Domaine Process — checklist alignée sur une étape de pipeline. */
export type ProcessDomainDef = {
  id: string;
  label: string;
  active: boolean;
  order: number;
  questions: ProcessQuestionDef[];
};

/** Catégories fixes de l’Opportunity Mapping (matrice 4 colonnes). */
export type OppMappingCategory =
  | "objectif"
  | "risques"
  | "signaux_positifs"
  | "initiatives";

/** Thèmes de la bibliothèque de cartes (ids système). */
export type OppMappingThemeId =
  | "stakeholders"
  | "budget"
  | "besoin"
  | "competition"
  | "processus"
  | "pmf"
  | "relation"
  | "urgence"
  | "contrats"
  | "usp"
  | "custom";

/** Thème configurable (système + perso). */
export type OppMappingThemeDef = {
  id: string;
  label: string;
  active: boolean;
  order: number;
};

export const OPP_MAPPING_CATEGORIES: {
  id: OppMappingCategory;
  /** Lettre SWOT */
  swot: "S" | "W" | "O" | "T";
  label: string;
  /** Sous-libellé métier */
  subtitle: string;
  hint: string;
}[] = [
  {
    id: "signaux_positifs",
    swot: "S",
    label: "Forces",
    subtitle: "Signaux positifs",
    hint: "Atouts déjà observés sur le deal",
  },
  {
    id: "risques",
    swot: "W",
    label: "Faiblesses",
    subtitle: "Risques / dérisques",
    hint: "Zones de fragilité ou questions à lever",
  },
  {
    id: "objectif",
    swot: "O",
    label: "Opportunités",
    subtitle: "Objectifs & initiatives",
    hint: "Gains visés et programmes client à accrocher",
  },
  {
    id: "initiatives",
    swot: "T",
    label: "Menaces",
    subtitle: "Freins & menaces",
    hint: "Concurrence, timing, freins externes",
  },
];

/** Statut d’une carte SWOT sur le deal. */
export type OppMappingCardStatus = "open" | "covered" | "not_mastered";

/** Carte placée sur un quadrant SWOT d’une opportunité. */
export type OppMappingCardEntry = {
  /** Id catalogue (OppMappingSubtypeDef.id). */
  id: string;
  /** open = à traiter · covered = maîtrisé · not_mastered = non maîtrisé
   *  UI : une case à 3 états (vide → ✓ → ✗). */
  status: OppMappingCardStatus;
  /** @deprecated — migré vers status */
  covered?: boolean;
  /** Commentaire facultatif. */
  comment?: string;
};

export type OppMappingChecks = Partial<
  Record<OppMappingCategory, OppMappingCardEntry[]>
>;

/** Ordre d’affichage SWOT : S W / O T */
export const OPP_MAPPING_SWOT_ORDER: OppMappingCategory[] = [
  "signaux_positifs",
  "risques",
  "objectif",
  "initiatives",
];

/** Carte de la bibliothèque (ou ajout manuel) pour une colonne. */
export type OppMappingSubtypeDef = {
  id: string;
  category: OppMappingCategory;
  label: string;
  theme?: string;
  active: boolean;
  order: number;
  /**
   * Pondération si la carte est maîtrisée (✓). Défaut 1.
   * >1 = bonus, &lt;1 = impact réduit.
   */
  bonus?: number;
  /**
   * Pondération si la carte est non maîtrisée (✗). Défaut 1.
   * >1 = malus plus fort dans le score.
   */
  malus?: number;
  /**
   * Si true, la carte est toujours présente sur chaque opportunité
   * et ne peut pas être retirée du mapping.
   */
  required?: boolean;
};

/**
 * Matrice dashboard : Process (vertical) × Opportunity Mapping (horizontal).
 * `pipelinePhases` conservé pour compat stockage (non utilisé par le scatter).
 */
export type RiskMatrixConfig = {
  /** Score process (%) au-dessus → bande « élevé ». */
  processHighThreshold: number;
  /** Score process (%) en dessous → bande « faible ». */
  processLowThreshold: number;
  /**
   * Colonnes pipeline (ordre gauche → droite).
   * Vide = phases ouvertes Whitespace → Negotiation.
   */
  pipelinePhases: string[];
  axisLabels: {
    processHigh: string;
    processMid: string;
    processLow: string;
    pipeline: string;
  };
  /** @deprecated migration — ignoré si processHigh/Low présents */
  processThreshold?: number;
  impactMode?: RiskImpactMode;
  impactFixedAmount?: number;
  quadrants?: RiskMatrixQuadrantDef[];
};

/** @deprecated — ancienne matrice 2×2 Impact × Risque */
export type RiskMatrixQuadrantId =
  | "critique"
  | "proteger"
  | "renforcer"
  | "controle";

export type RiskMatrixQuadrantDef = {
  id: RiskMatrixQuadrantId;
  label: string;
  hint: string;
};

/** Seuil d’impact : médiane du portefeuille ou montant fixe (€). */
export type RiskImpactMode = "median" | "fixed";

/** Catalogue admin de Compelling Events. */
export type CompellingEventDef = {
  id: string;
  label: string;
  description: string;
  active: boolean;
  order: number;
};

/** Famille de leviers « Pourquoi y a-t-il un projet ? ». */
export type ProjectLeverFamilyDef = {
  id: string;
  label: string;
  description: string;
  active: boolean;
  order: number;
};

/** Critère / case à cocher rattachée à une famille de leviers projet. */
export type ProjectLeverDef = {
  id: string;
  familyId: string;
  label: string;
  description: string;
  active: boolean;
  order: number;
};

/** Famille de problèmes à résoudre (« Pourquoi un projet ? »). */
export type ProjectProblemFamilyDef = {
  id: string;
  label: string;
  description: string;
  active: boolean;
  order: number;
};

/** Problème client configurable (case à cocher sur l’opportunité). */
export type ProjectProblemDef = {
  id: string;
  familyId: string;
  label: string;
  description: string;
  active: boolean;
  order: number;
};

/** Polarité d’une motivation personnelle sur un projet. */
export type PersonalMotivationPolarity = "advance" | "retreat";

/**
 * Motivation personnelle à faire avancer / ralentir un projet
 * (carrière, objectif manager…).
 */
export type PersonalMotivationDef = {
  id: string;
  label: string;
  description: string;
  polarity: PersonalMotivationPolarity;
  active: boolean;
  order: number;
};

/** Nature d’un objectif « Pourquoi maintenant ». */
export type WhyNowObjectiveKind = "quantitative" | "qualitative";

/** Unité de saisie pour un objectif quantitatif. */
export type WhyNowValueUnit =
  | "percent"
  | "euro"
  | "days"
  | "number"
  | "fte";

export const WHY_NOW_VALUE_UNITS: {
  id: WhyNowValueUnit;
  label: string;
  suffix: string;
}[] = [
  { id: "percent", label: "Pourcentage (%)", suffix: "%" },
  { id: "euro", label: "Montant (€)", suffix: "€" },
  { id: "days", label: "Jours", suffix: "j" },
  { id: "fte", label: "ETP / FTE", suffix: "ETP" },
  { id: "number", label: "Nombre", suffix: "" },
];

/**
 * Objectif structuré (quanti / quali) — cases à cocher sur Outcomes.
 * Quanti : saisie d’une valeur typée (%, €, jours…).
 */
export type WhyNowObjectiveDef = {
  id: string;
  label: string;
  description: string;
  kind: WhyNowObjectiveKind;
  /** Unité de la valeur saisie (objectifs quantitatifs uniquement). */
  valueUnit: WhyNowValueUnit;
  active: boolean;
  order: number;
};

/**
 * Famille de lignes pour le coût d’inaction sur le deal
 * (gains, productivité, risques…).
 */
export type InactionLeverFamilyDef = {
  id: string;
  label: string;
  description: string;
  active: boolean;
  order: number;
};

/** Nature de chiffrage d’une ligne CoI (pas linéaire : 3 logiques). */
export type InactionValueKind =
  | "productivity"
  | "revenue"
  | "avoided";

/** Opérateur de formule CoI. */
export type InactionFormulaOp = "*" | "+" | "-" | "/" | "%";

/** Calcul paramétrable (Settings + deal). */
export type InactionFormulaDef = {
  enabled: boolean;
  inputs: { id: string; label?: string }[];
  operators: InactionFormulaOp[];
};

/** Ligne chiffrable du coût d’inaction (paramétrable Settings). */
export type InactionLeverDef = {
  id: string;
  familyId: string;
  label: string;
  description: string;
  /**
   * productivity = temps homme → € (nb ETP × h × freq × coût horaire)
   * revenue = gain de CA (€ / an ou formule)
   * avoided = coût évité / risque (impact × fréquence ou formule)
   */
  valueKind: InactionValueKind;
  /** Si enabled : le € / an = évaluation de la formule. */
  formula?: InactionFormulaDef | null;
  active: boolean;
  order: number;
};

export function normalizeInactionValueKind(
  raw: unknown,
  familyId?: string,
): InactionValueKind {
  if (raw === "productivity" || raw === "revenue" || raw === "avoided") {
    return raw;
  }
  // Legacy
  if (raw === "time") return "productivity";
  if (raw === "cash") {
    return familyId === "ilf-loss" || familyId === "ilf-avoided"
      ? "avoided"
      : "revenue";
  }
  return "productivity";
}

/** Dimensions du catalogue offre activées pour l’organisation. */
export type CatalogFeatures = {
  /** Utiliser des solutions (catalogue produits). */
  solutions: boolean;
  /** Décomposer les solutions en modules / features (désactivé — solutions seules). */
  modules: boolean;
  /** Rattacher les ventes / l’équipement aux personae. */
  personae: boolean;
};

export const DEFAULT_CATALOG_FEATURES: CatalogFeatures = {
  solutions: true,
  /** Modules désactivés — catalogue aplati sur les solutions. */
  modules: false,
  personae: true,
};

export function normalizeCatalogFeatures(
  raw: Partial<CatalogFeatures> | null | undefined,
): CatalogFeatures {
  const solutions = raw?.solutions !== false;
  // Catalogue = solutions uniquement (plus de modules / USP produit).
  const modules = false;
  // Legacy : catalogFeatures.directions
  const legacy = raw as (Partial<CatalogFeatures> & { directions?: boolean }) | null | undefined;
  const personae =
    legacy && "personae" in legacy
      ? legacy.personae !== false
      : legacy?.directions !== false;
  return { solutions, modules, personae };
}

export type OrgConfig = {
  version: 1;
  /** Notre entreprise : description + USP globaux. */
  orgProfile: OrgProfile;
  contactTypes: ContactTypeDef[];
  /** Quelles dimensions d’offre sont actives (solutions / personae). */
  catalogFeatures: CatalogFeatures;
  /** Catalogue produits global : solutions. */
  solutions: SolutionDef[];
  /** Personae cibles (Qui vous êtes) — ventes, contacts, opportunités. */
  personae: PersonaDef[];
  sectors: SectorDef[];
  boCategories: BoCategoryDef[];
  boFields: BoFieldDef[];
  processDomains: ProcessDomainDef[];
  /** Champs libres saisis sur chaque opportunité. */
  oppVariables: OppVariableDef[];
  /** Sous-types Opportunity Mapping (Objectif / Pressions / Initiatives). */
  oppMappingSubtypes: OppMappingSubtypeDef[];
  /** Thèmes de la bibliothèque Opportunity Mapping. */
  oppMappingThemes: OppMappingThemeDef[];
  /** Seuils et libellés de la matrice des risques. */
  riskMatrix: RiskMatrixConfig;
  /** Catalogue concurrents + features (contexte IA). */
  competitors: CompetitorDef[];
  /** Compelling Events paramétrables (référentiel admin). */
  compellingEvents: CompellingEventDef[];
  /** Familles de leviers projet (« Pourquoi un projet ? »). */
  projectLeverFamilies: ProjectLeverFamilyDef[];
  /** Leviers projet (cases à cocher) rattachés aux familles. */
  projectLevers: ProjectLeverDef[];
  /** Familles de problèmes à résoudre. */
  projectProblemFamilies: ProjectProblemFamilyDef[];
  /** Problèmes client (cases à cocher sur Pourquoi → Projet). */
  projectProblems: ProjectProblemDef[];
  /** Motivations personnelles (avancer / reculer le projet). */
  personalMotivations: PersonalMotivationDef[];
  /** Objectifs quali / quanti (« Pourquoi maintenant »). */
  whyNowObjectives: WhyNowObjectiveDef[];
  /** Familles de leviers coût d’inaction / décision d’achat. */
  inactionLeverFamilies: InactionLeverFamilyDef[];
  /** Leviers coût d’inaction (cases + valeur €). */
  inactionLevers: InactionLeverDef[];
  /** Phases d’opportunité (funnel). */
  oppPhases: OppPhaseDef[];
  /** Types / natures d’opportunité. */
  oppKinds: OppKindDef[];
  /** Statuts commerciaux des comptes. */
  commercialStatuses: CommercialStatusDef[];
  /** Tranches d’effectif. */
  accountSizes: AccountSizeDef[];
  /** Règles de calcul CA installé / cible. */
  kpiRules: KpiRulesConfig;
};

/** Rôle d’une phase dans les KPI / filtres. */
export type OppPhaseKpiRole = "whitespace" | "active" | "won" | "lost";

export type OppPhaseDef = {
  id: string;
  label: string;
  kpiRole: OppPhaseKpiRole;
  active: boolean;
  order: number;
};

/**
 * Ancres KPI du funnel — toujours présentes.
 * Les étapes pipeline (Discovery, Proposal…) sont dans buildDefaultOppPhases().
 */
export const DEFAULT_OPP_PHASES: OppPhaseDef[] = [
  {
    id: "Whitespace",
    label: "Whitespace",
    kpiRole: "whitespace",
    active: true,
    order: 1,
  },
  {
    id: "Closed Won",
    label: "Won",
    kpiRole: "won",
    active: true,
    order: 1000,
  },
  {
    id: "Closed Lost",
    label: "Lost",
    kpiRole: "lost",
    active: true,
    order: 1001,
  },
];

/** Phases verrouillées (KPI) — pas les étapes Process du milieu. */
const BUILTIN_OPP_PHASE_IDS = new Set(
  DEFAULT_OPP_PHASES.map((p) => p.id),
);

export function isBuiltInOppPhaseId(id: string): boolean {
  return BUILTIN_OPP_PHASE_IDS.has(id);
}

/**
 * by_phase = suit la phase (WS / étapes en cours)
 * renewal = bucket renouvellement si ouverte
 * none = hors cible
 */
export type OppKindTargetMode = "by_phase" | "renewal" | "none";

export type OppKindDef = {
  id: string;
  label: string;
  targetMode: OppKindTargetMode;
  active: boolean;
  order: number;
};

/** Natures de deal d’usine (préparamétrées). */
export const DEFAULT_OPP_KINDS: OppKindDef[] = [
  {
    id: "up",
    label: "Upsell",
    targetMode: "by_phase",
    active: true,
    order: 1,
  },
  {
    id: "cross",
    label: "Cross-sell",
    targetMode: "by_phase",
    active: true,
    order: 2,
  },
  {
    id: "new_logo",
    label: "New logo",
    targetMode: "by_phase",
    active: true,
    order: 3,
  },
  {
    id: "renewal",
    label: "Renouvellement",
    targetMode: "renewal",
    active: true,
    order: 4,
  },
];

export type CommercialStatusDef = {
  id: string;
  label: string;
  active: boolean;
  order: number;
};

export type AccountSizeDef = {
  id: string;
  label: string;
  active: boolean;
  order: number;
};

export type KpiRulesConfig = {
  /** Inclure le CA des lignes de vente dans le CA installé. */
  includeSalesInInstalled: boolean;
  /** Inclure les opportunités « won » dans le CA installé. */
  includeWonOppsInInstalled: boolean;
  /** Won de l’année civile uniquement (sinon tous). */
  wonCalendarYearOnly: boolean;
  /** Cible = somme des buckets cochés. */
  includeWhitespaceInTarget: boolean;
  /** Inclure les étapes en cours (hors WS / Won / Lost) dans la cible. */
  includePipelineInTarget: boolean;
  includeRenewalInTarget: boolean;
};

export const DEFAULT_KPI_RULES: KpiRulesConfig = {
  includeSalesInInstalled: true,
  /** Won matérialise une ligne de vente — pas de double comptage. */
  includeWonOppsInInstalled: false,
  wonCalendarYearOnly: true,
  includeWhitespaceInTarget: true,
  includePipelineInTarget: true,
  includeRenewalInTarget: true,
};

export const CONFIG_STORAGE_KEY = "powermap.orgConfig.v1";
