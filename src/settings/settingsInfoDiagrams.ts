import type { SettingsAreaId } from "./settingsNav";

/** Écran maquette affiché dans le dialogue Info. */
export type InfoScreenId =
  | "dashboard-risk"
  | "dashboard-kpi"
  | "contact-fiche"
  | "cartographie"
  | "entreprise-fiche"
  | "opp-header"
  | "opp-process"
  | "opp-mapping"
  | "opp-roi"
  | "opp-variables"
  | "opp-ai"
  | "account-plan"
  | "org-profile"
  | "whitespace"
  | "data-import"
  | "data-crm";

export type SettingsInfoScreen = {
  screen: InfoScreenId;
  /** Champ / zone / calcul / bloc IA à surligner dans la maquette. */
  highlight: string;
  /** Titre court au-dessus de la maquette. */
  label: string;
};

export type SettingsInfoDiagram = {
  title: string;
  /** Parcours en étapes lisibles. */
  path: string[];
  /** Explication courte : ce que fait cet input. */
  explanation: string;
  /** Une ou plusieurs copies d’écran avec le champ mis en valeur. */
  screens: SettingsInfoScreen[];
};

/** Clé fine : `area` ou `area:subId`. */
export function settingsInfoKey(
  area: SettingsAreaId,
  subId?: string | null,
): string {
  if (!subId || area === "org-parcours") return area;
  return `${area}:${subId}`;
}

function info(
  title: string,
  path: string[],
  explanation: string,
  screens: SettingsInfoScreen[],
): SettingsInfoDiagram {
  return { title, path, explanation, screens };
}

export const SETTINGS_INFO: Record<string, SettingsInfoDiagram> = {
  "org-parcours": info(
    "Parcours de démarrage",
    [
      "Ouvrir Settings → Parcours",
      "Suivre chaque étape",
      "Le CTA ouvre la zone Settings concernée",
    ],
    "Ce n’est pas un catalogue : c’est le fil d’Ariane pour configurer DBR dans le bon ordre.",
    [
      {
        screen: "org-profile",
        highlight: "path",
        label: "Exemple : étape « Qui vous êtes »",
      },
    ],
  ),

  "dashboard:risk": info(
    "Matrice des risques",
    [
      "Configurer les seuils ici (Settings → Dashboard)",
      "Sur chaque opportunité : répondre au Process + cocher le Mapping",
      "Le Dashboard place le deal sur la grille selon vos seuils",
    ],
    "Cet input ne crée pas les scores : il fixe les seuils bas/haut et les libellés d’axes. Les points colorés et les textes d’axes viennent de là.",
    [
      {
        screen: "opp-process",
        highlight: "score",
        label: "1. Score Process calculé sur l’opportunité",
      },
      {
        screen: "opp-mapping",
        highlight: "score",
        label: "2. Score Mapping calculé sur l’opportunité",
      },
      {
        screen: "dashboard-risk",
        highlight: "point+axes",
        label: "3. Dashboard — grille (seuils + libellés)",
      },
    ],
  ),

  "dashboard:kpi": info(
    "Règles KPI",
    [
      "Cocher ici ce qui entre dans CA installé / Cible",
      "Les montants viennent des ventes et opportunités",
      "Le Dashboard affiche les totaux selon vos cases",
    ],
    "Cet input définit le périmètre des cartes KPI — pas les montants saisis.",
    [
      {
        screen: "dashboard-kpi",
        highlight: "ca+cible",
        label: "Dashboard — cartes CA installé & Cible",
      },
    ],
  ),

  "contacts:contact-types": info(
    "Types de contacts",
    [
      "Créer les rôles ici (libellé + couleur)",
      "Choisir le type sur la fiche contact",
      "La Cartographie reprend pastille + légende",
    ],
    "Un seul catalogue : le champ Type sur la fiche et les pastilles de la carte.",
    [
      {
        screen: "contact-fiche",
        highlight: "type",
        label: "Fiche contact — champ Type",
      },
      {
        screen: "cartographie",
        highlight: "dot",
        label: "Cartographie — pastilles & légende",
      },
    ],
  ),

  "entreprises:sectors": info(
    "Secteurs",
    [
      "Définir les secteurs ici",
      "Les choisir sur la fiche entreprise",
      "Filtrer / comparer les peers (même secteur)",
    ],
    "Catalogue du champ Secteur, aussi utilisé pour les regroupements peers.",
    [
      {
        screen: "entreprise-fiche",
        highlight: "sector",
        label: "Fiche entreprise — Secteur",
      },
    ],
  ),

  "org-positioning:personae": info(
    "Personae",
    [
      "Définir CFO, CIO, RH… ici",
      "Rattacher un contact à une persona",
      "Même liste sur les équipements / whitespace",
    ],
    "Catalogue partagé contacts ↔ équipements du compte.",
    [
      {
        screen: "contact-fiche",
        highlight: "persona",
        label: "Fiche contact — Persona",
      },
    ],
  ),

  "entreprises:account-taxonomy": info(
    "Statuts & tailles",
    [
      "Définir statuts (Client, Prospect…) et tranches d’effectif",
      "Les renseigner sur la fiche entreprise",
      "Filtrer le portefeuille avec ces listes",
    ],
    "Deux listes pour classer et filtrer les comptes.",
    [
      {
        screen: "entreprise-fiche",
        highlight: "status+size",
        label: "Fiche entreprise — Statut & taille",
      },
    ],
  ),

  "entreprises:catalogue": info(
    "Catalogue solutions",
    [
      "Créer solutions, modules et USP ici",
      "Choisir l’offre sur l’opportunité",
      "Le whitespace compte et le Mapping USP s’appuient dessus",
    ],
    "Référentiel offre : deal, couverture compte, arguments USP.",
    [
      {
        screen: "opp-header",
        highlight: "offer",
        label: "Opportunité — solution / modules",
      },
      {
        screen: "whitespace",
        highlight: "modules",
        label: "Compte — whitespace / équipements",
      },
    ],
  ),

  "opportunites:funnel": info(
    "Phases & natures",
    [
      "Définir le funnel et les natures ici",
      "Les choisir sur la fiche opportunité",
      "Les KPI Dashboard lisent le rôle de la phase (Won, pipeline…)",
    ],
    "Listes du cycle de vente + typologie de deal.",
    [
      {
        screen: "opp-header",
        highlight: "phase+kind",
        label: "Fiche opportunité — Phase & nature",
      },
      {
        screen: "dashboard-kpi",
        highlight: "ca+cible",
        label: "Impact possible sur les KPI Dashboard",
      },
    ],
  ),

  "opportunites:process": info(
    "Process de vente",
    [
      "Définir domaines & questions ici",
      "Répondre sur l’onglet Process de l’opportunité",
      "Le % process se calcule et alimente la grille risques / IA",
    ],
    "Catalogue de questions → réponses deal → score calculé.",
    [
      {
        screen: "opp-process",
        highlight: "questions+score",
        label: "Opportunité — Process & score calculé",
      },
      {
        screen: "dashboard-risk",
        highlight: "point",
        label: "Dashboard — axe Process de la grille",
      },
      {
        screen: "opp-ai",
        highlight: "process",
        label: "Analyse IA — gaps process",
      },
    ],
  ),

  "opportunites:mapping": info(
    "Cartes SWOT / mapping",
    [
      "Construire la bibliothèque de cartes ici",
      "Cocher / statut sur Opportunity Mapping",
      "Score mapping + Analyse IA + axe Mapping Dashboard",
    ],
    "Bibliothèque de cartes → statut deal → score et diagnostic.",
    [
      {
        screen: "opp-mapping",
        highlight: "cards+score",
        label: "Opportunité — Mapping & score",
      },
      {
        screen: "opp-ai",
        highlight: "mapping",
        label: "Analyse IA — forces / risques / USP",
      },
      {
        screen: "dashboard-risk",
        highlight: "axes",
        label: "Dashboard — axe Mapping",
      },
    ],
  ),

  "opportunites:outcomes": info(
    "Business Outcomes",
    [
      "Définir les champs de valeur ici",
      "Les saisir dans le calculateur ROI du deal",
      "Repris dans le discours Account plan",
    ],
    "Champs du calculateur de bénéfices.",
    [
      {
        screen: "opp-roi",
        highlight: "fields+total",
        label: "Opportunité — ROI (champs + total calculé)",
      },
      {
        screen: "account-plan",
        highlight: "value",
        label: "Account plan — valeur chiffrée",
      },
    ],
  ),

  "opportunites:variables": info(
    "Variables deal",
    [
      "Définir les champs libres ici (licences, users…)",
      "Les remplir sur la fiche opportunité",
    ],
    "Métriques deal surtout pour upsell / expansion.",
    [
      {
        screen: "opp-variables",
        highlight: "fields",
        label: "Opportunité — variables",
      },
    ],
  ),

  "opportunites:deal-intel": info(
    "Intel deal",
    [
      "Configurer CE et concurrents ici",
      "Injectés dans Analyse IA et scripts",
      "Disponibles comme contexte sur le deal",
    ],
    "Référentiel « pourquoi maintenant » et paysage concurrentiel.",
    [
      {
        screen: "opp-ai",
        highlight: "intel",
        label: "Analyse IA — CE & concurrents",
      },
    ],
  ),

  "account-plans:deps": info(
    "Dépendances Account plan",
    [
      "Configurer Process / Mapping / Outcomes sous Opportunités",
      "Lier les opportunités au compte",
      "Le plan lit ces données pour actions et discours",
    ],
    "Pas de catalogue ici : le plan consomme la config Opportunités.",
    [
      {
        screen: "account-plan",
        highlight: "actions",
        label: "Account plan — vision & actions",
      },
    ],
  ),

  "org-positioning:profile": info(
    "Profil & USP",
    [
      "Renseigner nom, description et USP ici",
      "Contexte injecté dans l’IA",
      "USP org disponibles sur le Mapping et les scripts",
    ],
    "Identité vendeur partagée à toute l’équipe.",
    [
      {
        screen: "org-profile",
        highlight: "usp",
        label: "Qui vous êtes — profil & USP",
      },
      {
        screen: "opp-ai",
        highlight: "org",
        label: "Analyse IA — contexte vendeur",
      },
    ],
  ),

  "org-data:import": info(
    "Import Excel",
    [
      "Télécharger le template",
      "Importer le fichier ici",
      "Les fiches apparaissent en Saisie",
    ],
    "Bootstrap du portefeuille (entreprises, contacts, opps, ventes).",
    [
      {
        screen: "data-import",
        highlight: "upload",
        label: "Settings → Import",
      },
    ],
  ),

  "org-data:crm": info(
    "CRM (HubSpot)",
    [
      "Connecter HubSpot et mapper les champs",
      "Pull / push synchronise le portefeuille",
      "Les fiches vivent ensuite en Saisie DBR",
    ],
    "Pont CRM → portefeuille DBR selon votre mapping.",
    [
      {
        screen: "data-crm",
        highlight: "sync",
        label: "Settings → CRM",
      },
    ],
  ),
};

export function getSettingsInfo(
  area: SettingsAreaId,
  subId?: string | null,
): SettingsInfoDiagram | null {
  const key = settingsInfoKey(area, subId);
  return SETTINGS_INFO[key] ?? SETTINGS_INFO[area] ?? null;
}
