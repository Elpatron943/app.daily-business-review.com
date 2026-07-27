/** Clés métier DBR (localStorage / sessionStorage). */
const POWERMAP_PREFIX = "powermap.";

/** Incrémente pour forcer un nouveau wipe (une fois par navigateur). */
export const LOCAL_RESET_VERSION = "fresh-2026-07-27";

const RESET_MARKER = "powermap._local_reset_version";

export function clearPowermapStorage() {
  const localKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(POWERMAP_PREFIX)) localKeys.push(k);
  }
  for (const k of localKeys) localStorage.removeItem(k);

  const sessionKeys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(POWERMAP_PREFIX)) sessionKeys.push(k);
  }
  for (const k of sessionKeys) sessionStorage.removeItem(k);
}

/**
 * Efface toutes les données locales si la version de reset a changé.
 * Au prochain chargement, l’app repart sur les seeds / config par défaut.
 */
export function applyLocalResetIfNeeded() {
  try {
    if (localStorage.getItem(RESET_MARKER) === LOCAL_RESET_VERSION) return;
    clearPowermapStorage();
    localStorage.setItem(RESET_MARKER, LOCAL_RESET_VERSION);
  } catch {
    /* ignore quota / private mode */
  }
}
