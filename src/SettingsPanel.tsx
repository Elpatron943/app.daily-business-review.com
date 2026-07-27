import { useMemo, useState } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import CatalogueManager from "./CatalogueManager";
import CompetitiveIntelManager from "./CompetitiveIntelManager";
import DirectionsManager from "./DirectionsManager";
import RiskMatrixManager from "./RiskMatrixManager";
import SectorsManager from "./SectorsManager";
import OppMappingLibraryManager from "./OppMappingLibraryManager";
import ImportManager from "./ImportManager";
import SalesTaxonomyManager from "./SalesTaxonomyManager";
import {
  BO_FIELD_KINDS,
  OPP_VARIABLE_KINDS,
  type BoCategoryDef,
  type BoFieldDef,
  type BoFieldKind,
  type ContactTypeDef,
  type OppVariableKind,
  type ProcessDomainDef,
  type ProcessQuestionDef,
} from "./config/types";

type Tab =
  | "intel"
  | "catalogue"
  | "mapping"
  | "import"
  | "contacts"
  | "directions"
  | "sectors"
  | "sales"
  | "outcomes"
  | "process"
  | "variables"
  | "risk";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const {
    config,
    addOppVariable,
    updateOppVariable,
    removeOppVariable,
    swapOppVariableOrder,
    addContactType,
    updateContactType,
    removeContactType,
    addBoCategory,
    updateBoCategory,
    removeBoCategory,
    addBoField,
    updateBoField,
    removeBoField,
    addProcessDomain,
    updateProcessDomain,
    removeProcessDomain,
    swapProcessDomainOrder,
    addProcessQuestion,
    updateProcessQuestion,
    removeProcessQuestion,
    swapProcessQuestionOrder,
    resetConfig,
  } = useOrgConfig();
  const [tab, setTab] = useState<Tab>("intel");
  const [newContactLabel, setNewContactLabel] = useState("");
  const [newContactColor, setNewContactColor] = useState("#0f766e");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newBoLabel, setNewBoLabel] = useState("");
  const [newBoKind, setNewBoKind] = useState<BoFieldKind>("annual_benefit");
  const [newBoCategory, setNewBoCategory] = useState("");
  const [newDomainLabel, setNewDomainLabel] = useState("");
  const [newQuestionByDomain, setNewQuestionByDomain] = useState<
    Record<string, string>
  >({});
  const [newVarLabel, setNewVarLabel] = useState("");
  const [newVarKind, setNewVarKind] = useState<OppVariableKind>("number");
  const [showInactive, setShowInactive] = useState(false);

  const contactTypes = useMemo(
    () =>
      [...config.contactTypes]
        .filter((t) => showInactive || t.active)
        .sort((a, b) => a.order - b.order),
    [config.contactTypes, showInactive],
  );

  const boCategories = useMemo(
    () =>
      [...(config.boCategories ?? [])]
        .filter((c) => showInactive || c.active)
        .sort((a, b) => a.order - b.order),
    [config.boCategories, showInactive],
  );

  const boFields = useMemo(
    () =>
      [...(config.boFields ?? [])]
        .filter((f) => showInactive || f.active)
        .sort((a, b) => a.order - b.order),
    [config.boFields, showInactive],
  );

  const processDomains = useMemo(
    () =>
      [...(config.processDomains ?? [])]
        .filter((d) => showInactive || d.active)
        .sort((a, b) => a.order - b.order),
    [config.processDomains, showInactive],
  );

  const oppVariables = useMemo(
    () =>
      [...(config.oppVariables ?? [])]
        .filter((v) => showInactive || v.active)
        .sort((a, b) => a.order - b.order),
    [config.oppVariables, showInactive],
  );

  const activeCats = boCategories.filter((c) => c.active);

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-panel settings-panel-wide">
        <header className="settings-head">
          <div>
            <h2>Personnalisation</h2>
          </div>
          <button type="button" className="settings-close" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="settings-tabs">
          <button
            type="button"
            className={tab === "intel" ? "active" : ""}
            onClick={() => setTab("intel")}
          >
            Positionnement
          </button>
          <button
            type="button"
            className={tab === "directions" ? "active" : ""}
            onClick={() => setTab("directions")}
          >
            Directions
          </button>
          <button
            type="button"
            className={tab === "sectors" ? "active" : ""}
            onClick={() => setTab("sectors")}
          >
            Secteurs
          </button>
          <button
            type="button"
            className={tab === "sales" ? "active" : ""}
            onClick={() => setTab("sales")}
          >
            Commercial / KPI
          </button>
          <button
            type="button"
            className={tab === "catalogue" ? "active" : ""}
            onClick={() => setTab("catalogue")}
          >
            Catalogue
          </button>
          <button
            type="button"
            className={tab === "mapping" ? "active" : ""}
            onClick={() => setTab("mapping")}
          >
            Opp. Mapping
          </button>
          <button
            type="button"
            className={tab === "import" ? "active" : ""}
            onClick={() => setTab("import")}
          >
            Import
          </button>
          <button
            type="button"
            className={tab === "variables" ? "active" : ""}
            onClick={() => setTab("variables")}
          >
            Variables deal
          </button>
          <button
            type="button"
            className={tab === "contacts" ? "active" : ""}
            onClick={() => setTab("contacts")}
          >
            Types de contacts
          </button>
          <button
            type="button"
            className={tab === "process" ? "active" : ""}
            onClick={() => setTab("process")}
          >
            Process
          </button>
          <button
            type="button"
            className={tab === "outcomes" ? "active" : ""}
            onClick={() => setTab("outcomes")}
          >
            Business outcomes
          </button>
          <button
            type="button"
            className={tab === "risk" ? "active" : ""}
            onClick={() => setTab("risk")}
          >
            Matrice des risques
          </button>
          <label className="settings-inactive">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Afficher désactivés
          </label>
        </div>

        <div className="settings-body">
          {tab === "intel" && (
            <CompetitiveIntelManager showInactive={showInactive} />
          )}

          {tab === "directions" && (
            <DirectionsManager showInactive={showInactive} />
          )}

          {tab === "sectors" && (
            <SectorsManager showInactive={showInactive} />
          )}

          {tab === "sales" && (
            <SalesTaxonomyManager showInactive={showInactive} />
          )}

          {tab === "risk" && <RiskMatrixManager />}

          {tab === "catalogue" && (
            <CatalogueManager showInactive={showInactive} />
          )}

          {tab === "mapping" && (
            <OppMappingLibraryManager showInactive={showInactive} />
          )}

          {tab === "import" && <ImportManager />}

          {tab === "variables" && (
            <>
              <form
                className="settings-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addOppVariable(newVarLabel, newVarKind);
                  setNewVarLabel("");
                  setNewVarKind("number");
                }}
              >
                <input
                  value={newVarLabel}
                  onChange={(e) => setNewVarLabel(e.target.value)}
                  placeholder="Libellé (ex. Nb utilisateurs)"
                  required
                />
                <select
                  value={newVarKind}
                  onChange={(e) =>
                    setNewVarKind(e.target.value as OppVariableKind)
                  }
                  aria-label="Type"
                >
                  {OPP_VARIABLE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button type="submit">Ajouter</button>
              </form>
              <ul className="settings-list">
                {oppVariables.map((v, i) => (
                  <li key={v.id} className={!v.active ? "inactive" : ""}>
                    <input
                      value={v.label}
                      onChange={(e) =>
                        updateOppVariable(v.id, { label: e.target.value })
                      }
                      disabled={!v.active}
                    />
                    <select
                      value={v.kind}
                      onChange={(e) =>
                        updateOppVariable(v.id, {
                          kind: e.target.value as OppVariableKind,
                        })
                      }
                      disabled={!v.active}
                      aria-label="Type"
                    >
                      {OPP_VARIABLE_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <OrderButtons
                      onMoveUp={
                        i > 0
                          ? () =>
                              swapOppVariableOrder(
                                v.id,
                                oppVariables[i - 1].id,
                              )
                          : undefined
                      }
                      onMoveDown={
                        i < oppVariables.length - 1
                          ? () =>
                              swapOppVariableOrder(
                                v.id,
                                oppVariables[i + 1].id,
                              )
                          : undefined
                      }
                      disabled={!v.active}
                    />
                    {v.active ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => removeOppVariable(v.id)}
                      >
                        Retirer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          updateOppVariable(v.id, { active: true })
                        }
                      >
                        Réactiver
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === "contacts" && (
            <>
              <form
                className="settings-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addContactType(newContactLabel, newContactColor);
                  setNewContactLabel("");
                }}
              >
                <input
                  value={newContactLabel}
                  onChange={(e) => setNewContactLabel(e.target.value)}
                  placeholder="Libellé du type (ex. Coach)"
                  required
                />
                <input
                  type="color"
                  value={newContactColor}
                  onChange={(e) => setNewContactColor(e.target.value)}
                  title="Couleur"
                  className="color"
                />
                <button type="submit">Ajouter</button>
              </form>
              <ul className="settings-list">
                {contactTypes.map((t) => (
                  <ContactTypeRow
                    key={t.id}
                    type={t}
                    onChange={(patch) => updateContactType(t.id, patch)}
                    onRemove={() => removeContactType(t.id)}
                    onRestore={() => updateContactType(t.id, { active: true })}
                  />
                ))}
              </ul>
            </>
          )}

          {tab === "process" && (
            <>
              <form
                className="settings-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addProcessDomain(newDomainLabel);
                  setNewDomainLabel("");
                }}
              >
                <input
                  value={newDomainLabel}
                  onChange={(e) => setNewDomainLabel(e.target.value)}
                  placeholder="Nouveau domaine (ex. Discovery)"
                  required
                />
                <button type="submit">Ajouter domaine</button>
              </form>
              <ul className="settings-list process-domain-list">
                {processDomains.map((d, i) => (
                  <ProcessDomainRow
                    key={d.id}
                    domain={d}
                    showInactive={showInactive}
                    newQuestion={newQuestionByDomain[d.id] ?? ""}
                    onNewQuestionChange={(v) =>
                      setNewQuestionByDomain((prev) => ({
                        ...prev,
                        [d.id]: v,
                      }))
                    }
                    onChange={(patch) => updateProcessDomain(d.id, patch)}
                    onRemove={() => removeProcessDomain(d.id)}
                    onRestore={() =>
                      updateProcessDomain(d.id, { active: true })
                    }
                    onMoveUp={
                      i > 0
                        ? () =>
                            swapProcessDomainOrder(
                              d.id,
                              processDomains[i - 1].id,
                            )
                        : undefined
                    }
                    onMoveDown={
                      i < processDomains.length - 1
                        ? () =>
                            swapProcessDomainOrder(
                              d.id,
                              processDomains[i + 1].id,
                            )
                        : undefined
                    }
                    onAddQuestion={() => {
                      addProcessQuestion(d.id, newQuestionByDomain[d.id] ?? "");
                      setNewQuestionByDomain((prev) => ({
                        ...prev,
                        [d.id]: "",
                      }));
                    }}
                    onUpdateQuestion={(qid, patch) =>
                      updateProcessQuestion(d.id, qid, patch)
                    }
                    onRemoveQuestion={(qid) =>
                      removeProcessQuestion(d.id, qid)
                    }
                    onMoveQuestion={(qid, dir) => {
                      const qs = [...d.questions]
                        .filter((q) => showInactive || q.active)
                        .sort((a, b) => a.order - b.order);
                      const qi = qs.findIndex((q) => q.id === qid);
                      const neighbor = qs[qi + dir];
                      if (qi < 0 || !neighbor) return;
                      swapProcessQuestionOrder(d.id, qid, neighbor.id);
                    }}
                  />
                ))}
              </ul>
            </>
          )}

          {tab === "outcomes" && (
            <>
              <h3 className="settings-subhead">Catégories</h3>
              <form
                className="settings-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addBoCategory(newCatLabel);
                  setNewCatLabel("");
                }}
              >
                <input
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  placeholder="Nouvelle catégorie"
                  required
                />
                <button type="submit">Ajouter</button>
              </form>
              <ul className="settings-list">
                {boCategories.map((c) => (
                  <li key={c.id} className={!c.active ? "inactive" : ""}>
                    <input
                      value={c.label}
                      onChange={(e) =>
                        updateBoCategory(c.id, { label: e.target.value })
                      }
                      disabled={!c.active}
                    />
                    {c.active ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => removeBoCategory(c.id)}
                      >
                        Retirer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          updateBoCategory(c.id, { active: true })
                        }
                      >
                        Réactiver
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <h3 className="settings-subhead">Outcomes / champs</h3>
              <form
                className="settings-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addBoField(
                    newBoLabel,
                    newBoKind,
                    newBoCategory || null,
                  );
                  setNewBoLabel("");
                  setNewBoKind("annual_benefit");
                }}
              >
                <input
                  value={newBoLabel}
                  onChange={(e) => setNewBoLabel(e.target.value)}
                  placeholder="Libellé de l’outcome"
                  required
                />
                <select
                  value={newBoCategory}
                  onChange={(e) => setNewBoCategory(e.target.value)}
                  aria-label="Catégorie"
                >
                  <option value="">Sans catégorie</option>
                  {activeCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={newBoKind}
                  onChange={(e) =>
                    setNewBoKind(e.target.value as BoFieldKind)
                  }
                  aria-label="Rôle"
                >
                  {BO_FIELD_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button type="submit">Ajouter</button>
              </form>
              <ul className="settings-list bo-field-list">
                {boFields.map((f) => (
                  <BoFieldRow
                    key={f.id}
                    field={f}
                    categories={activeCats}
                    onChange={(patch) => updateBoField(f.id, patch)}
                    onRemove={() => removeBoField(f.id)}
                    onRestore={() => updateBoField(f.id, { active: true })}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="settings-foot">
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (
                confirm(
                  "Réinitialiser catalogues (directions, solutions, modules, variables, types, process, business outcomes) ?",
                )
              ) {
                resetConfig();
              }
            }}
          >
            Réinitialiser
          </button>
          <span className="muted">
            Sauvegardé localement dans ce navigateur
          </span>
        </footer>
      </div>
    </div>
  );
}

function OrderButtons({
  onMoveUp,
  onMoveDown,
  disabled,
}: {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="order-arrows">
      <button
        type="button"
        className="ghost order-arrow"
        onClick={onMoveUp}
        disabled={disabled || !onMoveUp}
        title="Monter"
        aria-label="Monter"
      >
        ▲
      </button>
      <button
        type="button"
        className="ghost order-arrow"
        onClick={onMoveDown}
        disabled={disabled || !onMoveDown}
        title="Descendre"
        aria-label="Descendre"
      >
        ▼
      </button>
    </span>
  );
}

function ProcessDomainRow({
  domain,
  showInactive,
  newQuestion,
  onNewQuestionChange,
  onChange,
  onRemove,
  onRestore,
  onMoveUp,
  onMoveDown,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
  onMoveQuestion,
}: {
  domain: ProcessDomainDef;
  showInactive: boolean;
  newQuestion: string;
  onNewQuestionChange: (v: string) => void;
  onChange: (patch: Partial<ProcessDomainDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onAddQuestion: () => void;
  onUpdateQuestion: (
    questionId: string,
    patch: Partial<ProcessQuestionDef>,
  ) => void;
  onRemoveQuestion: (questionId: string) => void;
  onMoveQuestion: (questionId: string, direction: -1 | 1) => void;
}) {
  const questions = [...domain.questions]
    .filter((q) => showInactive || q.active)
    .sort((a, b) => a.order - b.order);

  return (
    <li className={`process-domain-row${!domain.active ? " inactive" : ""}`}>
      <div className="process-domain-head">
        <input
          value={domain.label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={!domain.active}
          aria-label="Libellé du domaine"
        />
        <OrderButtons
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          disabled={!domain.active}
        />
        {domain.active ? (
          <button type="button" className="ghost" onClick={onRemove}>
            Retirer
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onRestore}>
            Réactiver
          </button>
        )}
      </div>
      {domain.active && (
        <>
          <ul className="settings-list process-question-list">
            {questions.map((q, qi) => (
              <li key={q.id} className={!q.active ? "inactive" : ""}>
                <input
                  value={q.label}
                  onChange={(e) =>
                    onUpdateQuestion(q.id, { label: e.target.value })
                  }
                  disabled={!q.active}
                  aria-label="Libellé de la question"
                />
                <OrderButtons
                  onMoveUp={
                    qi > 0 ? () => onMoveQuestion(q.id, -1) : undefined
                  }
                  onMoveDown={
                    qi < questions.length - 1
                      ? () => onMoveQuestion(q.id, 1)
                      : undefined
                  }
                  disabled={!q.active}
                />
                {q.active ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onRemoveQuestion(q.id)}
                  >
                    Retirer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      onUpdateQuestion(q.id, { active: true })
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
              onAddQuestion();
            }}
          >
            <input
              value={newQuestion}
              onChange={(e) => onNewQuestionChange(e.target.value)}
              placeholder="Nouvelle question"
              required
            />
            <button type="submit">Ajouter question</button>
          </form>
        </>
      )}
    </li>
  );
}

function ContactTypeRow({
  type,
  onChange,
  onRemove,
  onRestore,
}: {
  type: ContactTypeDef;
  onChange: (patch: Partial<ContactTypeDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <li className={!type.active ? "inactive" : ""}>
      <span
        className="color-swatch"
        style={{ background: type.color }}
        aria-hidden
      />
      <input
        value={type.label}
        onChange={(e) => onChange({ label: e.target.value })}
        disabled={!type.active}
      />
      <input
        type="color"
        className="color"
        value={type.color}
        onChange={(e) => onChange({ color: e.target.value })}
        disabled={!type.active}
      />
      {type.active ? (
        <button type="button" className="ghost" onClick={onRemove}>
          Désactiver
        </button>
      ) : (
        <button type="button" className="ghost" onClick={onRestore}>
          Réactiver
        </button>
      )}
    </li>
  );
}

function BoFieldRow({
  field,
  categories,
  onChange,
  onRemove,
  onRestore,
}: {
  field: BoFieldDef;
  categories: BoCategoryDef[];
  onChange: (patch: Partial<BoFieldDef>) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <li className={!field.active ? "inactive" : ""}>
      <input
        value={field.label}
        onChange={(e) => onChange({ label: e.target.value })}
        disabled={!field.active}
      />
      <select
        value={field.categoryId ?? ""}
        onChange={(e) =>
          onChange({ categoryId: e.target.value || null })
        }
        disabled={!field.active}
        title="Catégorie"
      >
        <option value="">Sans catégorie</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        value={field.kind}
        onChange={(e) =>
          onChange({ kind: e.target.value as BoFieldKind })
        }
        disabled={!field.active}
        title="Rôle dans le calcul"
      >
        {BO_FIELD_KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
      {field.active ? (
        <button type="button" className="ghost" onClick={onRemove}>
          Retirer
        </button>
      ) : (
        <button type="button" className="ghost" onClick={onRestore}>
          Réactiver
        </button>
      )}
    </li>
  );
}
