import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { isModuleEnabled } from "../billing/optionalModules";
import { useOrgConfig } from "../config/ConfigContext";
import { useDomain } from "../domain/DomainContext";
import type { Opportunity } from "../opportunities/OpportunityContext";
import { BriefMarkdown } from "./BriefMarkdown";
import {
  buildAiScriptFacts,
  type AiScriptFact,
  type AiScriptKind,
} from "./buildAiScriptContext";
import {
  checkAiScriptStatus,
  runAiScript,
  type ResearchStatus,
} from "./aiScriptClient";

type Props = {
  opportunity: Opportunity;
  kind: AiScriptKind;
};

type SavedScriptSelection = {
  targetContactId: string;
  excludedIds: string[];
  userContext: string;
  expectedEmailCount: number;
};

function selectionStorageKey(opportunityId: string, kind: AiScriptKind) {
  return `powermap.aiScriptSelection.${opportunityId}.${kind}`;
}

export default function OpportunityAiScriptPanel({ opportunity, kind }: Props) {
  const { organization } = useAuth();
  const {
    config,
    activeContactTypes,
    activeDirections,
    kindLabel,
    phaseLabel,
  } = useOrgConfig();
  const { activeAccounts, activeContacts } = useDomain();

  const moduleId = kind === "phone" ? "ai_phone_script" : "ai_email_script";
  const enabled = isModuleEnabled(organization?.optional_modules, moduleId);

  const title = kind === "phone" ? "Script appel IA" : "E-mail IA";
  const cta =
    kind === "phone" ? "Generer le script d'appel" : "Generer la sequence";

  const account =
    activeAccounts.find((a) => a.id === opportunity.primaryAccountId) ?? null;
  const holdingName = account?.holdingId
    ? (activeAccounts.find((a) => a.id === account.holdingId)?.name ?? null)
    : null;

  const stakeContactIds = useMemo(
    () => (opportunity.stakeholders ?? []).map((s) => s.contactId).filter(Boolean),
    [opportunity.stakeholders],
  );

  const [targetContactId, setTargetContactId] = useState<string>(
    () => stakeContactIds[0] ?? "",
  );
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [userContext, setUserContext] = useState("");
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [expectedEmailCount, setExpectedEmailCount] = useState(3);
  const [copyInfo, setCopyInfo] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkAiScriptStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allFacts = useMemo(
    () =>
      buildAiScriptFacts({
        config,
        opportunity,
        account,
        holdingName,
        contacts: activeContacts,
        contactTypes: activeContactTypes,
        directions: activeDirections,
        targetContactId: targetContactId || null,
        kindLabel,
        phaseLabel,
      }),
    [
      config,
      opportunity,
      account,
      holdingName,
      activeContacts,
      activeContactTypes,
      activeDirections,
      targetContactId,
      kindLabel,
      phaseLabel,
    ],
  );

  useEffect(() => {
    setExcludedIds((prev) => {
      const valid = new Set(allFacts.map((f) => f.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [allFacts]);

  useEffect(() => {
    if (
      targetContactId &&
      !stakeContactIds.includes(targetContactId) &&
      !activeContacts.some((c) => c.id === targetContactId)
    ) {
      setTargetContactId(stakeContactIds[0] ?? "");
    }
  }, [targetContactId, stakeContactIds, activeContacts]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(selectionStorageKey(opportunity.id, kind));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedScriptSelection>;
      if (typeof parsed.targetContactId === "string") {
        setTargetContactId(parsed.targetContactId);
      }
      if (Array.isArray(parsed.excludedIds)) {
        setExcludedIds(
          new Set(parsed.excludedIds.filter((id): id is string => typeof id === "string")),
        );
      }
      if (typeof parsed.userContext === "string") {
        setUserContext(parsed.userContext);
      }
      if (typeof parsed.expectedEmailCount === "number") {
        setExpectedEmailCount(Math.max(1, Math.min(20, parsed.expectedEmailCount)));
      }
    } catch {
      // ignore local parse errors
    }
  }, [opportunity.id, kind]);

  const includedFacts: AiScriptFact[] = useMemo(
    () => allFacts.filter((f) => !excludedIds.has(f.id)),
    [allFacts, excludedIds],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, AiScriptFact[]>();
    for (const f of includedFacts) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return [...map.entries()];
  }, [includedFacts]);

  function excludeFact(id: string) {
    setExcludedIds((prev) => new Set(prev).add(id));
  }

  function restoreAll() {
    setExcludedIds(new Set());
  }

  const canRun =
    enabled &&
    Boolean(status?.available && status.configured) &&
    !loading &&
    (includedFacts.length > 0 || userContext.trim().length > 0);

  async function handleRun() {
    setError(null);
    setLoading(true);
    try {
      const out = await runAiScript({
        kind,
        facts: includedFacts,
        userContext,
        orgName: config.orgProfile?.name ?? null,
        expectedEmailCount,
      });
      setResult(out.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!result?.trim()) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopyInfo("Script copie.");
      window.setTimeout(() => setCopyInfo(null), 1800);
    } catch {
      setCopyInfo("Copie impossible.");
      window.setTimeout(() => setCopyInfo(null), 1800);
    }
  }

  function saveSelection() {
    const payload: SavedScriptSelection = {
      targetContactId,
      excludedIds: [...excludedIds],
      userContext,
      expectedEmailCount,
    };
    localStorage.setItem(
      selectionStorageKey(opportunity.id, kind),
      JSON.stringify(payload),
    );
    setSaveInfo("Sélection enregistrée.");
    window.setTimeout(() => setSaveInfo(null), 1800);
  }

  if (!enabled) {
    return null;
  }

  const contactOptions = activeContacts.filter(
    (c) =>
      c.active !== false &&
      (stakeContactIds.includes(c.id) || c.accountId === opportunity.primaryAccountId),
  );

  return (
    <div className="opp-ai-script">
      <div className="opp-recommend-head">
        <div>
          <h3>{title}</h3>
          <p className="muted settings-hint" style={{ margin: 0 }}>
            L'IA utilise les donnees ci-dessous. Retire celles que tu ne veux pas
            inclure, puis ajoute un contexte libre si besoin.
          </p>
        </div>
        <button
          type="button"
          className="primary-cta"
          disabled={!canRun}
          onClick={() => void handleRun()}
        >
          {loading ? "Generation..." : cta}
        </button>
      </div>
      <div className="opp-ai-script-copy-row">
        <button type="button" className="ghost" onClick={saveSelection}>
          Enregistrer la sélection
        </button>
        {saveInfo ? <span className="meta">{saveInfo}</span> : null}
      </div>

      {status && !status.configured && (
        <p className="muted warn-hint">
          L'IA n'est pas encore configuree. Contacte ton administrateur.
        </p>
      )}
      {status && status.available === false && (
        <p className="muted warn-hint">
          L'IA est temporairement indisponible. Reessaie plus tard.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      <label className="opp-ai-script-field">
        Interlocuteur cible
        <select
          value={targetContactId}
          onChange={(e) => setTargetContactId(e.target.value)}
        >
          <option value="">-- Aucun (script generique) --</option>
          {contactOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.title ? ` · ${c.title}` : ""}
              {c.email ? ` · ${c.email}` : ""}
            </option>
          ))}
        </select>
      </label>

      {kind === "email" && (
        <label className="opp-ai-script-field">
          Nombre d'e-mails attendus dans la sequence
          <input
            type="number"
            min={1}
            max={20}
            value={expectedEmailCount}
            onChange={(e) =>
              setExpectedEmailCount(
                Math.max(1, Math.min(20, Number(e.target.value) || 1)),
              )
            }
          />
        </label>
      )}

      <div className="opp-ai-script-facts-head">
        <h4 className="settings-subhead" style={{ margin: 0 }}>
          Donnees prises en compte ({includedFacts.length})
        </h4>
        {excludedIds.size > 0 && (
          <button type="button" className="ghost" onClick={restoreAll}>
            Tout remettre
          </button>
        )}
      </div>

      {includedFacts.length === 0 ? (
        <p className="muted">
          Aucune donnee selectionnee. Ajoute un contexte libre ou remets des
          faits.
        </p>
      ) : (
        <div className="opp-ai-script-groups">
          {grouped.map(([group, facts]) => (
            <div key={group} className="opp-ai-script-group">
              <h4>{group}</h4>
              <ul>
                {facts.map((f) => (
                  <li key={f.id}>
                    <div className="opp-ai-script-fact">
                      <strong>{f.label}</strong>
                      <span className="meta">{f.value}</span>
                    </div>
                    <button
                      type="button"
                      className="ghost danger-text"
                      aria-label={`Retirer ${f.label}`}
                      onClick={() => excludeFact(f.id)}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <label className="opp-ai-script-field">
        Contexte libre
        <textarea
          rows={4}
          value={userContext}
          onChange={(e) => setUserContext(e.target.value)}
          placeholder={
            kind === "phone"
              ? "Ex. : objectif = qualifier le budget IT ; dernier echange il y a 2 semaines ; mentionner le renouvellement Q3..."
              : "Ex. : ton formel ; suite a la demo du 12/03 ; proposer un creneau jeudi..."
          }
        />
      </label>

      {result ? (
        <article className="opp-recommend-body">
          <div className="opp-ai-script-copy-row">
            <button type="button" className="ghost" onClick={() => void copyResult()}>
              Copier
            </button>
            {copyInfo ? <span className="meta">{copyInfo}</span> : null}
          </div>
          <BriefMarkdown text={result} />
        </article>
      ) : null}
    </div>
  );
}
