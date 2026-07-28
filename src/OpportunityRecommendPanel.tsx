import { useEffect, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  useOpportunities,
  type Opportunity,
} from "./opportunities/OpportunityContext";
import { BriefMarkdown } from "./research/BriefMarkdown";
import {
  checkOpenAiStatus,
  runOpportunityAnalysis,
  type OpenAiStatus,
} from "./research/openaiClient";

type Props = {
  opportunity: Opportunity;
};

export default function OpportunityRecommendPanel({ opportunity }: Props) {
  const { config, activeContactTypes, activeDirections } = useOrgConfig();
  const { activeContacts, activeAccounts } = useDomain();
  const { updateOpportunity } = useOpportunities();
  const [status, setStatus] = useState<OpenAiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkOpenAiStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const account =
    activeAccounts.find((a) => a.id === opportunity.primaryAccountId) ?? null;
  const holdingName = account?.holdingId
    ? (activeAccounts.find((a) => a.id === account.holdingId)?.name ?? null)
    : null;

  const canRun =
    Boolean(status?.available && status.configured) && !loading;

  async function handleRun() {
    setError(null);
    setLoading(true);
    try {
      const result = await runOpportunityAnalysis({
        config,
        opportunity,
        account,
        holdingName,
        contacts: activeContacts,
        contactTypes: activeContactTypes,
        directions: activeDirections,
      });
      updateOpportunity(opportunity.id, {
        aiRecommendations: {
          updatedAt: result.updatedAt,
          content: result.content,
          model: result.model,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec de l’analyse ChatGPT",
      );
    } finally {
      setLoading(false);
    }
  }

  const recos = opportunity.aiRecommendations ?? null;

  return (
    <section className="entry-subsection opp-recommend">
      <div className="opp-recommend-head">
        <div>
          <h2>Recommandations IA</h2>
        </div>
        <button
          type="button"
          className="primary-cta"
          disabled={!canRun}
          onClick={handleRun}
        >
          {loading ? "Analyse…" : "Analyser avec ChatGPT"}
        </button>
      </div>

      {status && !status.configured && (
        <p className="muted warn-hint">
          L’analyse IA n’est pas encore configurée. Contacte ton
          administrateur.
        </p>
      )}
      {status && status.available === false && (
        <p className="muted warn-hint">
          L’analyse IA est temporairement indisponible. Réessaie plus tard.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      {recos ? (
        <article className="opp-recommend-body">
          <p className="muted settings-hint">
            Mis à jour le{" "}
            {new Date(recos.updatedAt).toLocaleString("fr-FR")}
          </p>
          <BriefMarkdown text={recos.content} />
        </article>
      ) : (
        <p className="muted">Aucune recommandation.</p>
      )}
    </section>
  );
}
