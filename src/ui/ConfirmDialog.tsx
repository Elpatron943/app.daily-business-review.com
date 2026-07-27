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

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style destructif (désactiver / réinitialiser). */
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

type ConfirmContextValue = {
  confirm: ConfirmFn;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type Pending = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

function normalizeOptions(opts: ConfirmOptions | string): ConfirmOptions {
  if (typeof opts === "string") return { message: opts, danger: true };
  return opts;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const close = useCallback((value: boolean) => {
    const cur = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    cur?.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      const next: Pending = {
        options: normalizeOptions(opts),
        resolve,
      };
      // Remplace une éventuelle demande précédente
      pendingRef.current?.resolve(false);
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  const o = pending?.options;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && o ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => close(false)}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-dialog-title" className="confirm-dialog-title">
              {o.title ?? "Confirmation"}
            </h2>
            <p id="confirm-dialog-desc" className="confirm-dialog-message">
              {o.message}
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => close(false)}
                autoFocus
              >
                {o.cancelLabel ?? "Annuler"}
              </button>
              <button
                type="button"
                className={o.danger === false ? "primary-cta" : "danger"}
                onClick={() => close(true)}
              >
                {o.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}
