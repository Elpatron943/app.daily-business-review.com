import { useCallback, useEffect, useState } from "react";

export type HubSpotMappingConfig = {
  company: {
    nameProp: string;
    domainProp: string;
    sectorProp: string;
    ownerProp: string;
  };
  contact: {
    firstnameProp: string;
    lastnameProp: string;
    titleProp: string;
    emailProp: string;
    phoneProp: string;
    ownerProp: string;
  };
  deal: {
    nameProp: string;
    amountProp: string;
    closeDateProp: string;
    stageProp: string;
    ownerProp: string;
  };
  stageToPhase: Record<string, string>;
  phaseToStage: Record<string, string>;
  ownerToProfile: Record<string, string>;
};

type PropOption = { name: string; label: string };
type StageOption = {
  id: string;
  label: string;
  pipelineId: string;
  pipelineLabel: string;
};
type OwnerOption = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  label: string;
};
type TeamMember = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
};

type Props = {
  hubspotFetch: <T>(
    path: string,
    init?: RequestInit,
  ) => Promise<{ data?: T; error?: string; status: number }>;
  connected: boolean;
};

function PropSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PropOption[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="hubspot-map-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {value && !options.some((o) => o.name === value) ? (
          <option value={value}>{value} (custom)</option>
        ) : null}
        {options.map((o) => (
          <option key={o.name} value={o.name}>
            {o.label} ({o.name})
          </option>
        ))}
      </select>
    </label>
  );
}

function teamLabel(m: TeamMember) {
  return m.fullName ? `${m.fullName} (${m.email})` : m.email;
}

/** Éditeur mapping HubSpot → DBR (champs + gestionnaires → équipe). */
export default function HubspotMappingPanel({
  hubspotFetch,
  connected,
}: Props) {
  const [mapping, setMapping] = useState<HubSpotMappingConfig | null>(null);
  const [dbrPhases, setDbrPhases] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [companyProps, setCompanyProps] = useState<PropOption[]>([]);
  const [contactProps, setContactProps] = useState<PropOption[]>([]);
  const [dealProps, setDealProps] = useState<PropOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const mapRes = await hubspotFetch<{
      mapping: HubSpotMappingConfig;
      dbrPhases: string[];
      team: TeamMember[];
    }>("/mapping");
    if (mapRes.error || !mapRes.data) {
      setError(mapRes.error || "Mapping introuvable.");
      setLoading(false);
      return;
    }
    setMapping(mapRes.data.mapping);
    setDbrPhases(mapRes.data.dbrPhases || []);
    setTeam(mapRes.data.team || []);

    if (connected) {
      const schemaRes = await hubspotFetch<{
        companyProps: PropOption[];
        contactProps: PropOption[];
        dealProps: PropOption[];
        stages: StageOption[];
        owners: OwnerOption[];
      }>("/schema");
      if (schemaRes.data) {
        setCompanyProps(schemaRes.data.companyProps || []);
        setContactProps(schemaRes.data.contactProps || []);
        setDealProps(schemaRes.data.dealProps || []);
        setStages(schemaRes.data.stages || []);
        const hsOwners = schemaRes.data.owners || [];
        setOwners(hsOwners);

        // Suggestion auto : même e-mail HubSpot ↔ profil DBR
        setMapping((prev) => {
          if (!prev) return prev;
          const nextOwners = { ...prev.ownerToProfile };
          let changed = false;
          const teamByEmail = new Map(
            (mapRes.data?.team || []).map((t) => [
              t.email.trim().toLowerCase(),
              t.id,
            ]),
          );
          for (const o of hsOwners) {
            if (nextOwners[o.id]) continue;
            const match = o.email
              ? teamByEmail.get(o.email.trim().toLowerCase())
              : undefined;
            if (match) {
              nextOwners[o.id] = match;
              changed = true;
            }
          }
          return changed
            ? { ...prev, ownerToProfile: nextOwners }
            : prev;
        });
      } else if (schemaRes.error) {
        setError(schemaRes.error);
      }
    }
    setLoading(false);
  }, [connected, hubspotFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!mapping) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    const phaseToStage: Record<string, string> = {
      ...mapping.phaseToStage,
    };
    for (const [hsStage, dbrPhase] of Object.entries(mapping.stageToPhase)) {
      if (dbrPhase) phaseToStage[dbrPhase] = hsStage;
    }
    const payload = { ...mapping, phaseToStage };
    const { error: err } = await hubspotFetch("/mapping", {
      method: "PUT",
      body: JSON.stringify({ mapping: payload }),
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setMapping(payload);
    setInfo("Mapping enregistré.");
  }

  function setStagePhase(hsStageId: string, dbrPhase: string) {
    setMapping((prev) => {
      if (!prev) return prev;
      const stageToPhase = { ...prev.stageToPhase };
      if (!dbrPhase) delete stageToPhase[hsStageId];
      else stageToPhase[hsStageId] = dbrPhase;
      return { ...prev, stageToPhase };
    });
  }

  function setOwnerProfile(hsOwnerId: string, profileId: string) {
    setMapping((prev) => {
      if (!prev) return prev;
      const ownerToProfile = { ...prev.ownerToProfile };
      if (!profileId) delete ownerToProfile[hsOwnerId];
      else ownerToProfile[hsOwnerId] = profileId;
      return { ...prev, ownerToProfile };
    });
  }

  if (loading) {
    return <p className="muted">Chargement du mapping…</p>;
  }
  if (!mapping) {
    return error ? <p className="auth-error">{error}</p> : null;
  }

  const fallbackProps = (current: string): PropOption[] =>
    current ? [{ name: current, label: current }] : [];

  const coOpts = companyProps.length
    ? companyProps
    : fallbackProps(mapping.company.nameProp);
  const ctOpts = contactProps.length
    ? contactProps
    : fallbackProps(mapping.contact.firstnameProp);
  const dealOpts = dealProps.length
    ? dealProps
    : fallbackProps(mapping.deal.nameProp);

  const stageRows =
    stages.length > 0
      ? stages
      : Object.keys(mapping.stageToPhase).map((id) => ({
          id,
          label: id,
          pipelineId: "",
          pipelineLabel: "Configuré",
        }));

  const ownerRows =
    owners.length > 0
      ? owners
      : Object.keys(mapping.ownerToProfile).map((id) => ({
          id,
          email: "",
          firstName: "",
          lastName: "",
          label: id,
        }));

  return (
    <div className="hubspot-mapping">
      <h4 style={{ margin: "1rem 0 0.35rem" }}>Mapping des champs (CRM → DBR)</h4>
      <p className="muted team-admin-hint">
        L’admin mappe les propriétés HubSpot vers DBR : contact (prénom, nom),
        entreprise, montant d’affaire, gestionnaires, stages. Les gestionnaires
        HubSpot sont rattachés aux utilisateurs de ton équipe DBR.
      </p>

      {error ? <p className="auth-error">{error}</p> : null}
      {info ? <p className="auth-info">{info}</p> : null}

      <h4 className="settings-subhead">Entreprise (Company → Compte)</h4>
      <div className="hubspot-map-grid">
        <PropSelect
          label="Nom entreprise"
          value={mapping.company.nameProp}
          options={coOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              company: { ...mapping.company, nameProp: v },
            })
          }
        />
        <PropSelect
          label="Fallback nom (domaine)"
          value={mapping.company.domainProp}
          options={coOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              company: { ...mapping.company, domainProp: v },
            })
          }
        />
        <PropSelect
          label="Secteur"
          value={mapping.company.sectorProp}
          options={coOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              company: { ...mapping.company, sectorProp: v },
            })
          }
        />
        <PropSelect
          label="Gestionnaire du compte"
          value={mapping.company.ownerProp}
          options={coOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              company: { ...mapping.company, ownerProp: v },
            })
          }
        />
      </div>

      <h4 className="settings-subhead">Contact</h4>
      <div className="hubspot-map-grid">
        <PropSelect
          label="Prénom"
          value={mapping.contact.firstnameProp}
          options={ctOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              contact: { ...mapping.contact, firstnameProp: v },
            })
          }
        />
        <PropSelect
          label="Nom"
          value={mapping.contact.lastnameProp}
          options={ctOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              contact: { ...mapping.contact, lastnameProp: v },
            })
          }
        />
        <PropSelect
          label="Titre / job"
          value={mapping.contact.titleProp}
          options={ctOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              contact: { ...mapping.contact, titleProp: v },
            })
          }
        />
        <PropSelect
          label="E-mail"
          value={mapping.contact.emailProp}
          options={ctOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              contact: { ...mapping.contact, emailProp: v },
            })
          }
        />
        <PropSelect
          label="Téléphone"
          value={mapping.contact.phoneProp || "phone"}
          options={ctOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              contact: { ...mapping.contact, phoneProp: v },
            })
          }
        />
        <PropSelect
          label="Gestionnaire du contact"
          value={mapping.contact.ownerProp}
          options={ctOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              contact: { ...mapping.contact, ownerProp: v },
            })
          }
        />
      </div>

      <h4 className="settings-subhead">Affaire (Deal → Opportunité)</h4>
      <div className="hubspot-map-grid">
        <PropSelect
          label="Nom de l’affaire"
          value={mapping.deal.nameProp}
          options={dealOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              deal: { ...mapping.deal, nameProp: v },
            })
          }
        />
        <PropSelect
          label="Montant"
          value={mapping.deal.amountProp}
          options={dealOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              deal: { ...mapping.deal, amountProp: v },
            })
          }
        />
        <PropSelect
          label="Date de clôture"
          value={mapping.deal.closeDateProp}
          options={dealOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              deal: { ...mapping.deal, closeDateProp: v },
            })
          }
        />
        <PropSelect
          label="Stage"
          value={mapping.deal.stageProp}
          options={dealOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              deal: { ...mapping.deal, stageProp: v },
            })
          }
        />
        <PropSelect
          label="Gestionnaire de l’affaire"
          value={mapping.deal.ownerProp}
          options={dealOpts}
          onChange={(v) =>
            setMapping({
              ...mapping,
              deal: { ...mapping.deal, ownerProp: v },
            })
          }
        />
      </div>

      <h4 className="settings-subhead">
        Gestionnaires HubSpot → utilisateurs DBR
      </h4>
      <p className="muted team-admin-hint">
        Chaque owner HubSpot est lié à un membre de ton équipe. Suggestion
        auto si l’e-mail correspond.
      </p>
      {!connected ? (
        <p className="muted">Connecte HubSpot pour charger les owners.</p>
      ) : null}
      {team.length === 0 ? (
        <p className="muted">
          Aucun utilisateur dans l’équipe DBR — invite des commerciaux d’abord
          (Équipe).
        </p>
      ) : null}
      <div className="ecosystem-table-wrap">
        <table className="ecosystem-table">
          <thead>
            <tr>
              <th>Owner HubSpot</th>
              <th>E-mail HS</th>
              <th>Utilisateur DBR</th>
            </tr>
          </thead>
          <tbody>
            {ownerRows.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.label}</strong>
                  <div className="meta">{o.id}</div>
                </td>
                <td>{o.email || "—"}</td>
                <td>
                  <select
                    value={mapping.ownerToProfile[o.id] || ""}
                    onChange={(e) => setOwnerProfile(o.id, e.target.value)}
                  >
                    <option value="">— non mappé —</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {teamLabel(m)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="settings-subhead">Stages HubSpot → phases DBR</h4>
      <div className="ecosystem-table-wrap">
        <table className="ecosystem-table">
          <thead>
            <tr>
              <th>Stage HubSpot</th>
              <th>Pipeline</th>
              <th>Phase DBR</th>
            </tr>
          </thead>
          <tbody>
            {stageRows.map((st) => (
              <tr key={st.id}>
                <td>
                  <strong>{st.label}</strong>
                  <div className="meta">{st.id}</div>
                </td>
                <td>{st.pipelineLabel || "—"}</td>
                <td>
                  <select
                    value={mapping.stageToPhase[st.id] || ""}
                    onChange={(e) => setStagePhase(st.id, e.target.value)}
                  >
                    <option value="">— non mappé —</option>
                    {dbrPhases.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="settings-head-actions" style={{ marginTop: "0.75rem" }}>
        <button
          type="button"
          className="primary-cta"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "…" : "Enregistrer le mapping"}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={saving}
          onClick={() => void load()}
        >
          Recharger
        </button>
      </div>
    </div>
  );
}
