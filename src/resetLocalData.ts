/** Clés métier DBR (localStorage / sessionStorage). */
const POWERMAP_PREFIX = "powermap.";

/** Marker historique (anciens wipes one-shot). Ne plus incrémenter pour forcer un wipe. */
export const LOCAL_RESET_VERSION = "fresh-2026-07-27b";

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
 * Ancien wipe one-shot (démos). Désactivé : on pose seulement le marker
 * pour ne plus jamais effacer le cache CRM au démarrage.
 */
export function applyLocalResetIfNeeded() {
  try {
    if (!localStorage.getItem(RESET_MARKER)) {
      localStorage.setItem(RESET_MARKER, LOCAL_RESET_VERSION);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
