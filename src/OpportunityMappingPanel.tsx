import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  OPP_MAPPING_CATEGORIES,
  OPP_MAPPING_SWOT_ORDER,
  type OppMappingCardEntry,
  type OppMappingCategory,
  type OppMappingSubtypeDef,
} from "./config/types";
import { OPP_MAPPING_THEMES, resolveThemeLabel, COMPELLING_EVENT_MAPPING_ID } from "./config/oppMappingLibrary";
import { useOrgConfig } from "./config/ConfigContext";
import type { Opportunity } from "./opportunities/OpportunityContext";
import {
  computeMappingScorecard,
  ensureRequiredMappingChecks,
  mappingMissingRequired,
  mappingWeightsFromSubtypes,
} from "./opportunities/mappingScore";
import {
  collectOpportunityUsps,
  parseUspCardId,
  resolveUspCardLabel,
} from "./catalogue/uspCards";

type Props = {
  opportunity: Opportunity;
  onUpdate: (patch: Partial<Opportunity>) => void;
};

const CAT_BY_ID = Object.fromEntries(
  OPP_MAPPING_CATEGORIES.map((c) => [c.id, c]),
) as Record<OppMappingCategory, (typeof OPP_MAPPING_CATEGORIES)[number]>;

export default function OpportunityMappingPanel({
  opportunity,
  onUpdate,
}: Props) {
  const {
    activeOppMappingSubtypes,
    activeOppMappingThemes,
    activeCompellingEvents,
    addOppMappingSubtype,
    config,
  } = useOrgConfig();
  const [libraryFor, setLibraryFor] = useState<OppMappingCategory | null>(
    null,
  );
  const [managingCards, setManagingCards] = useState(false);
  const [themeFilter, setThemeFilter] = useState<string>("all");
  const [drafts, setDrafts] = useState<Record<OppMappingCategory, string>>({
    objectif: "",
    risques: "",
    signaux_positifs: "",
    initiatives: "",
  });

  const byId = useMemo(() => {
    const map = new Map<string, OppMappingSubtypeDef>();
    for (const s of activeOppMappingSubtypes) map.set(s.id, s);
    return map;
  }, [activeOppMappingSubtypes]);

  const requiredIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of activeOppMappingSubtypes) {
      if (s.required === true) set.add(s.id);
    }
    return set;
  }, [activeOppMappingSubtypes]);

  useEffect(() => {
    if (
      !mappingMissingRequired(
        opportunity.mappingChecks,
        activeOppMappingSubtypes,
      )
    ) {
      return;
    }
    onUpdate({
      mappingChecks: ensureRequiredMappingChecks(
        opportunity.mappingChecks,
        activeOppMappingSubtypes,
      ),
    });
    // onUpdate est recréé à chaque render du parent ; on se base sur id + checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.id, opportunity.mappingChecks, activeOppMappingSubtypes]);

  const opportunityUsps = useMemo(
    () =>
      collectOpportunityUsps(
        opportunity,
        config.solutions,
        config.orgProfile,
      ),
    [opportunity, config.solutions, config.orgProfile],
  );

  const themeCatalog = useMemo(() => {
    const fromConfig = config.oppMappingThemes ?? activeOppMappingThemes;
    const map = new Map(fromConfig.map((t) => [t.id, t.label]));
    for (const t of OPP_MAPPING_THEMES) {
      if (!map.has(t.id)) map.set(t.id, t.label);
    }
    return map;
  }, [config.oppMappingThemes, activeOppMappingThemes]);

  function resolveCardMeta(cardId: string): {
    label: string;
    theme?: string;
    themeLabel?: string;
  } {
    const subtype = byId.get(cardId);
    if (subtype) {
      const theme = subtype.theme ?? "custom";
      return {
        label: subtype.label,
        theme,
        themeLabel:
          themeCatalog.get(theme) ??
          resolveThemeLabel(theme, config.oppMappingThemes ?? []),
      };
    }
    if (parseUspCardId(cardId)) {
      const usp = resolveUspCardLabel(
        cardId,
        config.solutions,
        config.orgProfile,
      );
      return {
        label: usp?.label ?? cardId,
        theme: "usp",
        themeLabel: usp?.sourceLabel
          ? `USP · ${usp.sourceLabel}`
          : "USP",
      };
    }
    return { label: cardId };
  }

  const libraryItems = useMemo(() => {
    if (!libraryFor) return [];
    if (themeFilter === "usp") return [];
    return activeOppMappingSubtypes
      .filter((s) => s.category === libraryFor)
      .filter((s) => themeFilter === "all" || s.theme === themeFilter)
      .sort((a, b) => {
        const ta = a.theme ?? "custom";
        const tb = b.theme ?? "custom";
        if (ta !== tb) return ta.localeCompare(tb);
        return a.order - b.order || a.label.localeCompare(b.label, "fr");
      });
  }, [activeOppMappingSubtypes, libraryFor, themeFilter]);

  const showUspsInLibrary =
    libraryFor === "signaux_positifs" &&
    (themeFilter === "all" || themeFilter === "usp");

  function entriesOf(category: OppMappingCategory): OppMappingCardEntry[] {
    return opportunity.mappingChecks?.[category] ?? [];
  }

  function setEntries(
    category: OppMappingCategory,
    entries: OppMappingCardEntry[],
  ) {
    onUpdate({
      mappingChecks: {
        ...opportunity.mappingChecks,
        [category]: entries,
      },
    });
  }

  function addCard(category: OppMappingCategory, subtypeId: string) {
    const current = entriesOf(category);
    if (current.some((e) => e.id === subtypeId)) return;
    setEntries(category, [
      ...current,
      { id: subtypeId, status: "open" },
    ]);
  }

  function removeCard(category: OppMappingCategory, subtypeId: string) {
    if (requiredIds.has(subtypeId)) return;
    setEntries(
      category,
      entriesOf(category).filter((e) => e.id !== subtypeId),
    );
  }

  function clearQuadrant(category: OppMappingCategory) {
    setEntries(
      category,
      entriesOf(category).filter((e) => requiredIds.has(e.id)),
    );
  }

  function patchCard(
    category: OppMappingCategory,
    subtypeId: string,
    patch: Partial<Pick<OppMappingCardEntry, "status" | "comment">>,
  ) {
    setEntries(
      category,
      entriesOf(category).map((e) =>
        e.id === subtypeId
          ? {
              ...e,
              ...patch,
              comment:
                patch.comment !== undefined
                  ? patch.comment.trim() || undefined
                  : e.comment,
            }
          : e,
      ),
    );
  }

  function setStatus(
    category: OppMappingCategory,
    subtypeId: string,
    status: OppMappingCardEntry["status"],
  ) {
    const current = entriesOf(category).find((e) => e.id === subtypeId);
    patchCard(category, subtypeId, {
      status: current?.status === status ? "open" : status,
    });
  }

  function handleAddManual(category: OppMappingCategory, e: FormEvent) {
    e.preventDefault();
    const label = drafts[category].trim();
    if (!label) return;
    const id = addOppMappingSubtype(category, label);
    if (id) addCard(category, id);
    setDrafts((d) => ({ ...d, [category]: "" }));
  }

  const allSelectedCards = useMemo(() => {
    const checks = opportunity.mappingChecks ?? {};
    return OPP_MAPPING_SWOT_ORDER.flatMap((catId) =>
      (checks[catId] ?? []).map((entry) => {
        const meta = resolveCardMeta(entry.id);
        return {
          category: catId,
          entry,
          label: meta.label,
          theme: meta.theme,
          themeLabel: meta.themeLabel,
        };
      }),
    );
    // resolveCardMeta depends on byId + config
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.mappingChecks, byId, config.solutions, config.orgProfile]);

  const scorecard = useMemo(() => {
    const weights = mappingWeightsFromSubtypes(config.oppMappingSubtypes ?? []);
    return computeMappingScorecard(opportunity.mappingChecks, weights);
  }, [opportunity.mappingChecks, config.oppMappingSubtypes]);

  const themesForPicker = useMemo(() => {
    const used = new Set(
      libraryItems.map((s) => s.theme ?? "custom").filter(Boolean),
    );
    const themes = activeOppMappingThemes
      .filter((t) => used.has(t.id) || t.id === "custom")
      .map((t) => ({ id: t.id, label: t.label }));
    for (const id of used) {
      if (!themes.some((t) => t.id === id)) {
        themes.push({
          id,
          label: themeCatalog.get(id) ?? id,
        });
      }
    }
    if (
      libraryFor === "signaux_positifs" &&
      opportunityUsps.length > 0 &&
      !themes.some((t) => t.id === "usp")
    ) {
      return [...themes, { id: "usp", label: "USP" }];
    }
    return themes;
  }, [
    libraryItems,
    libraryFor,
    opportunityUsps.length,
    activeOppMappingThemes,
    themeCatalog,
  ]);

  return (
    <section className="opp-mapping" aria-label="Opportunity Mapping SWOT">
      <header className="opp-mapping-head">
        <div className="opp-mapping-head-main">
          <h2>Opportunity Mapping · SWOT</h2>
          <p className="opp-mapping-legend-row" aria-label="Légende">
            <span className="opp-mapping-legend">
              <i className="leg-ok" aria-hidden /> Maîtrisé
            </span>
            <span className="opp-mapping-legend">
              <i className="leg-ko" aria-hidden /> Non maîtrisé
            </span>
          </p>
        </div>
        <button
          type="button"
          className={managingCards ? "primary-cta" : "ghost"}
          aria-pressed={managingCards}
          onClick={() => {
            setLibraryFor(null);
            setManagingCards((v) => !v);
          }}
        >
          {managingCards ? "Terminer" : "Gérer les cartes"}
        </button>
      </header>

      <section className="opp-mapping-scorecard" aria-label="Scorecard SWOT">
        <div className="opp-mapping-score-summary">
          <div>
            <span className="opp-mapping-score-label">État des lieux</span>
            <strong>
              {scorecard.total} carte{scorecard.total !== 1 ? "s" : ""}
            </strong>
          </div>
          <div className="opp-mapping-score-kpis">
            <span className="score-kpi ok">
              <em>✓</em> {scorecard.covered} maîtrisée
              {scorecard.covered !== 1 ? "s" : ""}
            </span>
            <span className="score-kpi ko">
              <em>✗</em> {scorecard.notMastered} non maîtrisée
              {scorecard.notMastered !== 1 ? "s" : ""}
            </span>
            <span className="score-kpi open">
              <em>○</em> {scorecard.open} à traiter
            </span>
            <span
              className={`score-kpi pct${
                scorecard.masteryPct === null
                  ? ""
                  : scorecard.masteryPct >= 60
                    ? " ok"
                    : " ko"
              }`}
            >
              Maîtrise{" "}
              <strong>
                {scorecard.masteryPct === null
                  ? "—"
                  : `${scorecard.masteryPct}%`}
              </strong>
            </span>
          </div>
        </div>

        <ul className="opp-mapping-score-grid">
          {scorecard.quads.map((q) => {
            const coveredW =
              q.total > 0 ? (q.covered / q.total) * 100 : 0;
            const gapW =
              q.total > 0 ? (q.notMastered / q.total) * 100 : 0;
            const openW = q.total > 0 ? (q.open / q.total) * 100 : 0;
            return (
              <li
                key={q.catId}
                className={`opp-mapping-score-quad swot-${q.swot.toLowerCase()}`}
              >
                <header>
                  <span className="opp-mapping-swot-letter" aria-hidden>
                    {q.swot}
                  </span>
                  <div>
                    <strong>{q.label}</strong>
                    <span className="muted">{q.subtitle}</span>
                  </div>
                  <span className="opp-mapping-score-quad-pct">
                    {q.masteryPct === null ? "—" : `${q.masteryPct}%`}
                  </span>
                </header>
                <div
                  className="opp-mapping-score-bar"
                  role="img"
                  aria-label={`${q.covered} maîtrisé, ${q.notMastered} non maîtrisé, ${q.open} à traiter`}
                >
                  {q.total === 0 ? (
                    <span className="bar-empty" />
                  ) : (
                    <>
                      <span
                        className="bar-ok"
                        style={{ width: `${coveredW}%` }}
                      />
                      <span
                        className="bar-ko"
                        style={{ width: `${gapW}%` }}
                      />
                      <span
                        className="bar-open"
                        style={{ width: `${openW}%` }}
                      />
                    </>
                  )}
                </div>
                <p className="opp-mapping-score-quad-meta">
                  <span className="ok">{q.covered} ✓</span>
                  <span className="ko">{q.notMastered} ✗</span>
                  <span className="open">{q.open} ○</span>
                  <span className="total">
                    {q.total} carte{q.total !== 1 ? "s" : ""}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="opp-mapping-swot" role="group" aria-label="Matrice SWOT">
        {OPP_MAPPING_SWOT_ORDER.map((catId) => {
          const cat = CAT_BY_ID[catId];
          const selected = entriesOf(catId);
          const coveredN = selected.filter((e) => e.status === "covered").length;
          const notMasteredN = selected.filter(
            (e) => e.status === "not_mastered",
          ).length;
          return (
            <article
              key={catId}
              className={`opp-mapping-col col-${catId} swot-${cat.swot.toLowerCase()}`}
            >
              <header className="opp-mapping-col-head">
                <div className="opp-mapping-swot-title">
                  <span className="opp-mapping-swot-letter" aria-hidden>
                    {cat.swot}
                  </span>
                  <div>
                    <h3>{cat.label}</h3>
                    <p className="opp-mapping-subtitle">{cat.subtitle}</p>
                  </div>
                </div>
                <span className="opp-mapping-count">
                  {selected.length} carte{selected.length > 1 ? "s" : ""}
                  {coveredN > 0
                    ? ` · ${coveredN} maîtrisée${coveredN > 1 ? "s" : ""}`
                    : ""}
                  {notMasteredN > 0
                    ? ` · ${notMasteredN} non maîtrisée${notMasteredN > 1 ? "s" : ""}`
                    : ""}
                </span>
              </header>

              <ul className="opp-mapping-cards">
                {selected.length === 0 ? (
                  <li className="opp-mapping-empty muted">Aucune carte</li>
                ) : (
                  selected.map((entry) => {
                    const meta = resolveCardMeta(entry.id);
                    const isRequired = requiredIds.has(entry.id);
                    return (
                      <li
                        key={entry.id}
                        className={`opp-mapping-chip status-${entry.status}${
                          meta.theme === "usp" ? " is-usp" : ""
                        }${isRequired ? " is-required" : ""}`}
                      >
                        <div className="opp-mapping-chip-main">
                          {meta.themeLabel && meta.theme !== "custom" ? (
                            <em>{meta.themeLabel}</em>
                          ) : null}
                          <strong>
                            {meta.label}
                            {isRequired ? (
                              <span
                                className="opp-mapping-required-badge"
                                title="Carte obligatoire"
                              >
                                Obligatoire
                              </span>
                            ) : null}
                          </strong>
                          {entry.id === COMPELLING_EVENT_MAPPING_ID &&
                          entry.status === "covered" ? (
                            <div className="opp-mapping-ce-pick">
                              <span className="opp-mapping-ce-pick-label">
                                Compelling events
                              </span>
                              {activeCompellingEvents.length === 0 ? (
                                <p className="muted">
                                  Aucun compelling event dans le catalogue.
                                </p>
                              ) : (
                                <ul className="opp-module-checks">
                                  {activeCompellingEvents.map((ce) => {
                                    const selected =
                                      opportunity.compellingEventIds?.includes(
                                        ce.id,
                                      ) ?? false;
                                    return (
                                      <li key={ce.id}>
                                        <label title={ce.description || undefined}>
                                          <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => {
                                              const cur =
                                                opportunity.compellingEventIds ??
                                                [];
                                              const next = selected
                                                ? cur.filter((id) => id !== ce.id)
                                                : [...cur, ce.id];
                                              onUpdate({
                                                compellingEventIds: next,
                                                mappingChecks: {
                                                  ...opportunity.mappingChecks,
                                                  [catId]: (
                                                    opportunity.mappingChecks?.[
                                                      catId
                                                    ] ?? []
                                                  ).map((e) =>
                                                    e.id === entry.id
                                                      ? {
                                                          ...e,
                                                          comment:
                                                            next.length > 0
                                                              ? `${next.length} CE sélectionné${next.length > 1 ? "s" : ""}`
                                                              : e.comment,
                                                        }
                                                      : e,
                                                  ),
                                                },
                                              });
                                            }}
                                          />
                                          {ce.label}
                                        </label>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          ) : (
                            <label className="opp-mapping-comment">
                              <span className="sr-only">Commentaire</span>
                              <input
                                value={entry.comment ?? ""}
                                placeholder="Commentaire (facultatif)"
                                onChange={(e) =>
                                  patchCard(catId, entry.id, {
                                    comment: e.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                        </div>
                        <div className="opp-mapping-chip-actions">
                          <button
                            type="button"
                            className={`opp-mapping-mark mark-covered${
                              entry.status === "covered" ? " is-on" : ""
                            }`}
                            title="Maîtrisé"
                            aria-label="Maîtrisé"
                            aria-pressed={entry.status === "covered"}
                            onClick={() =>
                              setStatus(catId, entry.id, "covered")
                            }
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className={`opp-mapping-mark mark-not_mastered${
                              entry.status === "not_mastered" ? " is-on" : ""
                            }`}
                            title="Non maîtrisé"
                            aria-label="Non maîtrisé"
                            aria-pressed={entry.status === "not_mastered"}
                            onClick={() =>
                              setStatus(catId, entry.id, "not_mastered")
                            }
                          >
                            ✗
                          </button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>

              <div className="opp-mapping-col-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setManagingCards(false);
                    setThemeFilter("all");
                    setLibraryFor(catId);
                  }}
                >
                  + Bibliothèque
                </button>
                <form
                  className="opp-mapping-manual"
                  onSubmit={(e) => handleAddManual(catId, e)}
                >
                  <input
                    value={drafts[catId]}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [catId]: e.target.value }))
                    }
                    placeholder="Ajouter manuellement…"
                  />
                  <button type="submit" disabled={!drafts[catId].trim()}>
                    OK
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>

      {libraryFor && (
        <div
          className="opp-mapping-library-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Bibliothèque de cartes"
        >
          <div className="opp-mapping-library">
            <header>
              <div>
                <h3>
                  Bibliothèque · {CAT_BY_ID[libraryFor].label}
                  <span className="muted">
                    {" "}
                    ({CAT_BY_ID[libraryFor].subtitle})
                  </span>
                </h3>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => setLibraryFor(null)}
              >
                Fermer
              </button>
            </header>

            <div className="opp-mapping-theme-filters">
              <button
                type="button"
                className={themeFilter === "all" ? "active" : ""}
                onClick={() => setThemeFilter("all")}
              >
                Tous
              </button>
              {themesForPicker.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={themeFilter === t.id ? "active" : ""}
                  onClick={() => setThemeFilter(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="opp-mapping-library-list">
              {showUspsInLibrary && (
                <section className="opp-mapping-usp-section">
                  <h4>USP catalogue</h4>
                  {opportunityUsps.length === 0 ? (
                    <p className="muted">Aucun USP catalogue.</p>
                  ) : (
                    <ul>
                      {opportunityUsps.map(({ cardId, usp, sourceLabel }) => {
                        const on = entriesOf("signaux_positifs").some(
                          (e) => e.id === cardId,
                        );
                        return (
                          <li key={cardId}>
                            <button
                              type="button"
                              className={on ? "is-on" : ""}
                              disabled={on}
                              onClick={() =>
                                addCard("signaux_positifs", cardId)
                              }
                            >
                              <span className="opp-mapping-usp-source">
                                {sourceLabel}
                              </span>
                              {usp.label}
                              {on ? " · ajouté" : ""}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}
              {themeFilter !== "usp" &&
                (() => {
                  const sectionThemes = [
                    ...activeOppMappingThemes.map((t) => ({
                      id: t.id,
                      label: t.label,
                    })),
                  ];
                  for (const s of libraryItems) {
                    const tid = s.theme ?? "custom";
                    if (!sectionThemes.some((t) => t.id === tid)) {
                      sectionThemes.push({
                        id: tid,
                        label: themeCatalog.get(tid) ?? tid,
                      });
                    }
                  }
                  return sectionThemes
                    .filter(
                      (t) => themeFilter === "all" || themeFilter === t.id,
                    )
                    .map((theme) => {
                      const items = libraryItems.filter(
                        (s) => (s.theme ?? "custom") === theme.id,
                      );
                      if (!items.length) return null;
                      const already = new Set(
                        entriesOf(libraryFor!).map((e) => e.id),
                      );
                      return (
                        <section key={theme.id}>
                          <h4>{theme.label}</h4>
                          <ul>
                            {items.map((s) => {
                              const on = already.has(s.id);
                              return (
                                <li key={s.id}>
                                  <button
                                    type="button"
                                    className={on ? "is-on" : ""}
                                    disabled={on}
                                    onClick={() =>
                                      addCard(libraryFor!, s.id)
                                    }
                                  >
                                    {s.label}
                                    {s.required ? " · obligatoire" : ""}
                                    {on ? " · ajouté" : ""}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    });
                })()}
              {libraryItems.length === 0 &&
                !(showUspsInLibrary && opportunityUsps.length > 0) && (
                  <p className="muted">Aucune carte dans ce filtre.</p>
                )}
            </div>
          </div>
        </div>
      )}
      {managingCards && (
        <div
          className="opp-mapping-library-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Gérer les cartes du deal"
        >
          <div className="opp-mapping-library opp-mapping-manage">
            <header>
              <div>
                <h3>Gérer les cartes</h3>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => setManagingCards(false)}
              >
                Terminer
              </button>
            </header>

            {allSelectedCards.length === 0 ? (
              <p className="muted">Aucune carte sur ce deal.</p>
            ) : (
              <div className="opp-mapping-manage-list">
                {OPP_MAPPING_SWOT_ORDER.map((catId) => {
                  const items = allSelectedCards.filter(
                    (c) => c.category === catId,
                  );
                  if (!items.length) return null;
                  const cat = CAT_BY_ID[catId];
                  return (
                    <section key={catId}>
                      <h4>
                        <span className="opp-mapping-swot-letter" aria-hidden>
                          {cat.swot}
                        </span>
                        {cat.label}
                        <span className="muted"> · {items.length}</span>
                      </h4>
                      <ul>
                        {items.map(({ entry, label, theme, themeLabel }) => {
                          const resolvedThemeLabel =
                            themeLabel ??
                            themeCatalog.get(theme ?? "custom") ??
                            resolveThemeLabel(
                              theme,
                              config.oppMappingThemes ?? [],
                            );
                          const isRequired = requiredIds.has(entry.id);
                          return (
                            <li key={`${catId}-${entry.id}`}>
                              <div className="opp-mapping-manage-item">
                                <div>
                                  {resolvedThemeLabel &&
                                  theme !== "custom" ? (
                                    <em>{resolvedThemeLabel}</em>
                                  ) : null}
                                  <strong>
                                    {label}
                                    {isRequired ? (
                                      <span className="opp-mapping-required-badge">
                                        Obligatoire
                                      </span>
                                    ) : null}
                                  </strong>
                                  <span
                                    className={`opp-mapping-status-pill mark-${entry.status}`}
                                  >
                                    {entry.status === "covered"
                                      ? "Maîtrisé"
                                      : entry.status === "not_mastered"
                                        ? "Non maîtrisé"
                                        : "À traiter"}
                                  </span>
                                </div>
                                {isRequired ? (
                                  <span className="muted opp-mapping-manage-locked">
                                    Verrouillée
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="opp-mapping-manage-remove"
                                    onClick={() =>
                                      removeCard(catId, entry.id)
                                    }
                                  >
                                    Retirer
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <button
                        type="button"
                        className="ghost opp-mapping-clear-quad"
                        onClick={() => clearQuadrant(catId)}
                      >
                        Vider ce quadrant
                      </button>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
