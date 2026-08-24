import { useMemo, useState, type MouseEvent } from "react";
import { useOrgConfig } from "./config/ConfigContext";
import CatalogueManager from "./CatalogueManager";
import CompetitiveIntelManager from "./CompetitiveIntelManager";
import PersonaeManager from "./PersonaeManager";
import RiskMatrixManager from "./RiskMatrixManager";
import SectorsManager from "./SectorsManager";
import OppMappingLibraryManager from "./OppMappingLibraryManager";
import ImportManager from "./ImportManager";
import SalesTaxonomyManager from "./SalesTaxonomyManager";
import CrmIntegrationsPanel from "./integrations/CrmIntegrationsPanel";
import DeploymentGuidePanel from "./settings/DeploymentGuidePanel";
import SettingsPurposeCard from "./settings/SettingsPurposeCard";
import SettingsInfoDialog, {
  SettingsInfoButton,
} from "./settings/SettingsInfoDialog";
import { getSettingsInfo } from "./settings/settingsInfoDiagrams";
import {
  DEFAULT_SETTINGS_AREA,
  SETTINGS_NAV,
  defaultSubForArea,
  findSettingsArea,
  type SettingsAreaId,
  type SettingsSubId,
} from "./settings/settingsNav";
import { useT } from "./i18n/LocaleContext";
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
import { useConfirm } from "./ui/ConfirmDialog";

type Props = {
  onOpenTeam?: () => void;
};

export default function SettingsPanel({ onOpenTeam }: Props) {
  const t = useT();
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
  const askConfirm = useConfirm();
  const [area, setArea] = useState<SettingsAreaId>(DEFAULT_SETTINGS_AREA);
  const [sub, setSub] = useState<SettingsSubId | null>(() =>
    defaultSubForArea(DEFAULT_SETTINGS_AREA),
  );
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoSubId, setInfoSubId] = useState<string | null>(null);
  const infoDiagram = getSettingsInfo(area, infoSubId);

  const current = findSettingsArea(area);
  const areaTitle = current?.labelKey
    ? t(current.labelKey)
    : (current?.label ?? "");
  const activeSub =
    current?.subs?.find((s) => s.id === sub) ?? current?.subs?.[0] ?? null;

  const goToArea = (target: SettingsAreaId) => {
    const item = findSettingsArea(target);
    if (item?.openTeam) {
      onOpenTeam?.();
      return;
    }
    setArea(target);
    setSub(defaultSubForArea(target));
    setInfoOpen(false);
    setInfoSubId(null);
  };

  const openInfo = (subId: string | null, e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setInfoSubId(subId);
    setInfoOpen(true);
  };

  const purposeVisual = (
    subId: string | undefined,
  ):
    | "risk-matrix"
    | "kpi"
    | "map-types"
    | "funnel"
    | "generic"
    | undefined => {
    switch (subId) {
      case "risk":
        return "risk-matrix";
      case "kpi":
        return "kpi";
      case "contact-types":
        return "map-types";
      case "funnel":
        return "funnel";
      default:
        return "generic";
    }
  };

  const renderSubBody = (subId: string) => {
    if (area === "dashboard" && subId === "risk") return <RiskMatrixManager />;
    if (area === "dashboard" && subId === "kpi") {
      return (
        <SalesTaxonomyManager
          showInactive={showInactive}
          sections={["kpi"]}
        />
      );
    }
    if (area === "contacts" && subId === "contact-types") {
      return <section className="settings-block">{contactTypesBlock}</section>;
    }
    if (area === "entreprises" && subId === "sectors") {
      return <SectorsManager showInactive={showInactive} />;
    }
    if (area === "entreprises" && subId === "directions") {
      return null;
    }
    if (area === "entreprises" && subId === "account-taxonomy") {
      return (
        <SalesTaxonomyManager
          showInactive={showInactive}
          sections={["statuses", "sizes"]}
        />
      );
    }
    if (area === "entreprises" && subId === "catalogue") {
      return <CatalogueManager showInactive={showInactive} />;
    }
    if (area === "opportunites" && subId === "funnel") {
      return (
        <SalesTaxonomyManager
          showInactive={showInactive}
          sections={["phases", "kinds"]}
        />
      );
    }
    if (area === "opportunites" && subId === "process") {
      return <section className="settings-block">{processBlock}</section>;
    }
    if (area === "opportunites" && subId === "mapping") {
      return <OppMappingLibraryManager showInactive={showInactive} />;
    }
    if (area === "opportunites" && subId === "outcomes") {
      return <section className="settings-block">{outcomesBlock}</section>;
    }
    if (area === "opportunites" && subId === "variables") {
      return <section className="settings-block">{variablesBlock}</section>;
    }
    if (area === "opportunites" && subId === "deal-intel") {
      return (
        <CompetitiveIntelManager
          showInactive={showInactive}
          sections={["deal"]}
        />
      );
    }
    if (area === "account-plans" && subId === "deps") {
      return (
        <section className="settings-block">
          <button
            type="button"
            className="primary"
            onClick={() => goToArea("opportunites")}
          >
            Configurer sous Opportunités
          </button>
        </section>
      );
    }
    if (area === "org-positioning" && subId === "profile") {
      return (
        <CompetitiveIntelManager
          showInactive={showInactive}
          sections={["org"]}
        />
      );
    }
    if (area === "org-positioning" && subId === "personae") {
      return <PersonaeManager showInactive={showInactive} />;
    }
    if (area === "org-data" && subId === "import") {
      return <ImportManager onOpenCrm={() => setSub("crm")} />;
    }
    if (area === "org-data" && subId === "crm") {
      return <CrmIntegrationsPanel />;
    }
    return null;
  };

  const contactTypes = useMemo(
    () =>
      [...config.contactTypes]
        .filter((x) => showInactive || x.active)
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

  const contactTypesBlock = (
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
          placeholder="Libellé du type (ex. Economic Buyer)"
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
        {contactTypes.map((ct) => (
          <ContactTypeRow
            key={ct.id}
            type={ct}
            onChange={(patch) => updateContactType(ct.id, patch)}
            onRemove={() => removeContactType(ct.id)}
            onRestore={() => updateContactType(ct.id, { active: true })}
          />
        ))}
      </ul>
    </>
  );

  const processBlock = (
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
            onRestore={() => updateProcessDomain(d.id, { active: true })}
            onMoveUp={
              i > 0
                ? () =>
                    swapProcessDomainOrder(d.id, processDomains[i - 1].id)
                : undefined
            }
            onMoveDown={
              i < processDomains.length - 1
                ? () =>
                    swapProcessDomainOrder(d.id, processDomains[i + 1].id)
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
            onRemoveQuestion={(qid) => removeProcessQuestion(d.id, qid)}
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
  );

  const outcomesBlock = (
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
                onClick={() => updateBoCategory(c.id, { active: true })}
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
          addBoField(newBoLabel, newBoKind, newBoCategory || null);
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
          onChange={(e) => setNewBoKind(e.target.value as BoFieldKind)}
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
  );

  const variablesBlock = (
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
          onChange={(e) => setNewVarKind(e.target.value as OppVariableKind)}
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
                      swapOppVariableOrder(v.id, oppVariables[i - 1].id)
                  : undefined
              }
              onMoveDown={
                i < oppVariables.length - 1
                  ? () =>
                      swapOppVariableOrder(v.id, oppVariables[i + 1].id)
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
                onClick={() => updateOppVariable(v.id, { active: true })}
              >
                Réactiver
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="data-page settings-page">
      <header className="data-page-head settings-page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">
            Paramètres par zone de l’app — partagés à toute l’équipe.
          </p>
        </div>
        {current?.showInactiveToggle && (
          <label className="settings-inactive">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Afficher les éléments désactivés
          </label>
        )}
      </header>

      <div className="settings-layout">
        <nav className="settings-side-nav" aria-label="Sections Settings">
          {SETTINGS_NAV.map((group) => (
            <div
              key={group.id}
              className="settings-side-group"
              data-group={group.id}
            >
              <p className="settings-side-group-label">
                {group.labelKey ? t(group.labelKey) : group.label}
              </p>
              {group.items.map((item) => {
                const label = item.labelKey ? t(item.labelKey) : item.label;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      area === item.id && !item.openTeam ? "active" : ""
                    }
                    onClick={() => goToArea(item.id)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="settings-body settings-page-body">
          {area === "org-parcours" ? (
            <>
              <header className="settings-area-head">
                <div className="settings-area-title-row">
                  <div>
                    <h2>Parcours</h2>
                    <p className="muted">{current?.blurb}</p>
                  </div>
                  <SettingsInfoButton onClick={(e) => openInfo(null, e)} />
                </div>
              </header>
              <DeploymentGuidePanel
                onGoToTab={goToArea}
                onOpenTeam={onOpenTeam}
              />
            </>
          ) : (
            <>
              {current && (
                <header className="settings-area-head">
                  <h2>{areaTitle}</h2>
                  <p className="muted">{current.blurb}</p>
                </header>
              )}

              {current?.subs && current.subs.length > 0 ? (
                <div className="settings-accordions">
                  {current.subs.map((s) => {
                    const isOpen = (sub ?? current.subs![0].id) === s.id;
                    return (
                      <details
                        key={s.id}
                        className="settings-accordion"
                        open={isOpen}
                        onToggle={(e) => {
                          const el = e.currentTarget;
                          if (el.open) setSub(s.id);
                        }}
                      >
                        <summary>
                          <span className="settings-accordion-summary-row">
                            <span>{s.label}</span>
                            <SettingsInfoButton
                              onClick={(e) => openInfo(s.id, e)}
                              label={`Où « ${s.label} » est utilisé`}
                            />
                          </span>
                        </summary>
                        <div className="settings-accordion-body">
                          <SettingsPurposeCard
                            where={s.where}
                            purpose={s.purpose}
                            visual={purposeVisual(s.id)}
                          />
                          {renderSubBody(s.id)}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : (
                renderSubBody(activeSub?.id ?? "")
              )}
            </>
          )}
        </div>
      </div>

      <SettingsInfoDialog
        info={infoDiagram}
        open={infoOpen}
        onClose={() => {
          setInfoOpen(false);
          setInfoSubId(null);
        }}
      />

      <footer className="settings-foot settings-page-foot">
        <button
          type="button"
          className="danger"
          onClick={() => {
            void (async () => {
              const ok = await askConfirm({
                title: "Réinitialiser",
                message:
                  "Remplacer tout le catalogue org par les paramètres d’usine (types de contacts, process, phases, mapping, etc.) ? Les personnalisations Settings seront perdues. Cette action est irréversible.",
                confirmLabel: "Réinitialiser",
                cancelLabel: "Annuler",
                danger: true,
              });
              if (ok) resetConfig();
            })();
          }}
        >
          Réinitialiser
        </button>
        <span className="muted">
          Les changements sont partagés à toute l’équipe (admin).
        </span>
      </footer>
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
