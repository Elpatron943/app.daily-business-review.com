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
import { useAuth } from "../auth/AuthContext";
import {
  type SoldSolution,
  defaultSoldSolutions,
  normalizeSoldSolution,
} from "../data";
import { supabase } from "../supabase/client";
import {
  loadOrgSoldSolutions,
  logSyncError,
  upsertSoldSolutionsRemote,
} from "../sync";

const SALES_STORAGE_KEY = "powermap.soldSolutions.v1";

function slugifyKey(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "item";
}

function idFromExternalKey(key: string): string {
  const slug = slugifyKey(key);
  if (slug && slug !== "item") return slug;
  return `ss-${Date.now().toString(36)}`;
}

function loadLocal(): SoldSolution[] {
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw)
      return structuredClone(defaultSoldSolutions).map(normalizeSoldSolution);
    const parsed = JSON.parse(raw) as SoldSolution[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return structuredClone(defaultSoldSolutions).map(normalizeSoldSolution);
    }
    return parsed.map(normalizeSoldSolution);
  } catch {
    return structuredClone(defaultSoldSolutions).map(normalizeSoldSolution);
  }
}

function persistLocal(lines: SoldSolution[]) {
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(lines));
}

function uid() {
  return `ss-${Math.random().toString(36).slice(2, 9)}`;
}

type SalesContextValue = {
  soldSolutions: SoldSolution[];
  upsertSoldSolution: (
    input: Omit<SoldSolution, "id" | "currency"> & { id?: string },
  ) => void;
  removeSoldSolution: (id: string) => void;
  importSoldSolutionsBatch: (
    rows: Array<{
      action: "create" | "update";
      id?: string;
      externalKey?: string;
      accountId: string;
      solutionId: string;
      moduleIds: string[];
      directionIds: string[];
      billedAmount: number;
    }>,
  ) => { created: number; updated: number };
  resetSales: () => void;
};

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const orgIdRef = useRef<string | null>(orgId);
  orgIdRef.current = orgId;

  const [soldSolutions, setSoldSolutions] = useState<SoldSolution[]>([]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (!orgId || !supabase) {
        if (!cancelled) setSoldSolutions(loadLocal());
        return;
      }
      try {
        const lines = await loadOrgSoldSolutions(orgId);
        if (cancelled) return;
        persistLocal(lines);
        setSoldSolutions(lines);
      } catch (err) {
        logSyncError("loadSoldSolutions", err);
        if (!cancelled) {
          const next = loadLocal();
          setSoldSolutions(next);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, orgId]);

  const commit = useCallback((next: SoldSolution[]) => {
    setSoldSolutions(next);
    persistLocal(next);
    const id = orgIdRef.current;
    if (id && supabase) {
      void upsertSoldSolutionsRemote(id, next).catch((err) =>
        logSyncError("upsertSoldSolutions", err),
      );
    }
  }, []);

  const upsertSoldSolution = useCallback(
    (input: Omit<SoldSolution, "id" | "currency"> & { id?: string }) => {
      const directionIds = Array.isArray(input.directionIds)
        ? [...new Set(input.directionIds.filter(Boolean))]
        : input.directionId
          ? [input.directionId]
          : [];
      const line = normalizeSoldSolution({
        id: input.id ?? uid(),
        solutionId: input.solutionId,
        accountId: input.accountId,
        directionId: directionIds[0] ?? null,
        directionIds,
        moduleIds: Array.isArray(input.moduleIds) ? input.moduleIds : [],
        currency: "EUR",
        billedAmount: Math.max(0, input.billedAmount),
      });
      setSoldSolutions((prev) => {
        const exists = prev.some((s) => s.id === line.id);
        const next = exists
          ? prev.map((s) => (s.id === line.id ? line : s))
          : [...prev, line];
        persistLocal(next);
        const id = orgIdRef.current;
        if (id && supabase) {
          void upsertSoldSolutionsRemote(id, [line]).catch((err) =>
            logSyncError("upsertSoldSolution", err),
          );
        }
        return next;
      });
    },
    [],
  );

  const removeSoldSolution = useCallback((id: string) => {
    setSoldSolutions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persistLocal(next);
      return next;
    });
  }, []);

  const importSoldSolutionsBatch = useCallback(
    (
      rows: Array<{
        action: "create" | "update";
        id?: string;
        externalKey?: string;
        accountId: string;
        solutionId: string;
        moduleIds: string[];
        directionIds: string[];
        billedAmount: number;
      }>,
    ) => {
      let created = 0;
      let updated = 0;
      setSoldSolutions((prev) => {
        let next = [...prev];
        created = 0;
        updated = 0;
        for (const row of rows) {
          if (!row.accountId || !row.solutionId) continue;
          let resolvedId: string;
          if (row.action === "update" && row.id) {
            resolvedId = row.id;
          } else if (row.externalKey?.trim()) {
            resolvedId = idFromExternalKey(row.externalKey);
          } else {
            resolvedId = uid();
          }
          const directionIds = [...new Set(row.directionIds.filter(Boolean))];
          const line = normalizeSoldSolution({
            id: resolvedId,
            solutionId: row.solutionId,
            accountId: row.accountId,
            directionId: directionIds[0] ?? null,
            directionIds,
            moduleIds: row.moduleIds,
            currency: "EUR",
            billedAmount: Math.max(0, row.billedAmount),
          });
          const idx = next.findIndex((s) => s.id === line.id);
          if (idx >= 0) {
            next[idx] = line;
            updated += 1;
          } else {
            next.push(line);
            created += 1;
          }
        }
        persistLocal(next);
        const id = orgIdRef.current;
        if (id && supabase && (created > 0 || updated > 0)) {
          void upsertSoldSolutionsRemote(id, next).catch((err) =>
            logSyncError("importSoldSolutions", err),
          );
        }
        return next;
      });
      return { created, updated };
    },
    [],
  );

  const resetSales = useCallback(() => {
    commit(structuredClone(defaultSoldSolutions).map(normalizeSoldSolution));
  }, [commit]);

  const value = useMemo(
    () => ({
      soldSolutions,
      upsertSoldSolution,
      removeSoldSolution,
      importSoldSolutionsBatch,
      resetSales,
    }),
    [
      soldSolutions,
      upsertSoldSolution,
      removeSoldSolution,
      importSoldSolutionsBatch,
      resetSales,
    ],
  );

  return (
    <SalesContext.Provider value={value}>{children}</SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error("useSales must be used within SalesProvider");
  return ctx;
}
