import { useMemo, useState } from "react";
import { roleLabel, useAuth, type AppRole } from "./AuthContext";

/** Gestion de l’équipe commerciale — réservé admin. */
export default function TeamAdminPanel({ onClose }: { onClose: () => void }) {
  const { profile, team, updateTeamMember, refreshTeam, user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...team].sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.email.localeCompare(b.email, "fr");
      }),
    [team],
  );

  async function setRole(userId: string, role: AppRole) {
    setError(null);
    setBusyId(userId);
    const err = await updateTeamMember(userId, { role });
    if (err) setError(err);
    setBusyId(null);
  }

  async function setInMyTeam(userId: string, inTeam: boolean) {
    if (!user) return;
    setError(null);
    setBusyId(userId);
    const err = await updateTeamMember(userId, {
      manager_id: inTeam ? user.id : null,
    });
    if (err) setError(err);
    setBusyId(null);
  }

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-panel team-admin-panel">
        <header className="settings-head">
          <div>
            <h2>Équipe commerciale</h2>
            <p className="muted">
              Admin : {profile?.email}. Les commerciaux n’ont pas accès à
              Personnaliser.
            </p>
          </div>
          <div className="settings-head-actions">
            <button type="button" className="ghost" onClick={() => void refreshTeam()}>
              Actualiser
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              Fermer
            </button>
          </div>
        </header>

        {error ? <p className="auth-error">{error}</p> : null}

        <p className="muted team-admin-hint">
          Les comptes sont créés hors de DBR (console admin / forfait users).
          Ici, tu gères les rôles et le rattachement à ton équipe commerciale.
        </p>

        {sorted.length === 0 ? (
          <p className="muted">Aucun profil visible.</p>
        ) : (
          <div className="ecosystem-table-wrap">
            <table className="ecosystem-table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Nom</th>
                  <th>Rôle</th>
                  <th>Dans mon équipe</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => {
                  const isSelf = m.id === user?.id;
                  const inTeam = m.manager_id === user?.id;
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.email}</strong>
                        {isSelf ? <span className="meta"> · toi</span> : null}
                      </td>
                      <td>{m.full_name || "—"}</td>
                      <td>
                        <span className={`role-pill role-${m.role}`}>
                          {roleLabel[m.role]}
                        </span>
                      </td>
                      <td>
                        {isSelf ? (
                          "—"
                        ) : (
                          <label className="sold-check">
                            <input
                              type="checkbox"
                              checked={inTeam}
                              disabled={busyId === m.id}
                              onChange={(e) =>
                                void setInMyTeam(m.id, e.target.checked)
                              }
                            />
                            <span>{inTeam ? "Oui" : "Non"}</span>
                          </label>
                        )}
                      </td>
                      <td>
                        {!isSelf && (
                          <select
                            value={m.role}
                            disabled={busyId === m.id}
                            onChange={(e) =>
                              void setRole(m.id, e.target.value as AppRole)
                            }
                          >
                            <option value="user">Commercial</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
