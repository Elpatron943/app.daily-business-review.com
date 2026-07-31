import { DATA_SECTIONS, type DataSection } from "./DataEntryPanel";
import type { OptionalModuleId } from "./billing/optionalModules";

export type AppPage =
  | "dashboard"
  | "map"
  | "account-plans"
  | "settings"
  | DataSection
  | OptionalModuleId;

export function isDataSection(page: AppPage): page is DataSection {
  return DATA_SECTIONS.some((s) => s.id === page);
}

export function isOptionalModulePage(page: AppPage): page is OptionalModuleId {
  return page === "ai_phone_script" || page === "ai_email_script";
}

export const NAV_MAIN: { id: AppPage; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "map", label: "Cartographie" },
];

/** Saisie : construction du compte / deals. */
export const NAV_DATA: { id: AppPage; label: string }[] = DATA_SECTIONS.map(
  (s) => ({
    id: s.id as AppPage,
    label: s.label,
  }),
);

/** Pilotage : plan de compte (les actions opérationnelles restent dans l’opportunité). */
export const NAV_PILOTAGE: { id: AppPage; label: string }[] = [
  { id: "account-plans", label: "Account plan" },
];

export const NAV_OPTIONAL_MODULES: {
  id: OptionalModuleId;
  label: string;
}[] = [
  { id: "ai_phone_script", label: "Script téléphonique IA" },
  { id: "ai_email_script", label: "Script E-mailing IA" },
];
