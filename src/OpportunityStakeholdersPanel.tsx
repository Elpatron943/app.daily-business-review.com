import { useMemo, useState, type FormEvent } from "react";
import {
  ENGAGEMENT_STATUSES,
  engagementLabel,
  type Status,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import {
  useOpportunities,
  type Opportunity,
  type OpportunityStakeholder,
} from "./opportunities/OpportunityContext";

type Props = {
  opportunity: Opportunity;
  onUpdate: (patch: Partial<Opportunity>) => void;
};

export default function OpportunityStakeholdersPanel({
  opportunity,
  onUpdate,
}: Props) {
  const { activeContacts, upsertContact } = useDomain();
  const {
    activeContactTypes,
    activePersonae,
    contactTypeColor,
    contactTypeLabel,
    personaLabel,
  } = useOrgConfig();
  const { activeOpportunities } = useOpportunities();
  const [pickId, setPickId] = useState("");
  const [pickRole, setPickRole] = useState(
    activeContactTypes[0]?.id ?? "",
  );
  const [creating, setCreating] = useState(false);
  const [cName, setCName] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cPersona, setCPersona] = useState(activePersonae[0]?.id ?? "");
  const [cRole, setCRole] = useState(activeContactTypes[0]?.id ?? "");

  const stakeholders = opportunity.stakeholders ?? [];

  const accountContacts = useMemo(
    () =>
      activeContacts
        .filter((c) => c.accountId === opportunity.primaryAccountId)
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [activeContacts, opportunity.primaryAccountId],
  );

  const mappedIds = useMemo(
    () => new Set(stakeholders.map((s) => s.contactId)),
    [stakeholders],
  );

  const available = accountContacts.filter((c) => !mappedIds.has(c.id));

  const rows = useMemo(() => {
    return stakeholders
      .map((s) => {
        const contact =
          activeContacts.find((c) => c.id === s.contactId) ?? null;
        return { stake: s, contact };
      })
      .sort((a, b) =>
        (a.contact?.name ?? "").localeCompare(b.contact?.name ?? "", "fr"),
      );
  }, [stakeholders, activeContacts]);

  function setStakeholders(next: OpportunityStakeholder[]) {
    onUpdate({ stakeholders: next });
  }

  function addStakeholder() {
    if (!pickId || mappedIds.has(pickId) || !pickRole) return;
    setStakeholders([
      ...stakeholders,
      { contactId: pickId, role: pickRole, status: "Identified" },
    ]);
    setPickId("");
  }

  function resetCreateForm() {
    setCName("");
    setCTitle("");
    setCPersona(activePersonae[0]?.id ?? "");
    setCRole(activeContactTypes[0]?.id ?? "");
    setCreating(false);
  }

  function handleCreateContact(e: FormEvent) {
    e.preventDefault();
    const name = cName.trim();
    if (!name || !cPersona || !cRole || !opportunity.primaryAccountId) return;
    const id = upsertContact({
      name,
      title: cTitle.trim(),
      accountId: opportunity.primaryAccountId,
      personaId: cPersona,
    });
    if (!id) return;
    setStakeholders([
      ...stakeholders.filter((s) => s.contactId !== id),
      { contactId: id, role: cRole, status: "Identified" },
    ]);
    resetCreateForm();
  }

  function patchStake(
    contactId: string,
    patch: Partial<Pick<OpportunityStakeholder, "status" | "notes" | "role">>,
  ) {
    setStakeholders(
      stakeholders.map((s) =>
        s.contactId === contactId ? { ...s, ...patch } : s,
      ),
    );
  }

  function removeStake(contactId: string) {
    setStakeholders(stakeholders.filter((s) => s.contactId !== contactId));
  }

  const otherOppCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of activeOpportunities) {
      if (o.id === opportunity.id) continue;
      for (const s of o.stakeholders ?? []) {
        map.set(s.contactId, (map.get(s.contactId) ?? 0) + 1);
      }
    }
    return map;
  }, [activeOpportunities, opportunity.id]);

  return (
    <section className="entry-subsection opp-stakeholders">
      <div className="opp-stake-head">
        <h2>Contacts de l’opportunité</h2>
        {!creating && (
          <button
            type="button"
            className="ghost"
            onClick={() => setCreating(true)}
          >
            Créer un contact
          </button>
        )}
      </div>

      {creating && (
        <form className="entry-form opp-stake-create" onSubmit={handleCreateContact}>
          <div className="data-form-grid">
            <label>
              Nom
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label>
              Titre
              <input
                value={cTitle}
                onChange={(e) => setCTitle(e.target.value)}
                placeholder="CFO, CTO…"
              />
            </label>
            <label>
              Persona
              <select
                value={cPersona}
                onChange={(e) => setCPersona(e.target.value)}
                required
              >
                <option value="">Choisir…</option>
                {activePersonae.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type sur ce deal
              <select
                value={cRole}
                onChange={(e) => setCRole(e.target.value)}
                required
              >
                {activeContactTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="plan-create-actions">
            <button type="button" className="ghost" onClick={resetCreateForm}>
              Annuler
            </button>
            <button
              type="submit"
              className="primary-cta"
              disabled={!cName.trim() || !cPersona || !cRole}
            >
              Créer et mapper
            </button>
          </div>
        </form>
      )}

      <div className="opp-stake-add">
        <label>
          Ajouter un contact du compte
          <select
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.title ? ` · ${c.title}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type sur ce deal
          <select
            value={pickRole}
            onChange={(e) => setPickRole(e.target.value)}
          >
            {activeContactTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary-cta"
          disabled={!pickId || !pickRole}
          onClick={addStakeholder}
        >
          Mapper
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="muted">Aucun contact mappé sur cette opportunité.</p>
      ) : (
        <ul className="opp-stake-list">
          {rows.map(({ stake, contact }) => {
            const roleId = stake.role ?? "";
            const roleLabel = roleId
              ? contactTypeLabel(roleId)
              : "Type non défini";
            const color = roleId ? contactTypeColor(roleId) : "#9ca3af";
            const personaName = contact
              ? personaLabel(contact.personaId)
              : "";
            const elsewhere = otherOppCounts.get(stake.contactId) ?? 0;
            return (
              <li
                key={stake.contactId}
                className="opp-stake-row"
                style={{ borderLeftColor: color }}
              >
                <div className="opp-stake-who">
                  <div className="opp-stake-type">
                    <i
                      className="opp-stake-swatch"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <span style={{ color }}>{roleLabel}</span>
                  </div>
                  <strong>{contact?.name ?? "Contact introuvable"}</strong>
                  <span className="muted">
                    {contact?.title || "Sans titre"}
                    {personaName ? ` · ${personaName}` : ""}
                    {!contact?.active ? " · désactivé" : ""}
                    {elsewhere > 0
                      ? ` · aussi sur ${elsewhere} autre(s) opp.`
                      : ""}
                  </span>
                </div>
                <div className="opp-stake-fields">
                  <label>
                    Type
                    <select
                      value={stake.role || ""}
                      onChange={(e) =>
                        patchStake(stake.contactId, {
                          role: e.target.value,
                        })
                      }
                    >
                      <option value="">— Choisir —</option>
                      {activeContactTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Engagement
                    <select
                      value={stake.status}
                      onChange={(e) =>
                        patchStake(stake.contactId, {
                          status: e.target.value as Status,
                        })
                      }
                    >
                      {ENGAGEMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {engagementLabel[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="opp-stake-notes">
                    Notes
                    <input
                      value={stake.notes ?? ""}
                      placeholder="Accès, risque, action…"
                      onChange={(e) =>
                        patchStake(stake.contactId, {
                          notes: e.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost danger-text"
                    onClick={() => removeStake(stake.contactId)}
                  >
                    Retirer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="opp-stake-legend" aria-label="Légende types de contact">
        {activeContactTypes.map((t) => (
          <li key={t.id}>
            <i style={{ background: contactTypeColor(t.id) }} aria-hidden />
            {t.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
