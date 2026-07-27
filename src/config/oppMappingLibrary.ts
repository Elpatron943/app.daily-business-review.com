import type {
  OppMappingSubtypeDef,
  OppMappingThemeDef,
  OppMappingThemeId,
} from "./types";

/** Thèmes système (seed). « usp » est réservé aux USP catalogue côté deal. */
export const OPP_MAPPING_THEMES: {
  id: OppMappingThemeId;
  label: string;
}[] = [
  { id: "stakeholders", label: "Stakeholders & décision" },
  { id: "budget", label: "Budget" },
  { id: "besoin", label: "Besoin & pain points" },
  { id: "competition", label: "Compétition" },
  { id: "processus", label: "Processus d’achat" },
  { id: "pmf", label: "Product-market fit" },
  { id: "relation", label: "Relation & crédibilité" },
  { id: "urgence", label: "Urgence & timing" },
  { id: "contrats", label: "Contrats & legal" },
  { id: "usp", label: "USP" },
  { id: "custom", label: "Personnalisé" },
];

/** Thèmes éditables en Settings (hors USP catalogue). */
const ADMIN_THEME_SEED = OPP_MAPPING_THEMES.filter((t) => t.id !== "usp");

export function buildDefaultOppMappingThemes(): OppMappingThemeDef[] {
  return ADMIN_THEME_SEED.map((t, i) => ({
    id: t.id,
    label: t.label,
    active: true,
    order: i + 1,
  }));
}

export function normalizeOppMappingThemes(
  raw: OppMappingThemeDef[] | undefined,
): OppMappingThemeDef[] {
  const defaults = buildDefaultOppMappingThemes();
  if (!Array.isArray(raw) || raw.length === 0) {
    return structuredClone(defaults);
  }

  const migrated: OppMappingThemeDef[] = raw
    .filter((t) => t && typeof t.id === "string" && t.id.trim() && t.id !== "usp")
    .map((t, i) => ({
      id: t.id.trim(),
      label: (t.label ?? t.id).trim() || t.id,
      active: t.active !== false,
      order: t.order ?? i + 1,
    }));

  const byId = new Map(migrated.map((t) => [t.id, t] as const));
  for (const d of defaults) {
    if (!byId.has(d.id)) {
      const copy = structuredClone(d);
      migrated.push(copy);
      byId.set(d.id, copy);
    } else {
      const cur = byId.get(d.id)!;
      // Préserver le libellé admin s’il a été personnalisé ; sinon seed.
      if (!cur.label?.trim()) cur.label = d.label;
      if (cur.active == null) cur.active = true;
    }
  }

  return migrated.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "fr"));
}

export function resolveThemeLabel(
  themeId: string | undefined,
  themes: Pick<OppMappingThemeDef, "id" | "label">[],
): string | undefined {
  if (!themeId) return undefined;
  if (themeId === "usp") return "USP";
  return themes.find((t) => t.id === themeId)?.label ?? themeId;
}

type LibItem = {
  id: string;
  category: "signaux_positifs" | "risques" | "objectif" | "initiatives";
  theme: OppMappingThemeId;
  label: string;
  order: number;
};

const LIB: LibItem[] = [
  // —— Opportunités : objectifs + initiatives client
  { id: "omap-obj-cost", category: "objectif", theme: "besoin", label: "Réduire les coûts", order: 1 },
  { id: "omap-obj-risk", category: "objectif", theme: "urgence", label: "Réduire le risque", order: 2 },
  { id: "omap-obj-growth", category: "objectif", theme: "besoin", label: "Accélérer la croissance", order: 3 },
  { id: "omap-obj-compliance", category: "objectif", theme: "urgence", label: "Conformité / audit", order: 4 },
  { id: "omap-obj-productivity", category: "objectif", theme: "besoin", label: "Améliorer la productivité", order: 5 },
  { id: "omap-obj-experience", category: "objectif", theme: "besoin", label: "Améliorer l’expérience client / utilisateur", order: 6 },
  { id: "omap-ini-digital", category: "objectif", theme: "urgence", label: "Transformation digitale", order: 7 },
  { id: "omap-ini-cloud", category: "objectif", theme: "pmf", label: "Migration cloud", order: 8 },
  { id: "omap-ini-security", category: "objectif", theme: "urgence", label: "Programme cybersécurité", order: 9 },
  { id: "omap-ini-mna", category: "objectif", theme: "urgence", label: "Intégration post-M&A", order: 10 },
  { id: "omap-ini-erp", category: "objectif", theme: "processus", label: "Refonte ERP / SI", order: 11 },
  { id: "omap-ini-cost-program", category: "objectif", theme: "budget", label: "Programme de réduction de coûts", order: 12 },

  // —— Menaces (freins externes)
  { id: "omap-th-comp-active", category: "initiatives", theme: "competition", label: "Concurrent actif en course", order: 1 },
  { id: "omap-th-comp-incumbent", category: "initiatives", theme: "competition", label: "Incumbent difficile à déloger", order: 2 },
  { id: "omap-th-rfp", category: "initiatives", theme: "processus", label: "RFP / appel d’offres contraignant", order: 3 },
  { id: "omap-th-delay", category: "initiatives", theme: "urgence", label: "Risque d’ajournement / no-decision", order: 4 },
  { id: "omap-th-budget-cut", category: "initiatives", theme: "budget", label: "Coupe budgétaire / freeze", order: 5 },
  { id: "omap-th-reorg", category: "initiatives", theme: "stakeholders", label: "Réorg / changement de décideurs", order: 6 },
  { id: "omap-th-legal", category: "initiatives", theme: "contrats", label: "Blocage legal / procurement", order: 7 },
  { id: "omap-th-window", category: "initiatives", theme: "urgence", label: "Fenêtre d’opportunité qui se ferme", order: 8 },

  // 1. STAKEHOLDERS — positifs
  { id: "omap-sp-stake-champion", category: "signaux_positifs", theme: "stakeholders", label: "Champion identifié et engagé", order: 1 },
  { id: "omap-sp-stake-clevel", category: "signaux_positifs", theme: "stakeholders", label: "Sponsor C-level impliqué", order: 2 },
  { id: "omap-sp-stake-consensus", category: "signaux_positifs", theme: "stakeholders", label: "Consensus entre décideurs", order: 3 },
  { id: "omap-sp-stake-trust", category: "signaux_positifs", theme: "stakeholders", label: "Relation de confiance établie", order: 4 },
  // 1. STAKEHOLDERS — risques
  { id: "omap-ri-stake-real", category: "risques", theme: "stakeholders", label: "Qui sont les décideurs réels ?", order: 1 },
  { id: "omap-ri-stake-blockers", category: "risques", theme: "stakeholders", label: "Y a-t-il des bloqueurs cachés ?", order: 2 },
  { id: "omap-ri-stake-power", category: "risques", theme: "stakeholders", label: "La personne de contact a-t-elle le pouvoir ?", order: 3 },
  { id: "omap-ri-stake-align", category: "risques", theme: "stakeholders", label: "Les stakeholders clés sont-ils alignés ?", order: 4 },

  // 2. BUDGET — positifs
  { id: "omap-sp-bud-reserved", category: "signaux_positifs", theme: "budget", label: "Budget déjà prévu / réservé", order: 1 },
  { id: "omap-sp-bud-envelope", category: "signaux_positifs", theme: "budget", label: "Enveloppe financière confirmée", order: 2 },
  { id: "omap-sp-bud-process", category: "signaux_positifs", theme: "budget", label: "Processus d’approbation budgétaire clair", order: 3 },
  { id: "omap-sp-bud-noconstraint", category: "signaux_positifs", theme: "budget", label: "Pas de contraintes financières connues", order: 4 },
  // 2. BUDGET — risques
  { id: "omap-ri-bud-source", category: "risques", theme: "budget", label: "D’où vient le budget exactement ?", order: 1 },
  { id: "omap-ri-bud-priorities", category: "risques", theme: "budget", label: "Y a-t-il d’autres priorités concurrentes ?", order: 2 },
  { id: "omap-ri-bud-survive", category: "risques", theme: "budget", label: "Le budget survivra-t-il aux changements organisationnels ?", order: 3 },
  { id: "omap-ri-bud-approval", category: "risques", theme: "budget", label: "Quel est le processus d’approbation / signature ?", order: 4 },

  // 3. BESOIN — positifs
  { id: "omap-sp-need-clear", category: "signaux_positifs", theme: "besoin", label: "Problème clairement articulé par le client", order: 1 },
  { id: "omap-sp-need-urgency", category: "signaux_positifs", theme: "besoin", label: "Urgence / coût de l’inaction évident", order: 2 },
  { id: "omap-sp-need-aligned", category: "signaux_positifs", theme: "besoin", label: "Solution alignée avec leurs priorités", order: 3 },
  { id: "omap-sp-need-roi", category: "signaux_positifs", theme: "besoin", label: "ROI quantifiable pour eux", order: 4 },
  // 3. BESOIN — risques
  { id: "omap-ri-need-pain", category: "risques", theme: "besoin", label: "Le besoin est-il vraiment douloureux pour eux ?", order: 1 },
  { id: "omap-ri-need-hammer", category: "risques", theme: "besoin", label: "Ou c’est une solution en quête de problème ?", order: 2 },
  { id: "omap-ri-need-hyp", category: "risques", theme: "besoin", label: "Nos hypothèses sur leurs pain points sont-elles validées ?", order: 3 },
  { id: "omap-ri-need-alts", category: "risques", theme: "besoin", label: "Y a-t-il d’autres solutions qu’ils considèrent ?", order: 4 },

  // 4. COMPÉTITION — positifs
  { id: "omap-sp-comp-none", category: "signaux_positifs", theme: "competition", label: "Pas de concurrent connu en course", order: 1 },
  { id: "omap-sp-comp-diff", category: "signaux_positifs", theme: "competition", label: "Position différenciée / avantage clair", order: 2 },
  { id: "omap-sp-comp-first", category: "signaux_positifs", theme: "competition", label: "Nous sommes « first mover » / top of mind", order: 3 },
  { id: "omap-sp-comp-prefer", category: "signaux_positifs", theme: "competition", label: "Ils nous préfèrent déjà à la concurrence", order: 4 },
  // 4. COMPÉTITION — risques
  { id: "omap-ri-comp-who", category: "risques", theme: "competition", label: "Qui d’autre est en train de pitcher ?", order: 1 },
  { id: "omap-ri-comp-perception", category: "risques", theme: "competition", label: "Quelle est la perception concurrentielle ?", order: 2 },
  { id: "omap-ri-comp-open", category: "risques", theme: "competition", label: "Leur processus est-il vraiment ouvert à nous ?", order: 3 },
  { id: "omap-ri-comp-beauty", category: "risques", theme: "competition", label: "Risque de « beauty contest » ?", order: 4 },

  // 5. PROCESSUS — positifs
  { id: "omap-sp-proc-timeline", category: "signaux_positifs", theme: "processus", label: "Timeline clair et validé", order: 1 },
  { id: "omap-sp-proc-steps", category: "signaux_positifs", theme: "processus", label: "Étapes d’achat bien définies", order: 2 },
  { id: "omap-sp-proc-criteria", category: "signaux_positifs", theme: "processus", label: "Nous connaissons les critères d’évaluation", order: 3 },
  { id: "omap-sp-proc-fast", category: "signaux_positifs", theme: "processus", label: "Processus accéléré / pas de bureaucratie", order: 4 },
  { id: "omap-sp-proc-bought", category: "signaux_positifs", theme: "processus", label: "Client a déjà acheté ce type de solution", order: 5 },
  // 5. PROCESSUS — risques
  { id: "omap-ri-proc-timeline", category: "risques", theme: "processus", label: "Quel est le vrai timeline ?", order: 1 },
  { id: "omap-ri-proc-steps", category: "risques", theme: "processus", label: "Combien d’étapes d’approbation réelles ?", order: 2 },
  { id: "omap-ri-proc-delay", category: "risques", theme: "processus", label: "Risque de « on va réfléchir » / ajournement ?", order: 3 },
  { id: "omap-ri-proc-rfp", category: "risques", theme: "processus", label: "Processus RFP / appel d’offres ?", order: 4 },
  { id: "omap-ri-proc-speed", category: "risques", theme: "processus", label: "Qui contrôle vraiment la vitesse ?", order: 5 },

  // 6. PMF — positifs
  { id: "omap-sp-pmf-fit", category: "signaux_positifs", theme: "pmf", label: "Notre solution répond précisément à leurs besoins", order: 1 },
  { id: "omap-sp-pmf-nocustom", category: "signaux_positifs", theme: "pmf", label: "Pas de customization majeure requise", order: 2 },
  { id: "omap-sp-pmf-integ", category: "signaux_positifs", theme: "pmf", label: "Intégration technique faisable", order: 3 },
  { id: "omap-sp-pmf-refs", category: "signaux_positifs", theme: "pmf", label: "Références clients similaires concluantes", order: 4 },
  // 6. PMF — risques
  { id: "omap-ri-pmf-usecase", category: "risques", theme: "pmf", label: "Avons-nous vraiment compris leur use case ?", order: 1 },
  { id: "omap-ri-pmf-gaps", category: "risques", theme: "pmf", label: "Quels sont les gaps potentiels ?", order: 2 },
  { id: "omap-ri-pmf-impl", category: "risques", theme: "pmf", label: "Risques d’implémentation technique ?", order: 3 },
  { id: "omap-ri-pmf-support", category: "risques", theme: "pmf", label: "Qui va supporter la solution côté client ?", order: 4 },

  // 7. RELATION — positifs
  { id: "omap-sp-rel-long", category: "signaux_positifs", theme: "relation", label: "Relation établie depuis longtemps", order: 1 },
  { id: "omap-sp-rel-industry", category: "signaux_positifs", theme: "relation", label: "Références clients dans leur industrie", order: 2 },
  { id: "omap-sp-rel-brand", category: "signaux_positifs", theme: "relation", label: "Réputation / brand recognition positive", order: 3 },
  { id: "omap-sp-rel-open", category: "signaux_positifs", theme: "relation", label: "Contact clé très ouvert à nous", order: 4 },
  // 7. RELATION — risques
  { id: "omap-ri-rel-unknown", category: "risques", theme: "relation", label: "Nous sommes inconnus pour eux ?", order: 1 },
  { id: "omap-ri-rel-bias", category: "risques", theme: "relation", label: "Risque de perception négative / préjugé ?", order: 2 },
  { id: "omap-ri-rel-refs", category: "risques", theme: "relation", label: "Avons-nous des références pertinentes ?", order: 3 },
  { id: "omap-ri-rel-viability", category: "risques", theme: "relation", label: "Craintes sur notre viabilité financière / produit ?", order: 4 },

  // 8. URGENCE — positifs
  { id: "omap-sp-urg-deadline", category: "signaux_positifs", theme: "urgence", label: "Deadline client ferme (déploiement, audit…)", order: 1 },
  { id: "omap-sp-urg-top", category: "signaux_positifs", theme: "urgence", label: "Initiative menée de haut / priorité claire", order: 2 },
  { id: "omap-sp-urg-window", category: "signaux_positifs", theme: "urgence", label: "Fenêtre d’opportunité (cycle budget)", order: 3 },
  { id: "omap-sp-urg-critical", category: "signaux_positifs", theme: "urgence", label: "Problème critique qui ralentit leur business", order: 4 },
  // 8. URGENCE — risques
  { id: "omap-ri-urg-whose", category: "risques", theme: "urgence", label: "L’urgence vient-elle du client ou de nous ?", order: 1 },
  { id: "omap-ri-urg-fade", category: "risques", theme: "urgence", label: "Risque que l’urgence disparaisse ?", order: 2 },
  { id: "omap-ri-urg-conflict", category: "risques", theme: "urgence", label: "Conflit avec d’autres projets chez eux ?", order: 3 },
  { id: "omap-ri-urg-window", category: "risques", theme: "urgence", label: "Window fermée — reste-t-il une opportunité ?", order: 4 },

  // 9. CONTRATS — positifs
  { id: "omap-sp-leg-template", category: "signaux_positifs", theme: "contrats", label: "Template standard simple", order: 1 },
  { id: "omap-sp-leg-noclause", category: "signaux_positifs", theme: "contrats", label: "Pas de clause problématique connue", order: 2 },
  { id: "omap-sp-leg-predict", category: "signaux_positifs", theme: "contrats", label: "Processus legal prévisible", order: 3 },
  { id: "omap-sp-leg-terms", category: "signaux_positifs", theme: "contrats", label: "Deal terms clairs et acceptables", order: 4 },
  // 9. CONTRATS — risques
  { id: "omap-ri-leg-clauses", category: "risques", theme: "contrats", label: "Quelles sont les clauses non-standard ?", order: 1 },
  { id: "omap-ri-leg-risks", category: "risques", theme: "contrats", label: "Risques légaux / contractuels identifiés ?", order: 2 },
  { id: "omap-ri-leg-payment", category: "risques", theme: "contrats", label: "Leurs termes de paiement / conditions ?", order: 3 },
  { id: "omap-ri-leg-who", category: "risques", theme: "contrats", label: "Qui approuve côté legal chez eux ?", order: 4 },
];

export function buildDefaultOppMappingSubtypes(): OppMappingSubtypeDef[] {
  return LIB.map((item) => ({
    id: item.id,
    category: item.category,
    label: item.label,
    theme: item.theme,
    active: true,
    order: item.order,
    bonus: 1,
    malus: 1,
    required: false,
  }));
}

function clampMappingWeight(raw: unknown, fallback = 1): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(10, Math.round(n * 100) / 100);
}

/** Migre anciennes catégories et fusionne les cartes manquantes de la librairie. */
export function normalizeOppMappingSubtypes(
  raw: OppMappingSubtypeDef[] | undefined,
): OppMappingSubtypeDef[] {
  const defaults = buildDefaultOppMappingSubtypes();
  if (!Array.isArray(raw) || raw.length === 0) {
    return structuredClone(defaults);
  }

  const migrated: OppMappingSubtypeDef[] = raw.map((s, i) => {
    const category =
      (s.category as string) === "pressions"
        ? ("risques" as const)
        : s.category === "signaux_positifs" ||
            s.category === "risques" ||
            s.category === "objectif" ||
            s.category === "initiatives"
          ? s.category
          : ("objectif" as const);
    return {
      id: s.id || `omap-${i + 1}`,
      category,
      label: s.label ?? "",
      theme: s.theme ?? "custom",
      active: s.active !== false,
      order: s.order ?? i + 1,
      bonus: clampMappingWeight(s.bonus, 1),
      malus: clampMappingWeight(s.malus, 1),
      required: s.required === true,
    };
  });

  const byId = new Map(migrated.map((s) => [s.id, s] as const));
  for (const d of defaults) {
    if (!byId.has(d.id)) {
      const copy = structuredClone(d);
      migrated.push(copy);
      byId.set(d.id, copy);
    } else {
      const cur = byId.get(d.id)!;
      cur.category = d.category;
      cur.label = d.label;
      if (!cur.theme) cur.theme = d.theme ?? "custom";
      if (cur.active !== false) cur.active = true;
      if (cur.bonus == null) cur.bonus = 1;
      if (cur.malus == null) cur.malus = 1;
      if (cur.required == null) cur.required = false;
    }
  }

  return migrated;
}
