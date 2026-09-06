import type { InactionValueKind } from "../config/types";

/** Trois regroupements fixes Settings / deal. */
export const INACTION_KIND_GROUPS: {
  kind: InactionValueKind;
  label: string;
  familyId: string;
  blurb: string;
}[] = [
  {
    kind: "productivity",
    label: "Gain productivité",
    familyId: "ilf-productivity",
    blurb: "Temps homme perdu — matérialisé en € via le coût ETP.",
  },
  {
    kind: "revenue",
    label: "Gain CA",
    familyId: "ilf-gain",
    blurb: "Chiffre d’affaires en plus (ou non réalisé) si on agit.",
  },
  {
    kind: "avoided",
    label: "Coût évité",
    familyId: "ilf-avoided",
    blurb: "Risques et pertes qu’on évite en agissant.",
  },
];
