/** Catalogue des modules optionnels (activés par org via la console plateforme). */

export const OPTIONAL_MODULE_IDS = [] as const;

export type OptionalModuleId = (typeof OPTIONAL_MODULE_IDS)[number];

export type OptionalModulesState = Partial<Record<string, boolean>>;

export function normalizeOptionalModules(
  raw: unknown,
): OptionalModulesState {
  const out: OptionalModulesState = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  for (const id of OPTIONAL_MODULE_IDS) {
    if (obj[id] === true) out[id] = true;
  }
  return out;
}

export function isModuleEnabled(
  modules: OptionalModulesState | null | undefined,
  id: string,
): boolean {
  return modules?.[id] === true;
}
