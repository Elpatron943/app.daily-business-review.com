import type { MessageKey } from "../i18n/messages";

/** Aires Settings alignées sur le menu app (+ Organisation). */
export type SettingsAreaId =
  | "dashboard"
  | "entreprises"
  | "contacts"
  | "opportunites"
  | "account-plans"
  | "org-positioning"
  | "org-data"
  | "org-team"
  | "org-parcours";

export type SettingsSubId = string;

export type SettingsSubItem = {
  id: SettingsSubId;
  label: string;
  where: string;
  purpose: string;
};

export type SettingsNavItem = {
  id: SettingsAreaId;
  labelKey?: MessageKey;
  label?: string;
  blurb: string;
  showInactiveToggle: boolean;
  openTeam?: boolean;
  subs?: SettingsSubItem[];
};

export type SettingsNavGroup = {
  id: string;
  labelKey?: MessageKey;
  label?: string;
  items: SettingsNavItem[];
};

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    id: "start",
    label: "Démarrage",
    items: [
      {
        id: "org-parcours",
        label: "Parcours",
        blurb:
          "Suivez ces étapes pour configurer DBR. Ensuite, affinez via le menu ci-dessous (miroir de l’app).",
        showInactiveToggle: false,
      },
    ],
  },
  {
    id: "view",
    labelKey: "nav.group.view",
    items: [
      {
        id: "dashboard",
        labelKey: "nav.dashboard",
        blurb: "Pilotage portefeuille — ce qui s’affiche sur le Dashboard.",
        showInactiveToggle: false,
        subs: [
          {
            id: "risk",
            label: "Matrice des risques",
            where: "Dashboard → matrice process × mapping",
            purpose:
              "Seuils et libellés qui colorent les deals et nomment les axes de la grille.",
          },
          {
            id: "kpi",
            label: "Règles KPI",
            where: "Dashboard → CA installé & cible",
            purpose:
              "Ce qui entre dans le CA installé et la cible (ventes, Won, Whitespace, pipeline…).",
          },
        ],
      },
    ],
  },
  {
    id: "data",
    labelKey: "nav.group.data",
    items: [
      {
        id: "entreprises",
        labelKey: "nav.entreprises",
        blurb: "Référentiels des fiches entreprise et catalogue offre.",
        showInactiveToggle: true,
        subs: [
          {
            id: "sectors",
            label: "Secteurs",
            where: "Entreprises → secteur / filtres peers",
            purpose: "Classer les comptes et les analyses « même secteur ».",
          },
          {
            id: "account-taxonomy",
            label: "Statuts & tailles",
            where: "Entreprises → statut & effectif",
            purpose: "Client/Prospect… et tranches d’effectif.",
          },
          {
            id: "catalogue",
            label: "Catalogue solutions",
            where: "Whitespace, ventes, opportunités",
            purpose: "Solutions, modules et USP produit.",
          },
        ],
      },
      {
        id: "contacts",
        labelKey: "nav.contacts",
        blurb: "Rôles d’influence — pastilles carte et fiches contact.",
        showInactiveToggle: true,
        subs: [
          {
            id: "contact-types",
            label: "Types de contacts",
            where: "Contacts + Cartographie",
            purpose:
              "Rôles (Economic Buyer, Champion…) et couleurs — un catalogue pour la carte et les fiches.",
          },
        ],
      },
      {
        id: "opportunites",
        labelKey: "nav.opportunites",
        blurb: "Comment vous qualifiez et valorisez les deals.",
        showInactiveToggle: true,
        subs: [
          {
            id: "funnel",
            label: "Phases & natures",
            where: "Fiche opportunité → phase / nature",
            purpose: "Funnel (phases) et natures de deal (upsell, prospect…).",
          },
          {
            id: "process",
            label: "Process de vente",
            where: "Fiche opportunité → Process",
            purpose: "Domaines et questions de qualification.",
          },
          {
            id: "mapping",
            label: "Cartes SWOT / mapping",
            where: "Fiche opportunité → Mapping",
            purpose: "Bibliothèque de cartes SWOT, signaux et risques.",
          },
          {
            id: "outcomes",
            label: "Business Outcomes",
            where: "Fiche opportunité → valeur / ROI",
            purpose: "Champs de bénéfice pour le calculateur.",
          },
          {
            id: "variables",
            label: "Variables deal",
            where: "Fiche opportunité → champs libres",
            purpose: "Licences, users… (upsell / expansion).",
          },
          {
            id: "deal-intel",
            label: "Intel deal",
            where: "Analyse IA + scripts",
            purpose: "Compelling Events et concurrents.",
          },
        ],
      },
    ],
  },
  {
    id: "pilotage",
    labelKey: "nav.group.pilotage",
    items: [
      {
        id: "account-plans",
        labelKey: "nav.accountPlans",
        blurb: "Le plan d’actions s’appuie sur la config Opportunités.",
        showInactiveToggle: false,
        subs: [
          {
            id: "deps",
            label: "Dépendances",
            where: "Account plan",
            purpose:
              "Process et outcomes se règlent sous Opportunités — pas de catalogue propre ici.",
          },
        ],
      },
    ],
  },
  {
    id: "organisation",
    label: "Organisation",
    items: [
      {
        id: "org-positioning",
        label: "Qui vous êtes",
        blurb: "Identité vendeur partagée à toute l’équipe.",
        showInactiveToggle: true,
        subs: [
          {
            id: "profile",
            label: "Profil & USP",
            where: "Analyse IA, scripts, mapping USP",
            purpose: "Nom, description et Unique Selling Points.",
          },
          {
            id: "personae",
            label: "Personae",
            where: "Contacts, ventes, opportunités",
            purpose:
              "Profils acheteurs cibles (CFO, CIO…) pour identifier solutions et contacts.",
          },
        ],
      },
      {
        id: "org-data",
        label: "Données",
        blurb: "Alimenter DBR depuis Excel ou le CRM.",
        showInactiveToggle: false,
        subs: [
          {
            id: "import",
            label: "Import Excel",
            where: "Bootstrap portefeuille",
            purpose: "Charger comptes / contacts / opps via le template.",
          },
          {
            id: "crm",
            label: "CRM",
            where: "Sync HubSpot",
            purpose: "Connecter et mapper le CRM.",
          },
        ],
      },
      {
        id: "org-team",
        label: "Équipe",
        blurb: "Inviter les membres et gérer les rôles.",
        showInactiveToggle: false,
        openTeam: true,
      },
    ],
  },
];

export function findSettingsArea(
  id: SettingsAreaId,
): SettingsNavItem | undefined {
  for (const g of SETTINGS_NAV) {
    const item = g.items.find((i) => i.id === id);
    if (item) return item;
  }
  return undefined;
}

export function defaultSubForArea(area: SettingsAreaId): SettingsSubId | null {
  const item = findSettingsArea(area);
  return item?.subs?.[0]?.id ?? null;
}

/** Première page Settings = parcours guidé. */
export const DEFAULT_SETTINGS_AREA: SettingsAreaId = "org-parcours";
