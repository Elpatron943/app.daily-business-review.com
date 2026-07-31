import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import { defaultConfig } from "./config/defaults";
import type {
  CompetitorDef,
  UspDef,
} from "./config/types";

export type IntelSection = "org" | "deal";

export default function CompetitiveIntelManager({
  showInactive,
  sections = ["org", "deal"],
}: {
  showInactive: boolean;
  /** `org` = profil + USP ; `deal` = CE + concurrents. */
  sections?: IntelSection[];
}) {
  const showOrg = sections.includes("org");
  const showDeal = sections.includes("deal");
  const {
    config,
    updateOrgProfile,
    addOrgUsp,
    updateOrgUsp,
    removeOrgUsp,
    addCompetitor,
    updateCompetitor,
    removeCompetitor,
    addCompetitorFeature,
    updateCompetitorFeature,
    removeCompetitorFeature,
    addCompellingEvent,
    updateCompellingEvent,
    removeCompellingEvent,
  } = useOrgConfig();

  const profile = config.orgProfile ?? defaultConfig.orgProfile;
  const [newOrgUsp, setNewOrgUsp] = useState("");
  const [newCompetitor, setNewCompetitor] = useState("");
  const [newFeatureByComp, setNewFeatureByComp] = useState<
    Record<string, string>
  >({});
  const [newCeLabel, setNewCeLabel] = useState("");
  const [newCeDesc, setNewCeDesc] = useState("");

  const orgUsps = useMemo(
    () =>
      [...(profile.usps ?? [])]
        .filter((u) => showInactive || u.active)
        .sort((a, b) => a.order - b.order),
    [profile.usps, showInactive],
  );

  const competitors = useMemo(
    () =>
      [...(config.competitors ?? [])]
        .filter((c) => showInactive || c.active)
        .sort((a, b) => a.order - b.order),
    [config.competitors, showInactive],
  );

  const compellingEvents = useMemo(
    () =>
      [...(config.compellingEvents ?? [])]
        .filter((c) => showInactive || c.active)
        .sort((a, b) => a.order - b.order),
    [config.compellingEvents, showInactive],
  );

  const ourModules = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    for (const s of config.solutions) {
      if (!s.active && !showInactive) continue;
      for (const m of s.modules ?? []) {
        if (!m.active && !showInactive) continue;
        list.push({
          id: m.id,
          label: `${s.name} · ${m.label}`,
        });
      }
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [config.solutions, showInactive]);

  return (
    <div className="intel-settings">
      {showOrg && (
      <section className="intel-block" aria-label="Notre entreprise">
        <h3>Notre entreprise</h3>
        <div className="intel-form-grid">
          <label>
            Nom
            <input
              value={profile.name}
              onChange={(e) => updateOrgProfile({ name: e.target.value })}
            />
          </label>
        </div>
        <label className="intel-textarea-label">
          Description
          <textarea
            rows={4}
            value={profile.description}
            onChange={(e) => updateOrgProfile({ description: e.target.value })}
            placeholder="Qui êtes-vous, pour qui, quelle promesse…"
          />
        </label>

        <h4>USP — Unique Selling Points (entreprise)</h4>
        <p className="muted settings-hint">
          Arguments différenciants de votre offre au niveau entreprise. Ils
          alimentent l’Opportunity Mapping, l’analyse IA et les scripts
          commerciaux — pour rappeler pourquoi le client doit vous choisir
          plutôt qu’un concurrent.
        </p>
        <ul className="settings-list intel-usp-list">
          {orgUsps.map((u) => (
            <UspRow
              key={u.id}
              usp={u}
              onChange={(patch) => updateOrgUsp(u.id, patch)}
              onRemove={() => removeOrgUsp(u.id)}
            />
          ))}
        </ul>
        <form
          className="settings-add"
          onSubmit={(e) => {
            e.preventDefault();
            addOrgUsp(newOrgUsp);
            setNewOrgUsp("");
          }}
        >
          <input
            value={newOrgUsp}
            onChange={(e) => setNewOrgUsp(e.target.value)}
            placeholder="Nouvel Unique Selling Point"
            required
          />
          <button type="submit">Ajouter USP</button>
        </form>
      </section>
      )}

      {showDeal && (
      <>
      <section className="intel-block" aria-label="Compelling Events">
        <h3>Compelling Events (catalogue)</h3>
        <ul className="settings-list intel-criteria-list">
          {compellingEvents.map((ce) => (
            <li
              key={ce.id}
              className={`intel-criterion-row${!ce.active ? " inactive" : ""}`}
            >
              <input
                value={ce.label}
                onChange={(e) =>
                  updateCompellingEvent(ce.id, { label: e.target.value })
                }
                disabled={!ce.active}
                placeholder="Libellé CE"
              />
              <textarea
                rows={2}
                value={ce.description}
                onChange={(e) =>
                  updateCompellingEvent(ce.id, {
                    description: e.target.value,
                  })
                }
                disabled={!ce.active}
                placeholder="Description / signaux…"
              />
              {ce.active ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeCompellingEvent(ce.id)}
                >
                  Retirer
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    updateCompellingEvent(ce.id, { active: true })
                  }
                >
                  Réactiver
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="settings-add intel-criterion-add"
          onSubmit={(e) => {
            e.preventDefault();
            addCompellingEvent(newCeLabel, newCeDesc);
            setNewCeLabel("");
            setNewCeDesc("");
          }}
        >
          <input
            value={newCeLabel}
            onChange={(e) => setNewCeLabel(e.target.value)}
            placeholder="Nouveau Compelling Event"
            required
          />
          <input
            value={newCeDesc}
            onChange={(e) => setNewCeDesc(e.target.value)}
            placeholder="Description (opt.)"
          />
          <button type="submit">Ajouter</button>
        </form>
      </section>

      <section className="intel-block" aria-label="Concurrents">
        <h3>Concurrents</h3>
        <form
          className="settings-add"
          onSubmit={(e) => {
            e.preventDefault();
            addCompetitor(newCompetitor);
            setNewCompetitor("");
          }}
        >
          <input
            value={newCompetitor}
            onChange={(e) => setNewCompetitor(e.target.value)}
            placeholder="Nom du concurrent"
            required
          />
          <button type="submit">Ajouter</button>
        </form>

        <ul className="settings-list process-domain-list">
          {competitors.map((c) => (
            <CompetitorRow
              key={c.id}
              competitor={c}
              showInactive={showInactive}
              ourModules={ourModules}
              newFeature={newFeatureByComp[c.id] ?? ""}
              onNewFeatureChange={(v) =>
                setNewFeatureByComp((prev) => ({ ...prev, [c.id]: v }))
              }
              onChange={(patch) => updateCompetitor(c.id, patch)}
              onRemove={() => removeCompetitor(c.id)}
              onRestore={() => updateCompetitor(c.id, { active: true })}
              onAddFeature={() => {
                addCompetitorFeature(c.id, newFeatureByComp[c.id] ?? "");
                setNewFeatureByComp((prev) => ({ ...prev, [c.id]: "" }));
              }}
              onUpdateFeature={(fid, patch) =>
                updateCompetitorFeature(c.id, fid, patch)
              }
              onRemoveFeature={(fid) => removeCompetitorFeature(c.id, fid)}
            />
          ))}
        </ul>
      </section>
      </>
      )}
    </div>
  );
}

function UspRow({
  usp,
  onChange,
  onRemove,
}: {
  usp: UspDef;
  onChange: (patch: Partial<UspDef>) => void;
  onRemove: () => void;
}) {
  return (
    <li className={`intel-usp-row${!usp.active ? " inactive" : ""}`}>
      <input
        value={usp.label}
        onChange={(e) => onChange({ label: e.target.value })}
        disabled={!usp.active}
        placeholder="Libellé USP"
        aria-label="Libellé USP"
      />
      <textarea
        rows={2}
        value={usp.description}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={!usp.active}
        placeholder="Description / preuve"
        aria-label="Description USP"
      />
      <div className="intel-usp-row-actions">
        <label className="intel-usp-active">
          <input
            type="checkbox"
            checked={usp.active}
            onChange={(e) => onChange({ active: e.target.checked })}
          />
          Actif
        </label>
        {usp.active && (
          <button type="button" className="ghost" onClick={onRemove}>
            Retirer
          </button>
        )}
      </div>
    </li>
  );
}

function CompetitorRow({
  competitor,
  showInactive,
  ourModules,
  newFeature,
  onNewFeatureChange,
  onChange,
  onRemove,
  onRestore,
  onAddFeature,
  onUpdateFeature,
  onRemoveFeature,
}: {
  competitor: CompetitorDef;
  showInactive: boolean;
  ourModules: { id: string; label: string }[];
  newFeature: string;
  onNewFeatureChange: (v: string) => void;
  onChange: (patch: Partial<CompetitorDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
  onAddFeature: () => void;
  onUpdateFeature: (
    featureId: string,
    patch: Partial<CompetitorDef["features"][number]>,
  ) => void;
  onRemoveFeature: (featureId: string) => void;
}) {
  const features = [...(competitor.features ?? [])]
    .filter((f) => showInactive || f.active)
    .sort((a, b) => a.order - b.order);

  return (
    <li
      className={`process-domain-row intel-competitor${!competitor.active ? " inactive" : ""}`}
    >
      <div className="process-domain-head">
        <input
          value={competitor.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={!competitor.active}
          aria-label="Nom concurrent"
        />
        {competitor.active ? (
          <button type="button" className="ghost" onClick={onRemove}>
            Désactiver
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onRestore}>
            Réactiver
          </button>
        )}
      </div>
      {competitor.active && (
        <>
          <label className="intel-textarea-label">
            Description
            <textarea
              rows={3}
              value={competitor.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Positionnement, forces / faiblesses…"
            />
          </label>
          <h4 className="nested-hint">Features concurrent</h4>
          <ul className="settings-list intel-feature-list">
            {features.map((f) => (
              <li key={f.id} className={!f.active ? "inactive" : ""}>
                <input
                  value={f.label}
                  onChange={(e) =>
                    onUpdateFeature(f.id, { label: e.target.value })
                  }
                  disabled={!f.active}
                  placeholder="Feature"
                />
                <textarea
                  rows={2}
                  value={f.description}
                  onChange={(e) =>
                    onUpdateFeature(f.id, { description: e.target.value })
                  }
                  disabled={!f.active}
                  placeholder="Description feature"
                />
                <label className="intel-link-label">
                  Lié à notre feature
                  <select
                    value={f.ourModuleId ?? ""}
                    onChange={(e) =>
                      onUpdateFeature(f.id, {
                        ourModuleId: e.target.value || null,
                      })
                    }
                    disabled={!f.active}
                  >
                    <option value="">— Aucun —</option>
                    {ourModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                {f.active ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onRemoveFeature(f.id)}
                  >
                    Retirer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      onUpdateFeature(f.id, { active: true })
                    }
                  >
                    Réactiver
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="settings-add nested"
            onSubmit={(e) => {
              e.preventDefault();
              onAddFeature();
            }}
          >
            <input
              value={newFeature}
              onChange={(e) => onNewFeatureChange(e.target.value)}
              placeholder="Nouvelle feature concurrent"
              required
            />
            <button type="submit">Ajouter feature</button>
          </form>
        </>
      )}
    </li>
  );
}
