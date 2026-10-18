/**
 * Modèles sectoriels — VARIABLES par secteur.
 *
 * Architecture (décision du fondateur, 18 oct. 2026) :
 * - la majorité du comportement vient de PATTERNS communs à tous les secteurs
 *   (meetingPatterns.ts : problème, décideurs, budget, mode d'achat, revue,
 *   signature…) ;
 * - chaque secteur client ne fournit que des VARIABLES qui ajustent ces
 *   patterns (qui peut dire non, quelle revue, quelle procédure d'achat…) ;
 * - le profil vendeur (ce que le commercial vend) ajoute ses objections.
 *
 * Niveau de preuve : les règles marquées « source » sont sourcées et datées ;
 * le reste est une hypothèse, ajustée par le fondateur selon les retours clients.
 * Miroir lisible : cerveau DBR, notes secteur-* et projet-modeles-sectoriels.
 */

import type { BlockerFactorId } from "./blockerFactors";

export type MeetingTypeId = "R1" | "R2" | "R3" | "R4";

export type MeetingTypeDef = {
  id: MeetingTypeId;
  label: string;
  /** Ce que le commercial doit obtenir à la fin du rendez-vous. */
  goal: string;
};

export const MEETING_TYPES: readonly MeetingTypeDef[] = [
  { id: "R1", label: "Découverte", goal: "Le problème, son coût, qui décide, la prochaine étape datée" },
  { id: "R2", label: "Démonstration", goal: "Un cas d'usage validé par ceux qui l'utiliseront" },
  { id: "R3", label: "Revue sécurité et conformité", goal: "La liste des exigences et le chemin pour les remplir" },
  { id: "R4", label: "Achats et contrat", goal: "Le mode d'achat, le calendrier et le signataire" },
] as const;

export type RuleEvidence = "source" | "hypothese" | "a_verifier";

export type SectorRule = {
  text: string;
  evidence: RuleEvidence;
  source?: string;
  asOf: string;
};

/** Variables qui ajustent les patterns communs pour un secteur client. */
export type SectorVariables = {
  /** Désignation de l'organisation cliente (« la banque », « la collectivité »). */
  org: string;
  /** Rôles qui peuvent dire non (cités dans la question des décideurs). */
  vetoRoles: string;
  /** Comment le budget se décide. */
  budget: string;
  /** Risque si le budget n'existe pas. */
  budgetRisk: string;
  /** Comment ce secteur achète (citée dans la question du mode d'achat). */
  procurement: string;
  /** Réponse quand le mode d'achat bloque. */
  procurementRisk: string;
  /** Action qui traite ce risque. */
  procurementAction: string;
  /** Contrainte de démonstration. */
  demo: string;
  /** Sensibilité des données. */
  data: string;
  /** Nom de la revue obligatoire (R3). */
  review: string;
  /** Pièces exigées pendant cette revue. */
  reviewProof: string;
  /** Circuit de signature. */
  signature: string;
  /** Délai qui s'ajoute au cycle. */
  delay: string;
};

export type ClientSectorModel = {
  id: string;
  label: string;
  keyInsight: string;
  committee: string[];
  veto: string[];
  rules: SectorRule[];
  vars: SectorVariables;
  /** Interlocuteur type par rendez-vous. */
  interlocutors: Record<MeetingTypeId, string>;
  /** Facteurs de blocage les plus fréquents dans ce secteur (hypothèse). */
  likelyBlockers: BlockerFactorId[];
  /**
   * Complexité de base du secteur (1 à 3), selon le nombre de passages
   * obligatoires (hypothèse). La couche grands groupes ne s'en sert pas.
   */
  complexityBase: number;
  /** Couche transverse (grands groupes) : s'ajoute au secteur du client. */
  overlay?: boolean;
};

export type SellerProfile = {
  id: string;
  label: string;
  offer: string;
  objections: string[];
  proofs: string[];
  purchase: string[];
  byMeeting: Record<MeetingTypeId, string[]>;
  /** Facteurs de blocage fréquents pour ce type d'offre (hypothèse). */
  likelyBlockers: BlockerFactorId[];
  /** Facteur que l'objection typique de ce profil met en jeu. */
  objectionFactor: BlockerFactorId;
};

const AS_OF = "2026-10-18";

const SRC = {
  dora: "https://www.legiscope.com/blog/dora-prestataires-tic-tierce-partie.html",
  seuils:
    "https://www.marche-public.fr/contrats-publics/CCP-publication-nouveaux-seuils-2026.htm",
  capeb:
    "https://www.capeb.fr/actualites/marches-publics-2026-nouveaux-seuils-et-simplification-pour-les-marches-de-travaux",
  dgos: "https://www.omedit-grand-est.ars.sante.fr/index.php/media/20012/download",
  nis2: "https://www.openkritis.de/eu/eu-nis-2-france.html",
  gartnerNoDecision: "https://www.mediafly.com/?p=55393",
  gartnerConflict: "https://www.geisheker.com/?p=33060",
} as const;

const NIS2_RULE: SectorRule = {
  text: "Secteur visé par NIS2 (entités essentielles) ; loi française de transposition non promulguée à l'été 2026 — ne pas présenter l'obligation comme en vigueur en France sans vérification.",
  evidence: "a_verifier",
  source: SRC.nis2,
  asOf: AS_OF,
};

export const CLIENT_SECTOR_MODELS: readonly ClientSectorModel[] = [
  {
    id: "banque-assurance",
    label: "Banque, assurance",
    keyInsight:
      "Le deal se joue en revue risques : les risques TIC et la conformité ont un droit de veto, cadré par DORA.",
    committee: ["Sponsor métier", "DSI", "Risques TIC ou RSSI", "Conformité", "Juridique", "Achats"],
    veto: ["Risques TIC", "Conformité"],
    rules: [
      {
        text: "DORA : due diligence avant contrat, registre d'informations de tous les contrats TIC (art. 28.3), clauses contractuelles obligatoires (art. 30), stratégie de sortie ; exigences renforcées pour une fonction critique ou importante ; clauses contrôlées par l'ACPR et l'AMF.",
        evidence: "source",
        source: SRC.dora,
        asOf: AS_OF,
      },
    ],
    vars: {
      org: "la banque",
      vetoRoles: "les risques TIC, la conformité, les achats",
      budget: "le budget annuel de la direction métier",
      budgetRisk: "Ce n'est pas budgété cette année, il faudrait le défendre au prochain arbitrage.",
      procurement: "référencement fournisseur, puis contrat avec les clauses DORA",
      procurementRisk: "Vous n'êtes pas référencés chez nous : rien ne peut être commandé avant.",
      procurementAction: "lancer le référencement fournisseur tout de suite",
      demo: "Pas de données réelles en démonstration : un jeu fictif.",
      data: "des données clients et bancaires",
      review: "la revue risques TIC et conformité (DORA)",
      reviewProof: "notre questionnaire de due diligence et l'avenant DORA (audit, sous-traitance, sortie)",
      signature: "un comité d'engagement au-delà d'un certain montant",
      delay: "le délai de due diligence et de référencement",
    },
    interlocutors: {
      R1: "Directeur métier (sponsor)",
      R2: "Sponsor et deux futurs utilisateurs",
      R3: "Responsable des risques TIC",
      R4: "Acheteur",
    },
    likelyBlockers: ["conformite", "decideur", "achats"],
    complexityBase: 3,
  },
  {
    id: "public",
    label: "Secteur public (État, collectivités)",
    keyInsight:
      "Le deal se gagne avant la consultation : une fois la procédure lancée, l'égalité entre candidats encadre chaque échange.",
    committee: ["Service prescripteur", "DSI", "Acheteur public", "Contrôle juridique", "Élu ou direction générale"],
    veto: ["Acheteur (procédure)", "Budget voté"],
    rules: [
      {
        text: "2026-2027, fournitures et services : procédure formalisée dès 140 000 € HT (État) et 216 000 € HT (collectivités).",
        evidence: "source",
        source: SRC.seuils,
        asOf: AS_OF,
      },
      {
        text: "Dispense de publicité et de mise en concurrence jusqu'à 60 000 € HT depuis le 1er avril 2026 ; publicité obligatoire dès 90 000 € ; découper un besoin pour rester sous un seuil est interdit.",
        evidence: "source",
        source: SRC.capeb,
        asOf: AS_OF,
      },
      {
        text: "Sourçage : l'acheteur peut consulter les entreprises avant la procédure ; le vendeur informe sans rédiger le cahier des charges.",
        evidence: "source",
        asOf: AS_OF,
      },
      NIS2_RULE,
    ],
    vars: {
      org: "la collectivité",
      vetoRoles: "l'acheteur public, le contrôle juridique, les élus",
      budget: "le budget voté par l'assemblée",
      budgetRisk: "Ce n'est pas inscrit au budget voté : rien avant le prochain cycle budgétaire.",
      procurement: "selon le montant : achat direct jusqu'à 60 000 € HT, procédure adaptée, puis appel d'offres au-delà des seuils européens ; ou via une centrale d'achat",
      procurementRisk: "On passe par une centrale d'achat où vous n'êtes pas référencés.",
      procurementAction: "identifier la centrale et la date de sa prochaine consultation",
      demo: "Avant la consultation, une démonstration d'information, sans prix ni engagement.",
      data: "des données d'usagers",
      review: "l'avis de la DSI et du délégué à la protection des données",
      reviewProof: "les exigences d'hébergement et le contrat de sous-traitance RGPD",
      signature: "une décision de l'assemblée ou de l'exécutif selon le montant",
      delay: "la durée de la procédure de mise en concurrence",
    },
    interlocutors: {
      R1: "Chef du service prescripteur",
      R2: "Prescripteur et futurs utilisateurs",
      R3: "DSI de la collectivité",
      R4: "Acheteur public",
    },
    likelyBlockers: ["budget", "achats", "priorites"],
    complexityBase: 2,
  },
  {
    id: "sante-publique",
    label: "Santé publique (hôpitaux, GHT)",
    keyInsight:
      "Le premier tri est le niveau d'achat : établissement, GHT ou centrale nationale.",
    committee: ["Porteur métier ou soignant", "DSI du GHT", "Achats du GHT", "RSSI", "Délégué à la protection des données"],
    veto: ["Achats du GHT", "Sécurité"],
    rules: [
      {
        text: "Commande publique : procédure formalisée dès 216 000 € HT pour les hôpitaux (2026-2027).",
        evidence: "source",
        source: SRC.seuils,
        asOf: AS_OF,
      },
      {
        text: "Achats mutualisés au sein des GHT ; opérateurs nationaux Ugap, UniHA, Resah (centrale du Resah réservée à ses adhérents).",
        evidence: "source",
        source: SRC.dgos,
        asOf: AS_OF,
      },
      {
        text: "Hébergement de données de santé : hébergeur certifié HDS obligatoire (code de la santé publique).",
        evidence: "source",
        asOf: AS_OF,
      },
      NIS2_RULE,
    ],
    vars: {
      org: "l'établissement",
      vetoRoles: "la direction des achats du GHT, la DSI, la sécurité",
      budget: "le plan d'investissement du GHT",
      budgetRisk: "Ce n'est pas dans le plan du GHT cette année.",
      procurement: "au niveau du GHT, souvent via une centrale (Ugap, UniHA, Resah), sinon par consultation",
      procurementRisk: "On achète ce type de solution via une centrale où vous n'êtes pas référencés.",
      procurementAction: "identifier la centrale et sa prochaine consultation",
      demo: "Les équipes ont très peu de temps : une démonstration courte, sur leur cas.",
      data: "des données de santé (hébergement HDS si elles sont hébergées)",
      review: "l'avis du RSSI et du délégué à la protection des données du GHT",
      reviewProof: "la certification HDS de l'hébergeur, l'analyse de risques et le contrat de sous-traitance",
      signature: "la direction du GHT après avis des achats",
      delay: "la consultation du GHT ou de la centrale",
    },
    interlocutors: {
      R1: "Porteur du projet à l'hôpital",
      R2: "Cadre de santé et équipe utilisatrice",
      R3: "RSSI du GHT",
      R4: "Direction des achats du GHT",
    },
    likelyBlockers: ["achats", "capacite", "conformite"],
    complexityBase: 3,
  },
  {
    id: "energie-eau-transports",
    label: "Énergie, eau, transports",
    keyInsight:
      "Si l'achat touche une activité de réseau et un système critique, la cybersécurité décide.",
    committee: ["Direction exploitation", "DSI", "Cybersécurité", "Achats", "Juridique"],
    veto: ["Cybersécurité", "Achats"],
    rules: [
      {
        text: "Entités adjudicatrices (réseaux d'énergie, d'eau, de transport) : commande publique pour ces activités, procédure formalisée dès 432 000 € HT en 2026-2027.",
        evidence: "source",
        source: SRC.seuils,
        asOf: AS_OF,
      },
      NIS2_RULE,
    ],
    vars: {
      org: "l'opérateur",
      vetoRoles: "la cybersécurité, les achats, l'exploitation",
      budget: "le budget d'exploitation ou d'investissement du réseau",
      budgetRisk: "Il faudrait l'inscrire au prochain plan d'investissement.",
      procurement: "règles d'entité adjudicatrice pour les activités de réseau (procédure formalisée au-delà de 432 000 € HT), avec qualification des fournisseurs",
      procurementRisk: "Il faut d'abord être qualifié comme fournisseur chez nous.",
      procurementAction: "lancer la qualification fournisseur",
      demo: "Pas de connexion à nos installations pendant une démonstration.",
      data: "des données d'installations critiques",
      review: "la revue cybersécurité",
      reviewProof: "notre référentiel de sécurité fournisseurs et les clauses de notification d'incident",
      signature: "la direction des achats après avis cyber",
      delay: "la qualification fournisseur et la revue cyber",
    },
    interlocutors: {
      R1: "Directeur d'exploitation",
      R2: "Équipe d'exploitation",
      R3: "Responsable cybersécurité",
      R4: "Acheteur",
    },
    likelyBlockers: ["conformite", "achats", "capacite"],
    complexityBase: 2,
  },
  {
    id: "industrie",
    label: "Industrie",
    keyInsight:
      "L'usine porte le besoin, mais les achats centraux et le panel fournisseurs décident de qui peut vendre.",
    committee: ["Direction d'usine ou de BU", "Méthodes", "DSI", "Achats centraux", "Contrôle de gestion"],
    veto: ["Achats (panel fournisseurs)", "DSI"],
    rules: [
      {
        text: "Délai de paiement entre entreprises plafonné par le code de commerce.",
        evidence: "source",
        asOf: AS_OF,
      },
      {
        text: "Certains sous-secteurs de la fabrication sont visés par NIS2 : périmètre exact à vérifier.",
        evidence: "a_verifier",
        asOf: AS_OF,
      },
    ],
    vars: {
      org: "l'usine",
      vetoRoles: "les achats centraux, la DSI, le contrôle de gestion",
      budget: "le budget de l'usine ou un programme du groupe",
      budgetRisk: "C'est un programme du groupe : la décision se prend au siège.",
      procurement: "panel fournisseurs géré par les achats centraux, appel d'offres au-delà d'un seuil interne",
      procurementRisk: "Vous n'êtes pas au panel fournisseurs : rien ne peut être commandé avant.",
      procurementAction: "demander l'entrée au panel aux achats centraux",
      demo: "On veut le voir sur une ligne ou un site pilote.",
      data: "des données de production",
      review: "la revue de la DSI (informatique de gestion ou réseau industriel)",
      reviewProof: "le questionnaire sécurité et la liste des intégrations",
      signature: "les achats centraux, avec un comité au-delà d'un seuil",
      delay: "l'entrée au panel fournisseurs",
    },
    interlocutors: {
      R1: "Directeur d'usine",
      R2: "Responsable méthodes et équipe terrain",
      R3: "DSI",
      R4: "Acheteur central",
    },
    likelyBlockers: ["achats", "budget", "influence"],
    complexityBase: 2,
  },
  {
    id: "generique",
    label: "Autre secteur (générique)",
    keyInsight:
      "Sans variables dédiées : problème, comité, revues obligatoires et circuit d'achat.",
    committee: ["Sponsor métier", "Utilisateurs", "DSI ou sécurité", "Achats", "Direction financière"],
    veto: ["Achats", "DSI ou sécurité"],
    rules: [
      {
        text: "Modèle générique : uniquement des hypothèses.",
        evidence: "hypothese",
        asOf: AS_OF,
      },
    ],
    vars: {
      org: "l'entreprise",
      vetoRoles: "les achats, la DSI, la direction financière",
      budget: "le budget annuel du service",
      budgetRisk: "Ce n'est pas budgété cette année.",
      procurement: "consultation de plusieurs fournisseurs par les achats",
      procurementRisk: "Les achats exigent un référencement fournisseur préalable.",
      procurementAction: "lancer le référencement",
      demo: "On veut le voir sur un cas réel.",
      data: "des données internes",
      review: "la revue de la DSI et de la sécurité",
      reviewProof: "le questionnaire sécurité",
      signature: "la direction financière au-delà d'un seuil",
      delay: "le référencement et la revue sécurité",
    },
    interlocutors: {
      R1: "Directeur métier (sponsor)",
      R2: "Sponsor et utilisateurs",
      R3: "Responsable sécurité",
      R4: "Acheteur",
    },
    likelyBlockers: ["valeur", "statu-quo", "decideur"],
    complexityBase: 1,
  },
  {
    id: "grands-groupes",
    label: "Grands groupes multi-filiales",
    overlay: true,
    keyInsight:
      "Le contact est dans une filiale ; le budget, le référencement et le veto sont souvent ailleurs dans le groupe.",
    committee: ["Sponsor en filiale", "Direction métier groupe", "Achats groupe", "DSI groupe", "Direction financière de la filiale qui paie"],
    veto: ["Achats groupe", "DSI groupe"],
    rules: [
      {
        text: "Environ 40 % des parcours d'achat B2B finissent sans décision (Gartner) — repère général.",
        evidence: "source",
        source: SRC.gartnerNoDecision,
        asOf: AS_OF,
      },
      {
        text: "74 % des groupes d'achat B2B vivent un conflit interne nuisible pendant la décision (Gartner, mai 2025).",
        evidence: "source",
        source: SRC.gartnerConflict,
        asOf: AS_OF,
      },
    ],
    vars: {
      org: "la filiale",
      vetoRoles: "les achats groupe, la DSI groupe",
      budget: "le budget de la filiale ou du groupe",
      budgetRisk: "C'est le groupe qui paie, pas nous.",
      procurement: "accord-cadre ou référencement groupe",
      procurementRisk: "Le groupe a un accord-cadre avec un autre fournisseur.",
      procurementAction: "demander la date de renouvellement de l'accord et les exceptions",
      demo: "Il faudrait que le groupe la voie aussi.",
      data: "des données de plusieurs entités",
      review: "la revue sécurité du groupe",
      reviewProof: "le questionnaire groupe",
      signature: "la filiale, le groupe, ou les deux",
      delay: "le référencement groupe",
    },
    interlocutors: {
      R1: "Sponsor en filiale",
      R2: "Filiale et représentant du groupe",
      R3: "Sécurité groupe",
      R4: "Achats groupe",
    },
    likelyBlockers: ["consensus", "decideur", "achats"],
    complexityBase: 0,
  },
];

export const SELLER_PROFILES: readonly SellerProfile[] = [
  {
    id: "editeur-saas",
    label: "Éditeur SaaS",
    offer: "un logiciel en abonnement",
    objections: [
      "Où sont hébergées nos données, et par qui ?",
      "Comment récupère-t-on nos données si on arrête ?",
      "Encore un outil de plus : comment s'intègre-t-il à l'existant ?",
    ],
    proofs: ["Essai ou pilote sur un cas réel", "Documentation sécurité et hébergement", "Références comparables"],
    purchase: ["durée d'engagement", "nombre de licences", "réversibilité des données"],
    byMeeting: {
      R1: ["Quel outil ou quelle habitude l'abonnement remplace-t-il ?"],
      R2: ["Proposer un essai ou un pilote borné dans le temps"],
      R3: ["Hébergement, sous-traitants, réversibilité, intégration au SI"],
      R4: ["Durée d'engagement, licences, conditions de sortie"],
    },
    likelyBlockers: ["conformite", "capacite", "concurrence"],
    objectionFactor: "conformite",
  },
  {
    id: "esn-integrateur",
    label: "ESN, intégrateur",
    offer: "des jours de consultants ou un projet d'intégration",
    objections: [
      "Vos taux journaliers sont au-dessus de nos autres prestataires.",
      "Qui exactement sera sur le projet, et quand ?",
      "Régie ou forfait : qui porte le risque si ça dérape ?",
    ],
    proofs: ["CV et disponibilité des consultants", "Références de projets similaires", "Méthode et engagements de livraison"],
    purchase: ["référencement prestataire", "mode régie ou forfait", "taux journaliers"],
    byMeeting: {
      R1: ["Le besoin est-il un projet (forfait) ou du renfort (régie) ?"],
      R2: ["Présenter l'équipe proposée et la méthode"],
      R3: ["Accès des consultants au SI, sous-traitance, confidentialité"],
      R4: ["Taux journaliers, mode de facturation, référencement prestataire"],
    },
    likelyBlockers: ["concurrence", "achats", "valeur"],
    objectionFactor: "concurrence",
  },
  {
    id: "conseil",
    label: "Cabinet de conseil",
    offer: "une mission de conseil",
    objections: [
      "Qu'apportez-vous que nos équipes internes ne savent pas faire ?",
      "Comment mesure-t-on le résultat de la mission ?",
      "Avez-vous déjà fait cela dans une organisation comme la nôtre ?",
    ],
    proofs: ["Références comparables", "Livrables et jalons détaillés", "Expérience du secteur"],
    purchase: ["achats de prestations intellectuelles", "livrables, jalons et recette"],
    byMeeting: {
      R1: ["Qui en direction générale porte la mission ?"],
      R2: ["Présenter la démarche et un livrable type"],
      R3: ["Confidentialité, accès aux données"],
      R4: ["Forfait par jalon, conditions de recette"],
    },
    likelyBlockers: ["valeur", "decideur", "statu-quo"],
    objectionFactor: "valeur",
  },
  {
    id: "fabricant",
    label: "Fabricant, équipementier",
    offer: "des équipements ou des produits industriels",
    objections: [
      "Votre produit répond-il exactement à notre cahier des charges technique ?",
      "Quels délais de livraison et de mise en service ?",
      "Qui assure la maintenance et les pièces ?",
    ],
    proofs: ["Essais et qualification produit", "Certifications techniques", "Références d'installations"],
    purchase: ["cahier des charges technique", "délais de livraison", "garantie et maintenance"],
    byMeeting: {
      R1: ["Quel cahier des charges technique existe déjà ?"],
      R2: ["Essai, visite d'installation ou échantillon"],
      R3: ["Conformité technique et sécurité de l'équipement"],
      R4: ["Délais, garantie, contrat de maintenance"],
    },
    likelyBlockers: ["concurrence", "achats", "budget"],
    objectionFactor: "concurrence",
  },
  {
    id: "services-recurrents",
    label: "Services récurrents",
    offer: "un service récurrent sous contrat-cadre",
    objections: [
      "Le prestataire actuel fait l'affaire, pourquoi changer ?",
      "Comment se passe la transition sans interruption de service ?",
      "Quels niveaux de service et quelles pénalités ?",
    ],
    proofs: ["Plan de transition", "Niveaux de service mesurés", "Références comparables"],
    purchase: ["contrat-cadre", "niveaux de service et pénalités", "fin du contrat en place"],
    byMeeting: {
      R1: ["Quand se termine le contrat du prestataire en place ?"],
      R2: ["Montrer le plan de transition"],
      R3: ["Accès aux sites et aux données, continuité de service"],
      R4: ["Durée du contrat-cadre, niveaux de service, pénalités"],
    },
    likelyBlockers: ["statu-quo", "concurrence", "achats"],
    objectionFactor: "statu-quo",
  },
];

export function getClientSectorModel(id: string | null | undefined): ClientSectorModel | null {
  if (!id) return null;
  return CLIENT_SECTOR_MODELS.find((m) => m.id === id) ?? null;
}

export function getSellerProfile(id: string | null | undefined): SellerProfile | null {
  if (!id) return null;
  return SELLER_PROFILES.find((p) => p.id === id) ?? null;
}

export function getMeetingType(id: string | null | undefined): MeetingTypeDef | null {
  if (!id) return null;
  return MEETING_TYPES.find((m) => m.id === id) ?? null;
}

/** Secteurs clients proposés au choix (hors couche transverse). */
export function selectableClientSectors(): ClientSectorModel[] {
  return CLIENT_SECTOR_MODELS.filter((m) => !m.overlay);
}

/** Famille / sous-secteur du chatbot (dealReviewSectors) → modèle client. */
export function clientModelIdFromDealReviewSector(
  sectorId: string | null | undefined,
  subSectorId?: string | null,
): string {
  switch (sectorId) {
    case "banque-assurance":
      return "banque-assurance";
    case "secteur-public":
      return "public";
    case "energie-utilities":
      return "energie-eau-transports";
    case "industrie-manufacturing":
      return "industrie";
    case "sante-pharma":
      return subSectorId === "etablissement-sante" ? "sante-publique" : "generique";
    default:
      return "generique";
  }
}

/* ------------------------------------------------------------------ */
/* Texte injecté dans le prompt de la revue (analyse, Pilotage)        */
/* ------------------------------------------------------------------ */

function evidenceLabel(e: RuleEvidence): string {
  if (e === "source") return "sourcé";
  if (e === "a_verifier") return "à vérifier";
  return "hypothèse";
}

function modelHeader(model: ClientSectorModel): string {
  const v = model.vars;
  return `## ${model.label}
${model.keyInsight}
Comité (hypothèse) : ${model.committee.join(", ")}.
Peut dire non : ${model.veto.join(", ")}.
Budget : ${v.budget}. Achat : ${v.procurement}. Revue obligatoire : ${v.review} (${v.reviewProof}). Signature : ${v.signature}. Délai à prévoir : ${v.delay}.
Règles :
${model.rules.map((r) => `- [${evidenceLabel(r.evidence)}, ${r.asOf}] ${r.text}`).join("\n")}`;
}

export type SectorContextInput = {
  clientSectorId: string | null | undefined;
  sellerProfileId: string | null | undefined;
  multiEntity?: boolean;
};

export function buildSectorReviewAddendum(input: SectorContextInput): string | null {
  const model = getClientSectorModel(input.clientSectorId);
  const seller = getSellerProfile(input.sellerProfileId);
  const overlay = input.multiEntity ? getClientSectorModel("grands-groupes") : null;
  if (!model && !seller && !overlay) return null;

  const parts: string[] = ["# Modèle sectoriel (analyse de l'opportunité)"];
  if (model) parts.push(modelHeader(model));
  if (overlay) parts.push(modelHeader(overlay));
  if (seller) {
    parts.push(`## Profil du vendeur : ${seller.label} (vend ${seller.offer})
Objections typiques : ${seller.objections.map((o) => `« ${o} »`).join(" ")}
Conditions d'achat propres : ${seller.purchase.join(", ")}.`);
  }
  parts.push(`## Comment t'en servir
- Compare le comité de <diagnostic> au comité attendu : nomme les rôles qui peuvent dire non et qui ne sont pas couverts, sans inventer de personne.
- Situe l'opportunité dans les rendez-vous R1 découverte, R2 démonstration, R3 revue, R4 achats, et signale le passage obligatoire suivant.
- Une règle « hypothèse » ou « à vérifier » se présente comme telle, jamais comme un fait.
- Les faits restent ceux de <diagnostic> et des réponses du commercial.`);
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Complexité du deal : secteur × taille du client × groupe            */
/* ------------------------------------------------------------------ */

export type ClientSizeId = "pme" | "eti" | "ge";

/** Catégories d'entreprises (loi de modernisation de l'économie, 2008). */
export const CLIENT_SIZES: readonly { id: ClientSizeId; label: string; detail: string; bonus: number }[] = [
  { id: "pme", label: "PME", detail: "moins de 250 salariés", bonus: 0 },
  { id: "eti", label: "ETI", detail: "250 à 4 999 salariés", bonus: 1 },
  { id: "ge", label: "Grande entreprise", detail: "5 000 salariés et plus", bonus: 2 },
];

export type ComplexityLevel = 1 | 2 | 3 | 4;

export const COMPLEXITY_LABELS: Record<ComplexityLevel, string> = {
  1: "Simple",
  2: "Standard",
  3: "Complexe",
  4: "Très complexe",
};

/** Tranche de taille de la fiche compte → catégorie (approximation). */
export function clientSizeFromAccountSize(size: string | null | undefined): ClientSizeId | null {
  switch (size) {
    case "1-1000":
      return "pme";
    case "1001-2500":
    case "2501-5000":
      return "eti";
    case "5001-10000":
    case "10000+":
      return "ge";
    default:
      return null;
  }
}

/**
 * Niveau de complexité (hypothèse) : base du secteur + bonus de taille
 * + 1 si le client est la filiale d'un groupe. Plus le niveau est haut,
 * plus le rendez-vous simulé compte de questions et de blocages.
 */
export function computeComplexity(input: {
  clientSectorId: string | null | undefined;
  clientSize: ClientSizeId | null | undefined;
  multiEntity?: boolean;
}): { level: ComplexityLevel; label: string; score: number } {
  const model = getClientSectorModel(input.clientSectorId) ?? getClientSectorModel("generique")!;
  const bonus = CLIENT_SIZES.find((c) => c.id === input.clientSize)?.bonus ?? 0;
  const score = model.complexityBase + bonus + (input.multiEntity ? 1 : 0);
  const level: ComplexityLevel = score <= 1 ? 1 : score === 2 ? 2 : score <= 4 ? 3 : 4;
  return { level, label: COMPLEXITY_LABELS[level], score };
}
