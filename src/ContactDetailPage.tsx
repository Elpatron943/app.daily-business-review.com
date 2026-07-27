import { useMemo, useState, type FormEvent } from "react";
import {
  contactRelationLabel,
  getContactChildrenIds,
  getContactParentId,
  METIER_CONTACT_RELATIONS,
  type ContactRelationType,
} from "./data";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";

type Props = {
  contactId: string;
  onBack: () => void;
  onOpenContact?: (id: string) => void;
  onOpenAccount?: (id: string) => void;
};

export default function ContactDetailPage({
  contactId,
  onBack,
  onOpenContact,
  onOpenAccount,
}: Props) {
  const {
    contacts,
    activeContacts,
    activeAccounts,
    contactRelations,
    upsertContact,
    removeContact,
    restoreContact,
    upsertContactRelation,
    removeContactRelation,
    setContactParent,
  } = useDomain();
  const { activeDirections } = useOrgConfig();

  const contact = contacts.find((c) => c.id === contactId) ?? null;
  const [relError, setRelError] = useState("");
  const [parentError, setParentError] = useState("");

  const accountFull = contact
    ? (activeAccounts.find((a) => a.id === contact.accountId) ?? null)
    : null;

  const directionLabel =
    activeDirections.find((d) => d.id === contact?.directionId)?.name ??
    contact?.directionId ??
    "";

  const parentId = contact
    ? getContactParentId(contact.id, contactRelations)
    : null;
  const parent = parentId
    ? (activeContacts.find((c) => c.id === parentId) ?? null)
    : null;

  const children = useMemo(() => {
    if (!contact) return [];
    return getContactChildrenIds(contact.id, contactRelations)
      .map((id) => activeContacts.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [contact, contactRelations, activeContacts]);

  const ownRelations = useMemo(() => {
    if (!contact) return [];
    return contactRelations.filter(
      (r) =>
        r.relation !== "ReportsTo" &&
        (r.source === contact.id || r.target === contact.id),
    );
  }, [contact, contactRelations]);

  const entreprises = activeAccounts.filter((a) => a.type === "Entreprise");

  if (!contact) {
    return (
      <div className="data-page contact-detail-page">
        <header className="data-page-head">
          <div>
            <button type="button" className="ghost back-link" onClick={onBack}>
              ← Retour à la liste
            </button>
            <h1>Contact introuvable</h1>
          </div>
        </header>
      </div>
    );
  }

  function patch(
    next: Partial<{
      name: string;
      title: string;
      accountId: string;
      directionId: string;
    }>,
  ) {
    upsertContact({
      id: contact!.id,
      name: next.name ?? contact!.name,
      title: next.title !== undefined ? next.title : contact!.title,
      accountId: next.accountId ?? contact!.accountId,
      directionId: next.directionId ?? contact!.directionId,
    });
  }

  function handleAddRelation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRelError("");
    const fd = new FormData(e.currentTarget);
    const otherId = String(fd.get("otherId") ?? "");
    const relation = String(fd.get("relation") ?? "") as ContactRelationType;
    const direction = String(fd.get("direction") ?? "out");
    if (!otherId || !relation) return;
    if (otherId === contactId) {
      setRelError("Choisis un autre contact.");
      return;
    }
    const source = direction === "out" ? contactId : otherId;
    const target = direction === "out" ? otherId : contactId;
    const exists = contactRelations.some(
      (r) =>
        r.relation === relation &&
        ((r.source === source && r.target === target) ||
          (r.source === target && r.target === source)),
    );
    if (exists) {
      setRelError("Ce lien existe déjà (dans un sens ou l’autre).");
      return;
    }
    upsertContactRelation({
      source,
      target,
      relation,
    });
    e.currentTarget.reset();
  }

  return (
    <div className="data-page contact-detail-page">
      <header className="data-page-head">
        <div>
          <button type="button" className="ghost back-link" onClick={onBack}>
            ← Retour à la liste
          </button>
          <h1>{contact.name}</h1>
          <p>
            {contact.title || "Sans titre"}
            {accountFull ? ` · ${accountFull.name}` : ""}
            {directionLabel ? ` · ${directionLabel}` : ""}
            {!contact.active ? " · désactivé" : ""}
          </p>
        </div>
        <div className="account-detail-actions">
          {contact.active ? (
            <button
              type="button"
              className="ghost danger-text"
              onClick={() => removeContact(contact.id)}
            >
              Désactiver
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() => restoreContact(contact.id)}
            >
              Réactiver
            </button>
          )}
        </div>
      </header>

      <section className="account-detail-kpis" aria-label="Indicateurs">
        <article>
          <span>Direction</span>
          <strong>{directionLabel || "—"}</strong>
        </article>
        <article>
          <span>Liens</span>
          <strong>{ownRelations.length}</strong>
        </article>
      </section>

      <section className="entry-subsection account-detail-fiche">
        <h2>Fiche</h2>
        <div className="data-form-grid">
          <label>
            Nom
            <input
              value={contact.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            Titre
            <input
              value={contact.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label>
            Entreprise
            <select
              value={contact.accountId}
              onChange={(e) => {
                const accountId = e.target.value;
                const firstDir = activeDirections[0]?.id ?? contact.directionId;
                patch({ accountId, directionId: firstDir });
              }}
            >
              {entreprises.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction
            <select
              value={contact.directionId}
              onChange={(e) => patch({ directionId: e.target.value })}
            >
              {activeDirections.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {accountFull && onOpenAccount && (
          <p className="muted">
            Entreprise :{" "}
            <button
              type="button"
              className="ghost linkish"
              onClick={() => onOpenAccount(accountFull.id)}
            >
              {accountFull.name}
            </button>
          </p>
        )}
      </section>

      <section className="entry-subsection">
        <h2>Hiérarchie</h2>
        <div className="data-form-grid">
          <label>
            Parent / N+1
            <select
              value={parentId ?? ""}
              onChange={(e) => {
                setParentError("");
                const next = e.target.value || null;
                const ok = setContactParent(contact.id, next);
                if (!ok) {
                  setParentError("Lien impossible (cycle ou contact invalide).");
                }
              }}
            >
              <option value="">Aucun (racine)</option>
              {activeContacts
                .filter((c) => c.id !== contact.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {parentError && <p className="entry-error">{parentError}</p>}
        {parent && (
          <p className="muted">
            Parent actuel :{" "}
            {onOpenContact ? (
              <button
                type="button"
                className="ghost linkish"
                onClick={() => onOpenContact(parent.id)}
              >
                {parent.name}
              </button>
            ) : (
              parent.name
            )}
          </p>
        )}
        {children.length > 0 && (
          <ul className="entry-list contact-children-list">
            {children.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="entry-list-main"
                  onClick={() => onOpenContact?.(c.id)}
                  disabled={!onOpenContact}
                >
                  <strong>{c.name}</strong>
                  <span className="meta">{c.title || "Enfant direct"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {children.length === 0 && (
          <p className="muted">Aucun report direct.</p>
        )}
      </section>

      <section className="entry-subsection">
        <h2>Réseau métier</h2>
        <p className="muted entry-hint">
          Influences, alliés, bloqueurs… — saisis ici sur la fiche contact.
        </p>
        <ul className="entry-list">
          {ownRelations.length === 0 && (
            <li className="muted">Aucun lien.</li>
          )}
          {ownRelations.map((r) => {
            const otherId = r.source === contact.id ? r.target : r.source;
            const other = contacts.find((c) => c.id === otherId);
            const outbound = r.source === contact.id;
            return (
              <li key={r.id}>
                <div>
                  <strong>
                    {outbound ? "→" : "←"}{" "}
                    {contactRelationLabel[r.relation]}
                  </strong>
                  <span className="meta">
                    {outbound ? "vers" : "depuis"}{" "}
                    {other ? (
                      onOpenContact ? (
                        <button
                          type="button"
                          className="ghost linkish"
                          onClick={() => onOpenContact(other.id)}
                        >
                          {other.name}
                        </button>
                      ) : (
                        other.name
                      )
                    ) : (
                      otherId
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeContactRelation(r.id)}
                >
                  Retirer
                </button>
              </li>
            );
          })}
        </ul>
        <form className="entry-form" onSubmit={handleAddRelation}>
          <div className="entry-grid">
            <label>
              Sens
              <select name="direction" defaultValue="out">
                <option value="out">Ce contact → autre</option>
                <option value="in">Autre → ce contact</option>
              </select>
            </label>
            <label>
              Type
              <select
                name="relation"
                defaultValue={METIER_CONTACT_RELATIONS[0]}
              >
                {METIER_CONTACT_RELATIONS.map((t) => (
                  <option key={t} value={t}>
                    {contactRelationLabel[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Autre contact
              <select name="otherId" required defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {activeContacts
                  .filter((c) => c.id !== contact.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {relError && <p className="entry-error">{relError}</p>}
          <button type="submit">Ajouter le lien</button>
        </form>
      </section>
    </div>
  );
}
