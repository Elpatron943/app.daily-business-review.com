import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type SoldSolution, defaultSoldSolutions, normalizeSoldSolution } from "../data";

const SALES_STORAGE_KEY = "powermap.soldSolutions.v1";

function loadSales(): SoldSolution[] {
  try {
    const raw = localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return structuredClone(defaultSoldSolutions).map(normalizeSoldSolution);
    const parsed = JSON.parse(raw) as SoldSolution[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return structuredClone(defaultSoldSolutions).map(normalizeSoldSolution);
    }
    return parsed.map(normalizeSoldSolution);
  } catch {
    return structuredClone(defaultSoldSolutions).map(normalizeSoldSolution);
  }
}

function persist(lines: SoldSolution[]) {
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
  resetSales: () => void;
};

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesProvider({ children }: { children: ReactNode }) {
  const [soldSolutions, setSoldSolutions] = useState<SoldSolution[]>(() =>
    loadSales(),
  );

  const commit = useCallback((next: SoldSolution[]) => {
    setSoldSolutions(next);
    persist(next);
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
        persist(next);
        return next;
      });
    },
    [],
  );

  const removeSoldSolution = useCallback((id: string) => {
    setSoldSolutions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const resetSales = useCallback(() => {
    commit(structuredClone(defaultSoldSolutions));
  }, [commit]);

  const value = useMemo(
    () => ({
      soldSolutions,
      upsertSoldSolution,
      removeSoldSolution,
      resetSales,
    }),
    [soldSolutions, upsertSoldSolution, removeSoldSolution, resetSales],
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
