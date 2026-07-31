import type { AppRole } from "./types";

/**
 * Matrice des droits DBR (rôles × capacités).
 *
 * | Capacité                         | Admin | Manager | Commercial | Lecture |
 * |----------------------------------|:-----:|:-------:|:----------:|:-------:|
 * | Settings (catalogue, process…)   |  ✓    |    —    |     —      |    —    |
 * | Équipe (inviter / rôles)         |  ✓    |    —    |     —      |    —    |
 * | CRM connecteur / pull / push     |  ✓    |    —    |     —      |    —    |
 * | Import / export Excel            |  ✓    |    —    |     —      |    —    |
 * | Voir toute l’org                 |  ✓    |    ✓    |     —      |    ✓    |
 * | Voir son portefeuille (owner)    |  ✓    |    ✓    |     ✓      |    ✓*   |
 * | Écrire comptes / contacts / opps |  ✓    |    ✓    |    ✓**     |    —    |
 * | Assigner / changer un owner      |  ✓    |    ✓    |     —      |    —    |
 *
 * * Lecture : voit toute l’org en lecture seule.
 * ** Commercial : écriture seulement sur les fiches où il est owner
 *    (ou sans owner → visible admin/manager pour assignation).
 */

export type Permission =
  | "settings.access"
  | "team.manage"
  | "crm.manage"
  | "import.manage"
  | "data.view_all"
  | "data.write"
  | "data.assign_owner";

const MATRIX: Record<AppRole, ReadonlySet<Permission>> = {
  admin: new Set([
    "settings.access",
    "team.manage",
    "crm.manage",
    "import.manage",
    "data.view_all",
    "data.write",
    "data.assign_owner",
  ]),
  manager: new Set([
    "data.view_all",
    "data.write",
    "data.assign_owner",
  ]),
  user: new Set([
    "data.write",
  ]),
  viewer: new Set([
    "data.view_all",
  ]),
};

export const APP_ROLES: AppRole[] = ["admin", "manager", "user", "viewer"];

export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(permission) ?? false;
}

/** Écriture métier autorisée (hors verrou billing). */
export function canWriteDomain(role: AppRole | null | undefined): boolean {
  return can(role, "data.write");
}

/** Voit tous les comptes de l’org (sinon filtre owner). */
export function canViewAllAccounts(role: AppRole | null | undefined): boolean {
  return can(role, "data.view_all");
}

export function canAssignOwner(role: AppRole | null | undefined): boolean {
  return can(role, "data.assign_owner");
}

/** Compte visible pour ce profil (portefeuille commercial). */
export function accountVisibleToUser(
  account: { ownerProfileId?: string | null },
  opts: {
    userId: string | null | undefined;
    role: AppRole | null | undefined;
  },
): boolean {
  if (canViewAllAccounts(opts.role)) return true;
  if (!opts.userId) return false;
  return account.ownerProfileId === opts.userId;
}