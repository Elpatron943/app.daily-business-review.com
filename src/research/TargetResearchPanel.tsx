import { useEffect, useMemo, useState } from "react";
import { useOrgConfig } from "../config/ConfigContext";
import { useDomain } from "../domain/DomainContext";
import type {
  Account,
  ResearchPressItem,
  ResearchSuggestedPersona,
} from "../data";
import {
  useOpportunities,
  type Opportunity,
} from "../opportunities/OpportunityContext";
import { BriefMarkdown } from "./BriefMarkdown";
import {
  checkResearchStatus,
  runTargetResearch,
  type ResearchStatus,
} from "./perplexityClient";

type Props = {
  account: Account;
  opportunity?: Opportunity | null;
  compact?: boolean;
};

function personaKey(p: { name: string; title: string }) {
  return `${p.name.trim().toLowerCase()}|${p.title.trim().toLowerCase()}`;
}

function resolveRoleId(
  persona: ResearchSuggestedPersona,
  contactTypes: { id: string; label: string; active?: boolean }[],
): string {
  const active = contactTypes.filter((t) => t.active !== false);
  if (
    persona.suggestedRoleId &&
    active.some((t) => t.id === persona.suggestedRoleId)
  ) {
    return persona.suggestedRoleId;
  }
  const label = (persona.suggestedRoleLabel || "").toLowerCase();
  const title = (persona.title || "").toLowerCase();
  const hay = `${label} ${title}`;
  const guess = (re: RegExp, id: string) =>
    re.test(hay) && active.some((t) => t.id === id) ? id : null;
  return (
    guess(/economic|cfo|ceo|dg|directeur général|finance/i, "EconomicBuyer") ||
    guess(/champion|sponsor|vp|svp/i, "Champion") ||
    guess(/procure|achat|purchas/i, "Procurement") ||
    guess(/block|oppos/i, "Blocker") ||
    guess(/user|manager|ops/i, "User") ||
    guess(/influ|cto|cio|it |tech/i, "Influencer") ||
    active[0]?.id ||
    "Influencer"
  );
}

function resolveDirectionId(
  persona: ResearchSuggestedPersona,
  directions: { id: string; name: string; active?: boolean }[],
): string {
  const active = directions.filter((d) => d.active !== false);
  const hint = (persona.directionHint || "").toLowerCase();
  if (hint) {
    const hit = active.find(
      (d) =>
        d.name.toLowerCase().includes(hint) ||
        hint.includes(d.name.toLowerCase()),
    );
    if (hit) return hit.id;
  }
  const title = (persona.title || "").toLowerCase();
  const byTitle = active.find((d) => {
    const n = d.name.toLowerCase();
    if (/fin|cfo|achat|procure/.test(title) && /fin/.test(n)) return true;
    if (/it|cio|cto|tech|digital/.test(title) && /it|tech|digital/.test(n))
      return true;
    if (/ops|operation/.test(title) && /ops|opération/.test(n)) return true;
    return false;
  });
  return byTitle?.id ?? active[0]?.id ?? "";
}

export default function TargetResearchPanel({
  account,
  opportunity = null,
  compact = false,
}: Props) {
  const {
    activeResearchCriteria,
    activeCompellingEvents,
    activeContactTypes,
    activeDirections,
    config,
  } = useOrgConfig();
  const {
    upsertAccount,
    upsertContact,
    activeAccounts,
    activeContacts,
  } = useDomain();
  const { updateOpportunity } = useOpportunities();
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const holdingName = useMemo(() => {
    if (!account.holdingId) return null;
    return (
      activeAccounts.find((a) => a.id === account.holdingId)?.name ?? null
    );
  }, [account.holdingId, activeAccounts]);

  const ceById = useMemo(() => {
    const map = new Map(
      (config.compellingEvents ?? []).map((c) => [c.id, c]),
    );
    return map;
  }, [config.compellingEvents]);

  const existingByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of activeContacts) {
      if (c.accountId !== account.id) continue;
      map.set(personaKey(c), c.id);
    }
    return map;
  }, [activeContacts, account.id]);

  useEffect(() => {
    let cancelled = false;
    checkResearchStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedIds(activeResearchCriteria.map((c) => c.id));
  }, [activeResearchCriteria]);

  const selectedCriteria = useMemo(
    () => activeResearchCriteria.filter((c) => selectedIds.includes(c.id)),
    [activeResearchCriteria, selectedIds],
  );

  const brief = account.researchBrief ?? null;
  const personas = brief?.suggestedPersonas ?? [];
  const canRun =
    Boolean(status?.available && status.configured) &&
    selectedCriteria.length > 0 &&
    !loading;

  async function handleRun() {
    setError(null);
    setFlash(null);
    setLoading(true);
    try {
      const next = await runTargetResearch({
        account,
        criteria: selectedCriteria,
        compellingEvents: activeCompellingEvents,
        contactTypes: activeContactTypes,
        orgProfile: config.orgProfile,
        opportunity,
        holdingName,
      });
      upsertAccount({ ...account, researchBrief: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la recherche");
    } finally {
      setLoading(false);
    }
  }

  function toggleCriterion(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function createPersona(persona: ResearchSuggestedPersona, mapToOpp: boolean) {
    setFlash(null);
    const contactId = ensureContact(persona);
    if (!contactId) return;

    if (mapToOpp && opportunity) {
      const stakeholders = [...(opportunity.stakeholders ?? [])];
      if (!stakeholders.some((s) => s.contactId === contactId)) {
        stakeholders.push(stakeFromPersona(persona, contactId));
        updateOpportunity(opportunity.id, { stakeholders });
      }
      setFlash(
        `« ${persona.name} » créé et mappé sur « ${opportunity.name} ».`,
      );
    } else {
      setFlash(`Contact « ${persona.name} » créé.`);
    }
  }

  function ensureContact(persona: ResearchSuggestedPersona): string | null {
    const key = personaKey(persona);
    const existing = existingByKey.get(key);
    if (existing) return existing;
    const directionId = resolveDirectionId(persona, activeDirections);
    if (!directionId) {
      setError("Aucune direction catalogue — crée-en dans Settings.");
      return null;
    }
    return upsertContact({
      name: persona.name,
      title: persona.title,
      accountId: account.id,
      directionId,
    });
  }

  function stakeFromPersona(
    persona: ResearchSuggestedPersona,
    contactId: string,
  ) {
    return {
      contactId,
      role: resolveRoleId(persona, activeContactTypes),
      status: "Identified" as const,
      notes: [
        persona.whyRelevant,
        persona.sourceHint ? `Source : ${persona.sourceHint}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  function createAll(mapToOpp: boolean) {
    setError(null);
    const pairs: { persona: ResearchSuggestedPersona; contactId: string }[] =
      [];
    for (const p of personas) {
      const id = ensureContact(p);
      if (id) pairs.push({ persona: p, contactId: id });
    }
    if (mapToOpp && opportunity) {
      const stakeholders = [...(opportunity.stakeholders ?? [])];
      const have = new Set(stakeholders.map((s) => s.contactId));
      for (const { persona, contactId } of pairs) {
        if (have.has(contactId)) continue;
        have.add(contactId);
        stakeholders.push(stakeFromPersona(persona, contactId));
      }
      updateOpportunity(opportunity.id, { stakeholders });
      setFlash(
        `${pairs.length} persona(s) traitée(s) et mappées sur l’opp.`,
      );
    } else {
      setFlash(`${pairs.length} persona(s) traitée(s).`);
    }
  }

  return (
    <section
      className={`target-research${compact ? " is-compact" : ""}`}
      aria-label="Recherche cible"
    >
      {!compact && (
        <header className="target-research-head">
          <h2>Recherche cible</h2>
        </header>
      )}

      {status && !status.available && (
        <p className="target-research-banner warn">
          Proxy indisponible. Lance l’app avec <code>npm run dev</code>.
        </p>
      )}
      {status?.available && !status.configured && (
        <p className="target-research-banner warn">
          Clé absente. Ajoute <code>PERPLEXITY_API_KEY</code> dans{" "}
          <code>.env.local</code> puis relance le serveur.
        </p>
      )}

      {activeResearchCriteria.length === 0 ? (
        <p className="muted">Aucun critère actif.</p>
      ) : (
        <ul className="target-research-criteria">
          {activeResearchCriteria.map((c) => (
            <li key={c.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggleCriterion(c.id)}
                />
                <span>
                  <strong>{c.label}</strong>
                  {c.hint ? <em>{c.hint}</em> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="target-research-actions">
        <button
          type="button"
          className="primary-cta"
          disabled={!canRun}
          onClick={() => void handleRun()}
        >
          {loading ? "Recherche…" : "Lancer la recherche"}
        </button>
        {brief?.updatedAt && (
          <span className="muted">Dernier brief · {brief.updatedAt}</span>
        )}
      </div>

      {error && <p className="target-research-error">{error}</p>}
      {flash && <p className="target-research-flash">{flash}</p>}

      {brief?.content ||
      (brief &&
        (brief.positivePress?.length ||
          brief.negativePress?.length ||
          brief.suggestedPersonas?.length ||
          brief.relevanceScore != null)) ? (
        <article className="target-research-brief">
          <header className="target-research-brief-head">
            <div>
              <h3>Brief</h3>
              <p className="muted">{brief?.querySummary}</p>
            </div>
            {brief?.relevanceScore != null && (
              <div
                className={`target-research-score band-${scoreBand(brief.relevanceScore)}`}
                title="Pertinence sales du brief"
              >
                <span>Pertinence</span>
                <strong>{brief.relevanceScore}</strong>
              </div>
            )}
          </header>

          {personas.length > 0 && (
            <div className="target-research-personas">
              <div className="target-research-personas-head">
                <h4>
                  Personas suggérées{" "}
                  <span className="muted">({personas.length})</span>
                </h4>
                <div className="target-research-personas-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => createAll(false)}
                  >
                    Créer tous les contacts
                  </button>
                  {opportunity && (
                    <button
                      type="button"
                      className="primary-cta"
                      onClick={() => createAll(true)}
                    >
                      Créer + mapper sur l’opp
                    </button>
                  )}
                </div>
              </div>
              <ul className="persona-suggest-list">
                {personas.map((p) => {
                  const key = personaKey(p);
                  const exists = existingByKey.has(key);
                  const mapped =
                    opportunity?.stakeholders?.some(
                      (s) => s.contactId === existingByKey.get(key),
                    ) ?? false;
                  const roleId = resolveRoleId(p, activeContactTypes);
                  const roleLabel =
                    activeContactTypes.find((t) => t.id === roleId)?.label ??
                    p.suggestedRoleLabel ??
                    roleId;
                  return (
                    <li key={key} className="persona-suggest-card">
                      <div className="persona-suggest-who">
                        <strong>{p.name}</strong>
                        <span>
                          {p.title}
                          {p.directionHint ? ` · ${p.directionHint}` : ""}
                        </span>
                        <em>
                          {roleLabel}
                          {p.confidence != null
                            ? ` · confiance ${p.confidence}%`
                            : ""}
                        </em>
                        {p.whyRelevant ? <p>{p.whyRelevant}</p> : null}
                        {p.sourceHint ? (
                          <span className="muted">Source : {p.sourceHint}</span>
                        ) : null}
                      </div>
                      <div className="persona-suggest-btns">
                        {exists ? (
                          <span className="muted">Déjà en contacts</span>
                        ) : (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => createPersona(p, false)}
                          >
                            Créer contact
                          </button>
                        )}
                        {opportunity && !mapped && (
                          <button
                            type="button"
                            className="primary-cta"
                            onClick={() => createPersona(p, true)}
                          >
                            {exists ? "Mapper sur l’opp" : "Créer + mapper"}
                          </button>
                        )}
                        {mapped && (
                          <span className="muted">Mappé sur l’opp</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {brief?.matchedCompellingEventIds &&
            brief.matchedCompellingEventIds.length > 0 && (
              <div className="target-research-ce-match">
                <h4>CE catalogue matchés</h4>
                <ul>
                  {brief.matchedCompellingEventIds.map((id) => (
                    <li key={id}>
                      <strong>{ceById.get(id)?.label ?? id}</strong>
                      {ceById.get(id)?.description ? (
                        <span className="muted">
                          {" "}
                          — {ceById.get(id)!.description}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {(brief?.positivePress?.length || brief?.negativePress?.length) ? (
            <div className="target-research-press">
              <PressColumn
                title="Presse positive"
                tone="positive"
                items={brief?.positivePress ?? []}
              />
              <PressColumn
                title="Presse négative"
                tone="negative"
                items={brief?.negativePress ?? []}
              />
            </div>
          ) : null}

          {brief?.content ? (
            <div className="target-research-content">
              <BriefMarkdown text={brief.content} />
            </div>
          ) : null}

          {brief && brief.citations.length > 0 && (
            <footer>
              <h4>Citations</h4>
              <ul className="target-research-citations">
                {brief.citations.map((c) => (
                  <li key={c.url}>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.title || c.url}
                    </a>
                  </li>
                ))}
              </ul>
            </footer>
          )}
        </article>
      ) : (
        !loading && (
          <p className="muted">Aucun brief.</p>
        )
      )}
    </section>
  );
}

function PressColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "positive" | "negative";
  items: ResearchPressItem[];
}) {
  return (
    <div className={`press-col press-${tone}`}>
      <h4>
        {title}{" "}
        <span className="muted">({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <ul>
          {items.map((item, i) => (
            <li key={`${item.title}-${i}`}>
              <div className="press-item-head">
                <strong>{item.title}</strong>
                <em>{item.relevance}/100</em>
              </div>
              {item.date ? (
                <span className="muted press-date">{item.date}</span>
              ) : null}
              {item.summary ? <p>{item.summary}</p> : null}
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer">
                  Source
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function scoreBand(score: number): "ok" | "warn" | "risk" {
  if (score >= 70) return "ok";
  if (score >= 40) return "warn";
  return "risk";
}
