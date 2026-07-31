import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  defaultAccounts,
  defaultCompanyRelations,
  defaultContactRelations,
  defaultContacts,
  migrateAccountSize,
  wouldCreateReportsToCycle,
  type Account,
  type AccountType,
  type CommercialStatus,
  type CompanyRelation,
  type CompanyRelationType,
  type Contact,
  type ContactRelation,
  type ContactRelationType,
  type Status,
} from "../data";
import { useAuth } from "../auth/AuthContext";
import { accountVisibleToUser } from "../auth/permissions";
import { supabase } from "../supabase/client";
import {
  loadOrgAccountsContacts,
  loadOrgLayoutPositions,
  loadOrgRelations,
  logSyncError,
  deleteCompanyRelationRemote,
  deleteContactRelationRemote,
  pushDomainUiStateRemote,
  replaceContactReportsToRemote,
  upsertAccountRemote,
  upsertAccountsRemote,
  upsertCompanyRelationRemote,
  upsertCompanyRelationsRemote,
  upsertContactRelationRemote,
  upsertContactRelationsRemote,
  upsertContactRemote,
  upsertContactsRemote,
} from "../sync";
import { idFromExternalKey } from "../import/bulkImport";

const STORAGE_KEY = "powermap.domain.v1";

type DomainState = {
  accounts: Account[];
  contacts: Contact[];
  companyRelations: CompanyRelation[];
  contactRelations: ContactRelation[];
  /** Positions manuelles des nœuds sans x/y métier (ex. personae). */
  layoutPositions: Record<string, { x: number; y: number }>;
};

function emptyLayoutPositions(): Record<string, { x: number; y: number }> {
  return {};
}

function normalizeLayoutPositions(
  raw: unknown,
): Record<string, { x: number; y: number }> {
  if (!raw || typeof raw !== "object") return emptyLayoutPositions();
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(raw as Record<string, unknown>)) {
    if (!pos || typeof pos !== "object") continue;
    const p = pos as { x?: unknown; y?: unknown };
    const x = typeof p.x === "number" ? p.x : Number(p.x);
    const y = typeof p.y === "number" ? p.y : Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[id] = { x, y };
  }
  return out;
}

function migrateCommercialStatus(status: string): CommercialStatus {
  if (status === "Competitor") return "Concurrent";
  if (status === "SameSector" || status === "Other") return "Prospect";
  return status as CommercialStatus;
}

function migrateCompanyRelationType(
  relation: string,
): CompanyRelationType | null {
  if (
    relation === "PartnerOf" ||
    relation === "CompetitorOf" ||
    relation === "SameSectorAs" ||
    relation === "SupplierOf" ||
    relation === "CustomerOf" ||
    relation === "InvestorIn"
  ) {
    return relation;
  }
  return null;
}

function emptyDomainState(): DomainState {
  return {
    accounts: [],
    contacts: [],
    companyRelations: [],
    contactRelations: [],
    layoutPositions: emptyLayoutPositions(),
  };
}

function loadLocal(): DomainState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        accounts: structuredClone(defaultAccounts),
        contacts: structuredClone(defaultContacts),
        companyRelations: structuredClone(defaultCompanyRelations),
        contactRelations: structuredClone(defaultContactRelations),
        layoutPositions: emptyLayoutPositions(),
      };
    }
    const parsed = JSON.parse(raw) as DomainState;
    const loadedAccounts = (parsed.accounts?.length
      ? parsed.accounts
      : defaultAccounts
    ).map((a) => {
      const seed = defaultAccounts.find((d) => d.id === a.id);
      return {
        ...a,
        active: a.active !== false,
        type: ((a.type as string) === "Filiale"
          ? "Entreprise"
          : a.type) as AccountType,
        commercialStatus: migrateCommercialStatus(a.commercialStatus),
        sector: a.sector ?? seed?.sector,
        size: migrateAccountSize(a.size) ?? migrateAccountSize(seed?.size),
      };
    });
    const loadedIds = new Set(loadedAccounts.map((a) => a.id));
    const missingSeedAccounts = defaultAccounts
      .filter((d) => !loadedIds.has(d.id))
      .map((d) => structuredClone(d));

    return {
      accounts: [...loadedAccounts, ...missingSeedAccounts],
      contacts: (parsed.contacts?.length
        ? parsed.contacts
        : defaultContacts
      ).map((c) => {
        const raw = c as Contact & {
          status?: unknown;
          influence?: unknown;
          role?: unknown;
        };
        const legacy = raw as Contact & { directionId?: string };
        return {
          id: raw.id,
          accountId: raw.accountId,
          personaId: raw.personaId ?? legacy.directionId ?? "",
          name: raw.name,
          firstName: raw.firstName ?? null,
          lastName: raw.lastName ?? null,
          title: raw.title,
          email: raw.email ?? null,
          phone: raw.phone ?? null,
          x: raw.x,
          y: raw.y,
          active: raw.active !== false,
          ownerProfileId: raw.ownerProfileId ?? null,
          hubspotContactId: raw.hubspotContactId ?? null,
          hubspotSyncedAt: raw.hubspotSyncedAt ?? null,
          hubspotDirty: raw.hubspotDirty === true,
        };
      }),
      companyRelations: (
        parsed.companyRelations?.length
          ? parsed.companyRelations
          : structuredClone(defaultCompanyRelations)
      )
        .map((r) => {
          const relation = migrateCompanyRelationType(r.relation as string);
          if (!relation) return null;
          return { ...r, relation };
        })
        .filter((r): r is CompanyRelation => r !== null),
      contactRelations:
        parsed.contactRelations?.length
          ? parsed.contactRelations
          : structuredClone(defaultContactRelations),
      layoutPositions: normalizeLayoutPositions(parsed.layoutPositions),
    };
  } catch {
    return {
      accounts: structuredClone(defaultAccounts),
      contacts: structuredClone(defaultContacts),
      companyRelations: structuredClone(defaultCompanyRelations),
      contactRelations: structuredClone(defaultContactRelations),
      layoutPositions: emptyLayoutPositions(),
    };
  }
}

function persistLocal(state: DomainState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function accountPosition(
  type: AccountType,
  holdingId: string | null,
  existing: Account[],
) {
  if (type === "Holding") {
    const holdings = existing.filter((a) => a.type === "Holding" && a.active);
    return { x: holdings.length * 320 - 40, y: 10 };
  }
  if (!holdingId) {
    const orphans = existing.filter(
      (a) => a.type === "Entreprise" && !a.holdingId && a.active,
    );
    return { x: orphans.length * 280 - 40, y: 280 };
  }
  const parent = existing.find((a) => a.id === holdingId);
  const siblings = existing.filter(
    (a) => a.holdingId === holdingId && a.active,
  );
  return {
    x: (parent?.x ?? 200) - 160 + siblings.length * 280,
    y: (parent?.y ?? 10) + 120,
  };
}

function contactPosition(
  personaId: string,
  accountId: string,
  existing: Contact[],
  accounts: Account[],
) {
  const siblings = existing.filter(
    (c) => c.personaId === personaId && c.active,
  );
  const account = accounts.find((a) => a.id === accountId);
  return {
    x: (account?.x ?? 200) - 80 + siblings.length * 180,
    y: (account?.y ?? 100) + 320,
  };
}

type DomainContextValue = {
  accounts: Account[];
  activeAccounts: Account[];
  contacts: Contact[];
  activeContacts: Contact[];
  companyRelations: CompanyRelation[];
  contactRelations: ContactRelation[];
  layoutPositions: Record<string, { x: number; y: number }>;
  upsertAccount: (
    input: Omit<Account, "id" | "x" | "y" | "active"> & {
      id?: string;
      x?: number;
      y?: number;
      active?: boolean;
    },
  ) => string;
  removeAccount: (id: string) => void;
  restoreAccount: (id: string) => void;
  upsertContact: (
    input: Omit<Contact, "id" | "x" | "y" | "active"> & {
      id?: string;
      x?: number;
      y?: number;
      active?: boolean;
    },
  ) => string;
  removeContact: (id: string) => void;
  restoreContact: (id: string) => void;
  upsertCompanyRelation: (
    input: Omit<CompanyRelation, "id"> & { id?: string },
  ) => void;
  removeCompanyRelation: (id: string) => void;
  upsertContactRelation: (
    input: Omit<ContactRelation, "id"> & { id?: string },
  ) => void;
  removeContactRelation: (id: string) => void;
  /** Définit le parent hiérarchique (ReportsTo). parentId null = sans parent. */
  setContactParent: (childId: string, parentId: string | null) => boolean;
  /** Rattache une entreprise à un groupe (ou détache si holdingId null). */
  setAccountHolding: (
    entrepriseId: string,
    holdingId: string | null,
  ) => boolean;
  /** Déplace un nœud carte (compte, contact ou direction) et persiste. */
  setMapNodePosition: (id: string, x: number, y: number) => void;
  /**
   * Import en masse comptes + contacts (un seul commit).
   * Retourne la map external_key → accountId (et ids créés).
   */
  importDomainBatch: (input: {
    accounts: Array<{
      action: "create" | "update";
      id?: string;
      externalKey: string;
      name: string;
      type: AccountType;
      commercialStatus: CommercialStatus;
      holdingKey: string;
      holdingId: string | null;
      sector?: string;
      size?: Account["size"];
      ownerProfileId?: string | null;
    }>;
    contacts: Array<{
      action: "create" | "update";
      id?: string;
      name: string;
      firstName?: string;
      lastName?: string;
      title: string;
      email?: string;
      phone?: string;
      accountKey: string;
      accountId: string;
      personaId: string;
      ownerProfileId?: string | null;
    }>;
  }) => { keyToAccountId: Record<string, string>; createdAccounts: number; updatedAccounts: number; createdContacts: number; updatedContacts: number };
  resetDomain: () => void;
};

const DomainContext = createContext<DomainContextValue | null>(null);

export function DomainProvider({ children }: { children: ReactNode }) {
  const {
    profile,
    loading: authLoading,
    canWriteDomain,
    canViewAllAccounts,
    billing,
  } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const remoteEnabled = Boolean(supabase && orgId);
  const orgIdRef = useRef<string | null>(orgId);
  orgIdRef.current = orgId;
  const writeAllowedRef = useRef(true);
  writeAllowedRef.current = canWriteDomain && billing.canWrite;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const layoutPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<DomainState>(() => emptyDomainState());

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      if (!orgId || !supabase) {
        if (!cancelled) setState(loadLocal());
        return;
      }
      try {
        const [{ accounts, contacts }, relations, layoutPositions] =
          await Promise.all([
            loadOrgAccountsContacts(orgId),
            loadOrgRelations(orgId),
            loadOrgLayoutPositions(orgId),
          ]);
        if (cancelled) return;

        const local = loadLocal();
        let nextAccounts = accounts;
        let nextContacts = contacts;
        let companyRelations = relations.companyRelations;
        let contactRelations = relations.contactRelations;
        let layout = layoutPositions;

        // Première synchro : pousser le cache local si le cloud est vide.
        if (nextAccounts.length === 0 && local.accounts.length > 0) {
          nextAccounts = local.accounts;
          void upsertAccountsRemote(orgId, nextAccounts).catch((err) =>
            logSyncError("seedAccounts", err),
          );
        }
        if (nextContacts.length === 0 && local.contacts.length > 0) {
          nextContacts = local.contacts;
          void upsertContactsRemote(orgId, nextContacts).catch((err) =>
            logSyncError("seedContacts", err),
          );
        }
        if (
          companyRelations.length === 0 &&
          local.companyRelations.length > 0
        ) {
          companyRelations = local.companyRelations;
          void upsertCompanyRelationsRemote(orgId, companyRelations).catch(
            (err) => logSyncError("seedCompanyRelations", err),
          );
        }
        if (
          contactRelations.length === 0 &&
          local.contactRelations.length > 0
        ) {
          contactRelations = local.contactRelations;
          void upsertContactRelationsRemote(orgId, contactRelations).catch(
            (err) => logSyncError("seedContactRelations", err),
          );
        }
        if (
          Object.keys(layout).length === 0 &&
          Object.keys(local.layoutPositions).length > 0
        ) {
          layout = local.layoutPositions;
          pushDomainUiStateRemote(orgId, layout);
        }

        const next: DomainState = {
          accounts: nextAccounts,
          contacts: nextContacts,
          companyRelations,
          contactRelations,
          layoutPositions: layout,
        };
        persistLocal(next);
        setState(next);
      } catch (err) {
        logSyncError("loadDomain", err);
        // Ne jamais vider comptes / contacts sur erreur de sync : garder le cache local.
        if (!cancelled) setState(loadLocal());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, orgId]);

  const pushAccount = useCallback((account: Account) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void upsertAccountRemote(id, account).catch((err) =>
      logSyncError("upsertAccount", err),
    );
  }, []);

  const pushContact = useCallback((contact: Contact) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void upsertContactRemote(id, contact).catch((err) =>
      logSyncError("upsertContact", err),
    );
  }, []);

  const pushCompanyRelation = useCallback((relation: CompanyRelation) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void upsertCompanyRelationRemote(id, relation).catch((err) =>
      logSyncError("upsertCompanyRelation", err),
    );
  }, []);

  const pushDeleteCompanyRelation = useCallback((relationId: string) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void deleteCompanyRelationRemote(id, relationId).catch((err) =>
      logSyncError("deleteCompanyRelation", err),
    );
  }, []);

  const pushContactRelation = useCallback((relation: ContactRelation) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void upsertContactRelationRemote(id, relation).catch((err) =>
      logSyncError("upsertContactRelation", err),
    );
  }, []);

  const pushDeleteContactRelation = useCallback((relationId: string) => {
    const id = orgIdRef.current;
    if (!id || !supabase) return;
    void deleteContactRelationRemote(id, relationId).catch((err) =>
      logSyncError("deleteContactRelation", err),
    );
  }, []);

  const scheduleLayoutPush = useCallback(
    (layoutPositions: Record<string, { x: number; y: number }>) => {
      const id = orgIdRef.current;
      if (!id || !supabase) return;
      if (layoutPushTimerRef.current) clearTimeout(layoutPushTimerRef.current);
      layoutPushTimerRef.current = setTimeout(() => {
        pushDomainUiStateRemote(id, layoutPositions);
      }, 400);
    },
    [],
  );

  const commit = useCallback((next: DomainState) => {
    setState(next);
    persistLocal(next);
  }, []);

  const activeAccounts = useMemo(() => {
    const active = state.accounts.filter((a) => a.active);
    if (canViewAllAccounts) return active;
    return active.filter((a) =>
      accountVisibleToUser(a, {
        userId: profile?.id,
        role: profile?.role,
      }),
    );
  }, [state.accounts, canViewAllAccounts, profile?.id, profile?.role]);

  const activeContacts = useMemo(() => {
    const active = state.contacts.filter((c) => c.active);
    if (canViewAllAccounts) return active;
    const visibleAccountIds = new Set(activeAccounts.map((a) => a.id));
    return active.filter((c) => visibleAccountIds.has(c.accountId));
  }, [state.contacts, canViewAllAccounts, activeAccounts]);

  const upsertAccount = useCallback(
    (
      input: Omit<Account, "id" | "x" | "y" | "active"> & {
        id?: string;
        x?: number;
        y?: number;
        active?: boolean;
      },
    ): string => {
      if (!writeAllowedRef.current) return input.id ?? "";
      const me = profileRef.current;
      let resultId = input.id ?? "";
      let synced: Account | null = null;
      let cascadedContacts: Contact[] = [];
      setState((prev) => {
        if (input.id) {
          const existing = prev.accounts.find((a) => a.id === input.id);
          if (
            me?.role === "user" &&
            existing &&
            existing.ownerProfileId &&
            existing.ownerProfileId !== me.id
          ) {
            resultId = input.id;
            return prev;
          }
          resultId = input.id;
          const nextOwner =
            input.ownerProfileId !== undefined
              ? input.ownerProfileId
              : existing?.ownerProfileId;
          // Commercial : ne peut pas réassigner l’owner
          const ownerProfileId =
            me?.role === "user"
              ? (existing?.ownerProfileId ?? me.id)
              : nextOwner;
          const prevOwner = existing?.ownerProfileId ?? null;
          const resolvedOwner =
            ownerProfileId !== undefined ? ownerProfileId : prevOwner;
          const ownerChanged =
            input.ownerProfileId !== undefined &&
            (resolvedOwner ?? null) !== (prevOwner ?? null);
          const nextAccounts = prev.accounts.map((a) =>
            a.id === input.id
              ? {
                  ...a,
                  name: input.name.trim(),
                  type: input.type,
                  commercialStatus: input.commercialStatus,
                  holdingId:
                    input.type === "Holding" ? null : input.holdingId,
                  sector: input.sector?.trim() || undefined,
                  size: input.size,
                  active: input.active ?? a.active,
                  x: input.x ?? a.x,
                  y: input.y ?? a.y,
                  ownerProfileId: resolvedOwner,
                }
              : a,
          );
          let nextContacts = prev.contacts;
          if (ownerChanged) {
            nextContacts = prev.contacts.map((c) =>
              c.accountId === input.id
                ? { ...c, ownerProfileId: resolvedOwner ?? null }
                : c,
            );
            cascadedContacts = nextContacts.filter(
              (c) => c.accountId === input.id,
            );
          }
          synced = nextAccounts.find((a) => a.id === input.id) ?? null;
          const next = {
            ...prev,
            accounts: nextAccounts,
            contacts: nextContacts,
          };
          persistLocal(next);
          return next;
        }
        const pos = accountPosition(
          input.type,
          input.holdingId,
          prev.accounts,
        );
        const account: Account = {
          id: uid(input.type === "Holding" ? "hold" : "ent"),
          name: input.name.trim(),
          type: input.type,
          commercialStatus: input.commercialStatus,
          holdingId: input.type === "Holding" ? null : input.holdingId,
          sector: input.sector?.trim() || undefined,
          size: input.size,
          x: input.x ?? pos.x,
          y: input.y ?? pos.y,
          active: true,
          ownerProfileId:
            input.ownerProfileId ??
            (me?.role === "user" ? me.id : null),
        };
        resultId = account.id;
        synced = account;
        const next = { ...prev, accounts: [...prev.accounts, account] };
        persistLocal(next);
        return next;
      });
      if (synced) pushAccount(synced);
      if (cascadedContacts.length > 0) {
        const id = orgIdRef.current;
        if (id && supabase) {
          void upsertContactsRemote(id, cascadedContacts).catch((err) =>
            logSyncError("cascadeOwnerContacts", err),
          );
        }
      }
      return resultId;
    },
    [pushAccount],
  );

  const removeAccount = useCallback(
    (id: string) => {
      let synced: Account | null = null;
      setState((prev) => {
        const nextAccounts = prev.accounts.map((a) =>
          a.id === id ? { ...a, active: false } : a,
        );
        synced = nextAccounts.find((a) => a.id === id) ?? null;
        const next = { ...prev, accounts: nextAccounts };
        persistLocal(next);
        return next;
      });
      if (synced) pushAccount(synced);
    },
    [pushAccount],
  );

  const restoreAccount = useCallback(
    (id: string) => {
      let synced: Account | null = null;
      setState((prev) => {
        const nextAccounts = prev.accounts.map((a) =>
          a.id === id ? { ...a, active: true } : a,
        );
        synced = nextAccounts.find((a) => a.id === id) ?? null;
        const next = { ...prev, accounts: nextAccounts };
        persistLocal(next);
        return next;
      });
      if (synced) pushAccount(synced);
    },
    [pushAccount],
  );

  const upsertContact = useCallback(
    (
      input: Omit<Contact, "id" | "x" | "y" | "active"> & {
        id?: string;
        x?: number;
        y?: number;
        active?: boolean;
      },
    ): string => {
      let resultId = input.id ?? "";
      let synced: Contact | null = null;
      setState((prev) => {
        if (input.id) {
          resultId = input.id;
          const nextContacts = prev.contacts.map((c) =>
            c.id === input.id
              ? {
                  ...c,
                  name: input.name.trim(),
                  title: input.title.trim(),
                  email:
                    input.email !== undefined
                      ? input.email?.trim() || null
                      : c.email,
                  phone:
                    input.phone !== undefined
                      ? input.phone?.trim() || null
                      : c.phone,
                  firstName:
                    input.firstName !== undefined
                      ? input.firstName
                      : c.firstName,
                  lastName:
                    input.lastName !== undefined
                      ? input.lastName
                      : c.lastName,
                  accountId: input.accountId,
                  personaId: input.personaId,
                  ownerProfileId:
                    input.ownerProfileId !== undefined
                      ? input.ownerProfileId
                      : c.ownerProfileId,
                  active: input.active ?? c.active,
                  x: input.x ?? c.x,
                  y: input.y ?? c.y,
                }
              : c,
          );
          synced = nextContacts.find((c) => c.id === input.id) ?? null;
          const next = { ...prev, contacts: nextContacts };
          persistLocal(next);
          return next;
        }
        const account = prev.accounts.find((a) => a.id === input.accountId);
        const pos = contactPosition(
          input.personaId,
          input.accountId,
          prev.contacts,
          prev.accounts,
        );
        const contact: Contact = {
          id: uid("c"),
          name: input.name.trim(),
          title: input.title.trim(),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          accountId: input.accountId,
          personaId: input.personaId,
          ownerProfileId:
            input.ownerProfileId !== undefined
              ? input.ownerProfileId
              : (account?.ownerProfileId ?? null),
          x: input.x ?? pos.x,
          y: input.y ?? pos.y,
          active: true,
        };
        resultId = contact.id;
        synced = contact;
        const next = { ...prev, contacts: [...prev.contacts, contact] };
        persistLocal(next);
        return next;
      });
      if (synced) pushContact(synced);
      return resultId;
    },
    [pushContact],
  );

  const removeContact = useCallback(
    (id: string) => {
      let synced: Contact | null = null;
      setState((prev) => {
        const nextContacts = prev.contacts.map((c) =>
          c.id === id ? { ...c, active: false } : c,
        );
        synced = nextContacts.find((c) => c.id === id) ?? null;
        const next = { ...prev, contacts: nextContacts };
        persistLocal(next);
        return next;
      });
      if (synced) pushContact(synced);
    },
    [pushContact],
  );

  const restoreContact = useCallback(
    (id: string) => {
      let synced: Contact | null = null;
      setState((prev) => {
        const nextContacts = prev.contacts.map((c) =>
          c.id === id ? { ...c, active: true } : c,
        );
        synced = nextContacts.find((c) => c.id === id) ?? null;
        const next = { ...prev, contacts: nextContacts };
        persistLocal(next);
        return next;
      });
      if (synced) pushContact(synced);
    },
    [pushContact],
  );

  const upsertCompanyRelation = useCallback(
    (input: Omit<CompanyRelation, "id"> & { id?: string }) => {
      if (input.source === input.target) return;
      let synced: CompanyRelation | null = null;
      setState((prev) => {
        if (input.id) {
          const nextRels = prev.companyRelations.map((r) =>
            r.id === input.id
              ? {
                  ...r,
                  source: input.source,
                  target: input.target,
                  relation: input.relation,
                }
              : r,
          );
          synced = nextRels.find((r) => r.id === input.id) ?? null;
          const next = { ...prev, companyRelations: nextRels };
          persistLocal(next);
          return next;
        }
        const rel: CompanyRelation = {
          id: uid("cr"),
          source: input.source,
          target: input.target,
          relation: input.relation,
        };
        synced = rel;
        const next = {
          ...prev,
          companyRelations: [...prev.companyRelations, rel],
        };
        persistLocal(next);
        return next;
      });
      if (synced) pushCompanyRelation(synced);
    },
    [pushCompanyRelation],
  );

  const removeCompanyRelation = useCallback(
    (id: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          companyRelations: prev.companyRelations.filter((r) => r.id !== id),
        };
        persistLocal(next);
        return next;
      });
      pushDeleteCompanyRelation(id);
    },
    [pushDeleteCompanyRelation],
  );

  const upsertContactRelation = useCallback(
    (input: Omit<ContactRelation, "id"> & { id?: string }) => {
      if (input.source === input.target) return;
      let synced: ContactRelation | null = null;
      let removedIds: string[] = [];
      setState((prev) => {
        let relations = prev.contactRelations;
        if (input.relation === "ReportsTo") {
          removedIds = [];
          const base = relations.filter((r) => {
            if (r.id === input.id) return true;
            if (r.relation === "ReportsTo" && r.source === input.source) {
              removedIds.push(r.id);
              return false;
            }
            return true;
          });
          const withoutSelf = base.filter((r) => r.id !== input.id);
          if (
            wouldCreateReportsToCycle(input.source, input.target, withoutSelf)
          ) {
            removedIds = [];
            return prev;
          }
          relations = withoutSelf;
        }
        if (input.id) {
          const updated: ContactRelation = {
            id: input.id,
            source: input.source,
            target: input.target,
            relation: input.relation,
          };
          const hasId = relations.some((r) => r.id === input.id);
          const nextRels = hasId
            ? relations.map((r) => (r.id === input.id ? updated : r))
            : [...relations, updated];
          synced = updated;
          const next = { ...prev, contactRelations: nextRels };
          persistLocal(next);
          return next;
        }
        const rel: ContactRelation = {
          id: uid("ir"),
          source: input.source,
          target: input.target,
          relation: input.relation,
        };
        synced = rel;
        const next = {
          ...prev,
          contactRelations: [...relations, rel],
        };
        persistLocal(next);
        return next;
      });
      for (const rid of removedIds) pushDeleteContactRelation(rid);
      if (synced) pushContactRelation(synced);
    },
    [pushContactRelation, pushDeleteContactRelation],
  );

  const removeContactRelation = useCallback(
    (id: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          contactRelations: prev.contactRelations.filter((r) => r.id !== id),
        };
        persistLocal(next);
        return next;
      });
      pushDeleteContactRelation(id);
    },
    [pushDeleteContactRelation],
  );

  const setContactParent = useCallback(
    (childId: string, parentId: string | null): boolean => {
      let ok = true;
      let synced: ContactRelation | null = null;
      setState((prev) => {
        const without = prev.contactRelations.filter(
          (r) => !(r.relation === "ReportsTo" && r.source === childId),
        );
        if (!parentId) {
          const next = { ...prev, contactRelations: without };
          persistLocal(next);
          return next;
        }
        if (childId === parentId) {
          ok = false;
          return prev;
        }
        if (wouldCreateReportsToCycle(childId, parentId, without)) {
          ok = false;
          return prev;
        }
        if (
          !prev.contacts.some((c) => c.id === parentId && c.active !== false)
        ) {
          ok = false;
          return prev;
        }
        const rel: ContactRelation = {
          id: uid("ir"),
          source: childId,
          target: parentId,
          relation: "ReportsTo",
        };
        synced = rel;
        const next = {
          ...prev,
          contactRelations: [...without, rel],
        };
        persistLocal(next);
        return next;
      });
      if (ok) {
        const id = orgIdRef.current;
        if (id && supabase) {
          void replaceContactReportsToRemote(id, childId, synced).catch((err) =>
            logSyncError("replaceContactReportsTo", err),
          );
        }
      }
      return ok;
    },
    [],
  );

  const setAccountHolding = useCallback(
    (entrepriseId: string, holdingId: string | null): boolean => {
      let ok = true;
      let synced: Account | null = null;
      setState((prev) => {
        const child = prev.accounts.find((a) => a.id === entrepriseId);
        if (!child || child.type !== "Entreprise" || child.active === false) {
          ok = false;
          return prev;
        }
        if (holdingId) {
          const holding = prev.accounts.find((a) => a.id === holdingId);
          if (
            !holding ||
            holding.type !== "Holding" ||
            holding.active === false
          ) {
            ok = false;
            return prev;
          }
        }
        if (child.holdingId === holdingId) return prev;
        const nextAccounts = prev.accounts.map((a) =>
          a.id === entrepriseId ? { ...a, holdingId } : a,
        );
        synced = nextAccounts.find((a) => a.id === entrepriseId) ?? null;
        const next = { ...prev, accounts: nextAccounts };
        persistLocal(next);
        return next;
      });
      if (synced) pushAccount(synced);
      return ok;
    },
    [pushAccount],
  );

  const setMapNodePosition = useCallback(
    (id: string, x: number, y: number) => {
      let syncedAccount: Account | null = null;
      let syncedContact: Contact | null = null;
      let layoutToPush: Record<string, { x: number; y: number }> | null = null;
      setState((prev) => {
        if (prev.accounts.some((a) => a.id === id)) {
          const nextAccounts = prev.accounts.map((a) =>
            a.id === id ? { ...a, x, y } : a,
          );
          syncedAccount = nextAccounts.find((a) => a.id === id) ?? null;
          const next = { ...prev, accounts: nextAccounts };
          persistLocal(next);
          return next;
        }
        if (prev.contacts.some((c) => c.id === id)) {
          const nextContacts = prev.contacts.map((c) =>
            c.id === id ? { ...c, x, y } : c,
          );
          syncedContact = nextContacts.find((c) => c.id === id) ?? null;
          const next = { ...prev, contacts: nextContacts };
          persistLocal(next);
          return next;
        }
        const next = {
          ...prev,
          layoutPositions: { ...prev.layoutPositions, [id]: { x, y } },
        };
        layoutToPush = next.layoutPositions;
        persistLocal(next);
        return next;
      });
      if (syncedAccount) pushAccount(syncedAccount);
      if (syncedContact) pushContact(syncedContact);
      if (layoutToPush) scheduleLayoutPush(layoutToPush);
    },
    [pushAccount, pushContact, scheduleLayoutPush],
  );

  const importDomainBatch = useCallback(
    (input: {
      accounts: Array<{
        action: "create" | "update";
        id?: string;
        externalKey: string;
        name: string;
        type: AccountType;
        commercialStatus: CommercialStatus;
        holdingKey: string;
        holdingId: string | null;
        sector?: string;
        size?: Account["size"];
        ownerProfileId?: string | null;
      }>;
      contacts: Array<{
        action: "create" | "update";
        id?: string;
        externalKey?: string;
        name: string;
        firstName?: string;
        lastName?: string;
        title: string;
        email?: string;
        phone?: string;
        accountKey: string;
        accountId: string;
        personaId: string;
        ownerProfileId?: string | null;
      }>;
    }) => {
      const keyToAccountId: Record<string, string> = {};
      const preparedAccounts = input.accounts.map((row) => {
        let id: string;
        if (row.action === "update" && row.id) {
          id = row.id;
        } else if (row.externalKey?.trim()) {
          id = idFromExternalKey(row.externalKey, "ent");
        } else {
          id = uid(row.type === "Holding" ? "hold" : "ent");
        }
        if (row.externalKey) keyToAccountId[row.externalKey] = id;
        keyToAccountId[id] = id;
        return { ...row, resolvedId: id };
      });
      const preparedContacts = input.contacts.map((row) => {
        let resolvedId: string;
        if (row.action === "update" && row.id) {
          resolvedId = row.id;
        } else if (row.externalKey?.trim()) {
          resolvedId = idFromExternalKey(row.externalKey, "c");
        } else {
          resolvedId = uid("c");
        }
        return { ...row, resolvedId };
      });

      let createdAccounts = 0;
      let updatedAccounts = 0;
      let createdContacts = 0;
      let updatedContacts = 0;

      setState((prev) => {
        let accounts = [...prev.accounts];
        let contacts = [...prev.contacts];

        for (const a of prev.accounts) {
          if (a.active !== false && !keyToAccountId[a.id]) {
            keyToAccountId[a.id] = a.id;
          }
        }

        const resolveHolding = (
          holdingKey: string,
          holdingId: string | null,
        ): string | null => {
          if (holdingId && !holdingId.startsWith("__")) return holdingId;
          if (
            holdingKey &&
            keyToAccountId[holdingKey] &&
            !keyToAccountId[holdingKey].startsWith("__")
          ) {
            return keyToAccountId[holdingKey];
          }
          return null;
        };

        createdAccounts = 0;
        updatedAccounts = 0;
        createdContacts = 0;
        updatedContacts = 0;

        for (const row of preparedAccounts) {
          if (row.type !== "Holding") continue;
          const existing = accounts.some((a) => a.id === row.resolvedId);
          if (existing) {
            accounts = accounts.map((a) =>
              a.id === row.resolvedId
                ? {
                    ...a,
                    name: row.name.trim(),
                    type: "Holding",
                    commercialStatus: row.commercialStatus,
                    holdingId: null,
                    sector: row.sector,
                    size: row.size,
                    ownerProfileId:
                      row.ownerProfileId !== undefined
                        ? row.ownerProfileId
                        : a.ownerProfileId,
                    active: true,
                  }
                : a,
            );
            updatedAccounts++;
          } else {
            const pos = accountPosition("Holding", null, accounts);
            accounts.push({
              id: row.resolvedId,
              name: row.name.trim(),
              type: "Holding",
              commercialStatus: row.commercialStatus,
              holdingId: null,
              sector: row.sector,
              size: row.size,
              ownerProfileId: row.ownerProfileId ?? null,
              x: pos.x,
              y: pos.y,
              active: true,
            });
            createdAccounts++;
          }
        }

        for (const row of preparedAccounts) {
          if (row.type !== "Entreprise") continue;
          const holdingId = resolveHolding(row.holdingKey, row.holdingId);
          const existing = accounts.some((a) => a.id === row.resolvedId);
          if (existing) {
            accounts = accounts.map((a) =>
              a.id === row.resolvedId
                ? {
                    ...a,
                    name: row.name.trim(),
                    type: "Entreprise",
                    commercialStatus: row.commercialStatus,
                    holdingId,
                    sector: row.sector,
                    size: row.size,
                    ownerProfileId:
                      row.ownerProfileId !== undefined
                        ? row.ownerProfileId
                        : a.ownerProfileId,
                    active: true,
                  }
                : a,
            );
            updatedAccounts++;
          } else {
            const pos = accountPosition("Entreprise", holdingId, accounts);
            accounts.push({
              id: row.resolvedId,
              name: row.name.trim(),
              type: "Entreprise",
              commercialStatus: row.commercialStatus,
              holdingId,
              sector: row.sector,
              size: row.size,
              ownerProfileId: row.ownerProfileId ?? null,
              x: pos.x,
              y: pos.y,
              active: true,
            });
            createdAccounts++;
          }
        }

        const resolveAccountId = (
          raw: string,
          accountKey: string,
        ): string | null => {
          if (raw && !raw.startsWith("__")) return raw;
          if (
            accountKey &&
            keyToAccountId[accountKey] &&
            !keyToAccountId[accountKey].startsWith("__")
          ) {
            return keyToAccountId[accountKey];
          }
          if (raw.startsWith("__new__:")) {
            const k = raw.slice("__new__:".length);
            const id = keyToAccountId[k];
            return id && !id.startsWith("__") ? id : null;
          }
          if (raw.startsWith("__pending__:")) {
            const k = raw.slice("__pending__:".length);
            const id = keyToAccountId[k];
            return id && !id.startsWith("__") ? id : null;
          }
          return null;
        };

        for (const row of preparedContacts) {
          const accountId = resolveAccountId(row.accountId, row.accountKey);
          if (!accountId) continue;
          const existing = contacts.some((c) => c.id === row.resolvedId);
          if (existing) {
            contacts = contacts.map((c) =>
              c.id === row.resolvedId
                ? {
                    ...c,
                    name: row.name.trim(),
                    firstName: row.firstName ?? c.firstName,
                    lastName: row.lastName ?? c.lastName,
                    title: row.title.trim(),
                    email: row.email ?? c.email,
                    phone: row.phone ?? c.phone,
                    accountId,
                    personaId: row.personaId,
                    ownerProfileId:
                      row.ownerProfileId !== undefined
                        ? row.ownerProfileId
                        : c.ownerProfileId,
                    active: true,
                  }
                : c,
            );
            updatedContacts++;
          } else {
            const pos = contactPosition(
              row.personaId,
              accountId,
              contacts,
              accounts,
            );
            contacts.push({
              id: row.resolvedId,
              name: row.name.trim(),
              firstName: row.firstName,
              lastName: row.lastName,
              title: row.title.trim(),
              email: row.email,
              phone: row.phone,
              accountId,
              personaId: row.personaId,
              ownerProfileId: row.ownerProfileId ?? null,
              x: pos.x,
              y: pos.y,
              active: true,
            });
            createdContacts++;
          }
        }

        const next = { ...prev, accounts, contacts };
        persistLocal(next);
        return next;
      });

      const id = orgIdRef.current;
      if (id && supabase) {
        // Re-read from localStorage snapshot just written — use state after setState is hard;
        // push via a follow-up read of what we committed by re-running isn't available.
        // Instead: load from the last persist by parsing STORAGE_KEY.
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as DomainState;
            void upsertAccountsRemote(id, parsed.accounts ?? []).catch((err) =>
              logSyncError("importAccounts", err),
            );
            void upsertContactsRemote(id, parsed.contacts ?? []).catch((err) =>
              logSyncError("importContacts", err),
            );
          }
        } catch (err) {
          logSyncError("importDomainBatch", err);
        }
      }

      return {
        keyToAccountId,
        createdAccounts,
        updatedAccounts,
        createdContacts,
        updatedContacts,
      };
    },
    [],
  );

  const resetDomain = useCallback(() => {
    if (remoteEnabled) {
      commit(emptyDomainState());
      return;
    }
    commit({
      accounts: structuredClone(defaultAccounts),
      contacts: structuredClone(defaultContacts),
      companyRelations: structuredClone(defaultCompanyRelations),
      contactRelations: structuredClone(defaultContactRelations),
      layoutPositions: emptyLayoutPositions(),
    });
  }, [commit, remoteEnabled]);

  const value = useMemo(
    () => ({
      accounts: state.accounts,
      activeAccounts,
      contacts: state.contacts,
      activeContacts,
      companyRelations: state.companyRelations,
      contactRelations: state.contactRelations,
      layoutPositions: state.layoutPositions,
      upsertAccount,
      removeAccount,
      restoreAccount,
      upsertContact,
      removeContact,
      restoreContact,
      upsertCompanyRelation,
      removeCompanyRelation,
      upsertContactRelation,
      removeContactRelation,
      setContactParent,
      setAccountHolding,
      setMapNodePosition,
      importDomainBatch,
      resetDomain,
    }),
    [
      state,
      activeAccounts,
      activeContacts,
      upsertAccount,
      removeAccount,
      restoreAccount,
      upsertContact,
      removeContact,
      restoreContact,
      upsertCompanyRelation,
      removeCompanyRelation,
      upsertContactRelation,
      removeContactRelation,
      setContactParent,
      setAccountHolding,
      setMapNodePosition,
      importDomainBatch,
      resetDomain,
    ],
  );

  return (
    <DomainContext.Provider value={value}>{children}</DomainContext.Provider>
  );
}

export function useDomain() {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error("useDomain must be used within DomainProvider");
  return ctx;
}

export type {
  AccountType,
  CommercialStatus,
  CompanyRelationType,
  ContactRelationType,
  Status,
};
