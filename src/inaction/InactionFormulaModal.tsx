import { useEffect, useState } from "react";
import InactionFormulaEditor from "./InactionFormulaEditor";
import {
  emptyInactionFormula,
  formatInactionFormulaPreview,
  type InactionFormula,
} from "./formula";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  formula: InactionFormula | null | undefined;
  onClose: () => void;
  onSave: (formula: InactionFormula) => void;
};

/**
 * Modal d’édition de formule CoI (Settings + deal).
 */
export default function InactionFormulaModal({
  open,
  title,
  subtitle,
  formula,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<InactionFormula>(emptyInactionFormula());

  useEffect(() => {
    if (!open) return;
    setDraft(
      formula?.enabled || (formula?.inputs?.length ?? 0) > 0
        ? {
            enabled: formula?.enabled ?? false,
            inputs: formula?.inputs?.length
              ? formula.inputs
              : emptyInactionFormula().inputs,
            operators: formula?.operators ?? [],
          }
        : emptyInactionFormula(),
    );
  }, [open, formula]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="confirm-overlay inaction-formula-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="inaction-formula-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inaction-formula-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="inaction-formula-dialog-head">
          <div>
            <h2 id="inaction-formula-dialog-title">{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
            <p className="muted inaction-formula-preview">
              Aperçu : {formatInactionFormulaPreview(draft)}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="inaction-formula-dialog-body">
          <InactionFormulaEditor formula={draft} onChange={setDraft} />
        </div>

        <footer className="inaction-formula-dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="primary-cta"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Enregistrer le calcul
          </button>
        </footer>
      </div>
    </div>
  );
}
