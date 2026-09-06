import type { DualNumber } from "./opportunities/OpportunityContext";

export function formatWhyNowNum(n: number) {
  if (!Number.isFinite(n) || n === 0) return "0";
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(n);
}

export function dualInputValue(
  d: DualNumber | undefined,
  side: keyof DualNumber,
): number | "" {
  const v = d?.[side];
  return v === undefined || v === 0 ? "" : v;
}

export function DualField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: DualNumber;
  onChange: (side: keyof DualNumber, raw: string) => void;
}) {
  return (
    <div className="opp-whynow-dual-field">
      <span className="opp-whynow-dual-label">
        {label}
        {hint ? <em className="muted">{hint}</em> : null}
      </span>
      <div className="opp-whynow-dual-inputs">
        <label>
          Prospect
          <input
            type="number"
            min={0}
            step="any"
            value={dualInputValue(value, "prospect")}
            placeholder="0"
            onChange={(e) => onChange("prospect", e.target.value)}
          />
        </label>
        <label>
          Hypothèse
          <input
            type="number"
            min={0}
            step="any"
            value={dualInputValue(value, "seller")}
            placeholder="0"
            onChange={(e) => onChange("seller", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

export function MetricDual({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = "any" as number | "any",
}: {
  label: string;
  value: DualNumber;
  onChange: (side: keyof DualNumber, raw: string) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <div className="opp-whynow-metric">
      <span>{label}</span>
      <div className="opp-whynow-dual-inputs">
        <label>
          P
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={dualInputValue(value, "prospect")}
            placeholder="0"
            onChange={(e) => onChange("prospect", e.target.value)}
            aria-label={`${label} prospect`}
          />
        </label>
        <label>
          H
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={dualInputValue(value, "seller")}
            placeholder="0"
            onChange={(e) => onChange("seller", e.target.value)}
            aria-label={`${label} hypothèse vendeur`}
          />
        </label>
      </div>
    </div>
  );
}
