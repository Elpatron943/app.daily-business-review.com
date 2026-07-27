import {
  buildPlanProgressBars,
  formatCompactEur,
  type OpportunityMapModel,
  type ProgressBar,
} from "./accountPlans/opportunityMap";
import type { AccountPlan } from "./accountPlans/AccountPlanContext";

export default function OpportunityMapPanel({
  plan,
  map,
  dealTarget = 0,
  title = "Account Plan Overview",
  readOnly = false,
}: {
  plan?: AccountPlan | null;
  map: OpportunityMapModel;
  /** Cumul des montants des opportunités du plan. */
  dealTarget?: number;
  title?: string;
  readOnly?: boolean;
}) {
  const bars = plan
    ? buildPlanProgressBars(plan, map.summary, dealTarget)
    : summaryBars(map.summary);
  const maxStack = Math.max(
    ...bars.map((b) => b.won + b.up + b.renewal + b.cross),
    ...bars.map((b) => b.plan),
    1,
  );
  const showPlan = Boolean(plan) && !readOnly;

  return (
    <section className="opp-map-panel" aria-label="Opportunity Map">
      <header className="opp-map-head">
        <h3>{title}</h3>
        <ul className="opp-map-legend">
          <li>
            <i className="won" /> Won
          </li>
          <li>
            <i className="up" /> Upsell
          </li>
          <li>
            <i className="renewal" /> Renouvellement
          </li>
          <li>
            <i className="cross" /> Cross-sell
          </li>
          {showPlan && (
            <li>
              <i className="plan" /> Plan
            </li>
          )}
        </ul>
      </header>

      <div className="opp-map-chart" role="img" aria-label="Progression">
        {bars.map((bar) => (
          <ProgressColumn
            key={bar.id}
            bar={bar}
            max={maxStack}
            showPlan={showPlan}
          />
        ))}
      </div>

      <div className="opp-map-table-wrap">
        <table className="opp-map-table">
          <thead>
            <tr>
              <th scope="col" />
              {map.columns.map((c) => (
                <th key={c.id} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {map.rows.map((row) => (
              <tr key={row.key} className={`row-${row.key}`}>
                <th scope="row">{row.label}</th>
                {map.columns.map((c) => {
                  const cell = row.cells[c.id] ?? { amount: 0, count: 0 };
                  return (
                    <td key={c.id}>
                      {cell.amount > 0 ? (
                        <span className="opp-map-cell">
                          {formatCompactEur(cell.amount)}
                          <em className={`badge-${row.key}`}>{cell.count}</em>
                        </span>
                      ) : (
                        <span className="opp-map-empty">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {map.columns.map((c) => (
                <td key={c.id}>
                  <strong>{formatCompactEur(map.totals[c.id] ?? 0)}</strong>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function summaryBars(
  summary: OpportunityMapModel["summary"],
): ProgressBar[] {
  const labels = ["T1", "T2", "T3", "T4"];
  return labels.map((label, i) => ({
    id: `q-${i}`,
    label,
    won: summary.won,
    up: summary.up,
    renewal: summary.renewal,
    cross: summary.cross,
    plan: 0,
  }));
}

function ProgressColumn({
  bar,
  max,
  showPlan,
}: {
  bar: ProgressBar;
  max: number;
  showPlan: boolean;
}) {
  const h = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  const planTop = `${100 - (bar.plan / max) * 100}%`;

  return (
    <div className="opp-map-col">
      <div className="opp-map-col-plot">
        <div className="opp-map-stack">
          <span className="seg won" style={{ height: h(bar.won) }} />
          <span className="seg up" style={{ height: h(bar.up) }} />
          <span className="seg renewal" style={{ height: h(bar.renewal) }} />
          <span className="seg cross" style={{ height: h(bar.cross) }} />
        </div>
        {showPlan && bar.plan > 0 && (
          <div
            className="opp-map-plan-line"
            style={{ top: planTop }}
            title={`Plan ${formatCompactEur(bar.plan)}`}
          />
        )}
      </div>
      <span className="opp-map-col-label">{bar.label}</span>
    </div>
  );
}
