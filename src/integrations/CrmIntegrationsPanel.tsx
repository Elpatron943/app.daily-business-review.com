import HubspotConnectorPanel from "./HubspotConnectorPanel";
import HubspotLogo from "./logos/HubspotLogo";
import SalesforceLogo from "./logos/SalesforceLogo";

/**
 * Settings → Intégrations CRM.
 * Chaque organisation connecte son propre CRM (HubSpot, Salesforce…).
 * Les Client ID / Secret OAuth restent secrets plateforme (Netlify / .env serveur),
 * jamais saisis par le client.
 */
export default function CrmIntegrationsPanel() {
  return (
    <div className="crm-integrations">
      <header style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ margin: "0 0 0.35rem" }}>Intégrations CRM</h3>
        <p className="muted" style={{ margin: 0 }}>
          Connecte le CRM de <strong>ton organisation</strong>. Un client peut
          utiliser HubSpot, un autre Salesforce — les données restent isolées
          par organisation. Tu n’as pas à coller de clé API ici : l’autorisation
          se fait via OAuth sécurisé.
        </p>
        <ul className="crm-connector-badges" aria-label="Connecteurs disponibles">
          <li className="crm-connector-badge">
            <HubspotLogo size={22} />
            <span>HubSpot</span>
            <span className="crm-connector-badge-state">Disponible</span>
          </li>
          <li className="crm-connector-badge crm-connector-badge-soon">
            <SalesforceLogo size={22} />
            <span>Salesforce</span>
            <span className="crm-connector-badge-state">Bientôt</span>
          </li>
        </ul>
      </header>

      <HubspotConnectorPanel />

      <section className="team-invite-block crm-connector-card">
        <div className="crm-connector-head">
          <SalesforceLogo size={32} />
          <div>
            <h3>Salesforce</h3>
            <p className="muted team-admin-hint" style={{ margin: 0 }}>
              Bientôt : même parcours « Connecter » depuis ces Settings, avec
              une connexion indépendante par organisation.
            </p>
          </div>
        </div>
        <button type="button" className="ghost" disabled>
          Bientôt disponible
        </button>
      </section>
    </div>
  );
}
