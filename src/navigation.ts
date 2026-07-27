import { DATA_SECTIONS, type DataSection } from "./DataEntryPanel";

export type AppPage = "dashboard" | "map" | "account-plans" | DataSection;

export function isDataSection(page: AppPage): page is DataSection {
  return DATA_SECTIONS.some((s) => s.id === page);
}

export const NAV_MAIN: { id: AppPage; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "map", label: "Cartographie" },
];

export const NAV_DATA: { id: AppPage; label: string }[] = [
  ...DATA_SECTIONS.map((s) => ({
    id: s.id as AppPage,
    label: s.label,
  })),
  { id: "account-plans", label: "Account plans" },
];
