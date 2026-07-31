import type { ReactNode } from "react";
import { useOrgConfig } from "../config/ConfigContext";
import { defaultConfig } from "../config/defaults";
import type { InfoScreenId } from "./settingsInfoDiagrams";

function hl(active: boolean) {
  return active ? "sim-hl" : undefined;
}

function has(highlight: string, key: string) {
  return highlight.split("+").includes(key) || highlight === key;
}

/** Maquette d’écran app avec zone concernée surlignée. */
export default function SettingsInfoScreenMock({
  screen,
  highlight,
}: {
  screen: InfoScreenId;
  highlight: string;
}) {
  switch (screen) {
    case "dashboard-risk":
      return <MockDashboardRisk highlight={highlight} />;
    case "dashboard-kpi":
      return <MockDashboardKpi highlight={highlight} />;
    case "contact-fiche":
      return <MockContactFiche highlight={highlight} />;
    case "cartographie":
      return <MockCartographie highlight={highlight} />;
    case "entreprise-fiche":
      return <MockEntrepriseFiche highlight={highlight} />;
    case "opp-header":
      return <MockOppHeader highlight={highlight} />;
    case "opp-process":
      return <MockOppProcess highlight={highlight} />;
    case "opp-mapping":
      return <MockOppMapping highlight={highlight} />;
    case "opp-roi":
      return <MockOppRoi highlight={highlight} />;
    case "opp-variables":
      return <MockOppVariables highlight={highlight} />;
    case "opp-ai":
      return <MockOppAi highlight={highlight} />;
    case "account-plan":
      return <MockAccountPlan highlight={highlight} />;
    case "org-profile":
      return <MockOrgProfile highlight={highlight} />;
    case "whitespace":
      return <MockWhitespace highlight={highlight} />;
    case "data-import":
      return <MockDataImport highlight={highlight} />;
    case "data-crm":
      return <MockDataCrm highlight={highlight} />;
    default:
      return null;
  }
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sim-screen" aria-hidden>
      <div className="sim-chrome">
        <span className="sim-dot" />
        <span className="sim-dot" />
        <span className="sim-dot" />
        <strong>{title}</strong>
      </div>
      <div className="sim-body">{children}</div>
    </div>
  );
}

function MockDashboardRisk({ highlight }: { highlight: string }) {
  const { config } = useOrgConfig();
  const m = config.riskMatrix ?? defaultConfig.riskMatrix;
  const high = m.axisLabels.processHigh || "Élevé";
  const mid = m.axisLabels.processMid || "Moyen";
  const low = m.axisLabels.processLow || "Faible";
  const pipeline = m.axisLabels.pipeline || "Mapping";
  const hlPoint = has(highlight, "point") || has(highlight, "point+axes");
  const hlAxes = has(highlight, "axes") || has(highlight, "point+axes");

  return (
    <Shell title="Dashboard">
      <p className="sim-section-title">Matrice process × mapping</p>
      <div className="sim-risk">
        <div className={hl(hlAxes)}>
          <div className="sim-risk-y">
            <span>{high}</span>
            <span>{mid}</span>
            <span>{low}</span>
          </div>
        </div>
        <div className="sim-risk-plot">
          <i className={hlPoint ? "sim-risk-dot sim-hl" : "sim-risk-dot"} />
          <i className="sim-risk-dot dim" style={{ left: "28%", top: "62%" }} />
          <i className="sim-risk-dot dim" style={{ left: "58%", top: "38%" }} />
          <i className="sim-risk-dot dim" style={{ left: "72%", top: "55%" }} />
        </div>
      </div>
      <div className={`sim-risk-x ${hl(hlAxes) ?? ""}`}>
        <span>≤{m.processLowThreshold}%</span>
        <span>{pipeline}</span>
        <span>≥{m.processHighThreshold}%</span>
      </div>
      {(hlPoint || hlAxes) && (
        <p className="sim-callout">
          {hlPoint && hlAxes
            ? "Point coloré selon vos seuils · libellés d’axes issus de Settings"
            : hlPoint
              ? "Couleur du point = vos seuils process"
              : "Libellés d’axes = textes Settings"}
        </p>
      )}
    </Shell>
  );
}

function MockDashboardKpi({ highlight }: { highlight: string }) {
  const both = has(highlight, "ca") || has(highlight, "cible") || has(highlight, "ca+cible");
  return (
    <Shell title="Dashboard">
      <div className="sim-kpi-row">
        <div className={`sim-kpi ${hl(both || has(highlight, "ca")) ?? ""}`}>
          <span>CA installé</span>
          <strong>1,2 M€</strong>
          <em>Clients · ventes / Won</em>
        </div>
        <div className={`sim-kpi ${hl(both || has(highlight, "cible")) ?? ""}`}>
          <span>Cible</span>
          <strong>3,4 M€</strong>
          <em>Whitespace · pipeline…</em>
        </div>
      </div>
      <p className="sim-callout">
        Périmètre des totaux = cases cochées dans Règles KPI
      </p>
    </Shell>
  );
}

function MockContactFiche({ highlight }: { highlight: string }) {
  const { activeContactTypes, activePersonae } = useOrgConfig();
  const type =
    activeContactTypes[0]?.label ?? "Economic Buyer";
  const typeColor = activeContactTypes[0]?.color ?? "#0f766e";
  const dir = activePersonae[0]?.name ?? "Finance";

  return (
    <Shell title="Contact — Marie Dupont">
      <div className="sim-form">
        <label>
          Nom
          <span className="sim-fake-input">Marie Dupont</span>
        </label>
        <label className={hl(has(highlight, "type"))}>
          Type
          <span className="sim-fake-input sim-with-swatch">
            <i style={{ background: typeColor }} />
            {type}
          </span>
        </label>
        <label className={hl(has(highlight, "persona"))}>
          Persona
          <span className="sim-fake-input">{dir}</span>
        </label>
      </div>
      {has(highlight, "type") && (
        <p className="sim-callout">Liste = Types de contacts (Settings)</p>
      )}
      {has(highlight, "persona") && (
        <p className="sim-callout">Liste = Personae (Settings → Qui vous êtes)</p>
      )}
    </Shell>
  );
}

function MockCartographie({ highlight }: { highlight: string }) {
  const { activeContactTypes } = useOrgConfig();
  const sample = activeContactTypes.slice(0, 4);
  const types = sample.length
    ? sample
    : [
        { id: "1", label: "Champion", color: "#0f766e" },
        { id: "2", label: "Economic Buyer", color: "#ca8a04" },
      ];

  return (
    <Shell title="Cartographie">
      <div className="sim-map">
        {types.map((t, i) => (
          <span
            key={t.id}
            className={`sim-map-dot ${hl(has(highlight, "dot")) ?? ""}`}
            style={{
              background: t.color,
              left: `${20 + i * 18}%`,
              top: `${32 + (i % 2) * 26}%`,
            }}
          />
        ))}
      </div>
      <ul className={`sim-legend ${hl(has(highlight, "dot")) ?? ""}`}>
        {types.map((t) => (
          <li key={t.id}>
            <i style={{ background: t.color }} />
            {t.label}
          </li>
        ))}
      </ul>
      <p className="sim-callout">Pastilles & légende = Types de contacts</p>
    </Shell>
  );
}

function MockEntrepriseFiche({ highlight }: { highlight: string }) {
  return (
    <Shell title="Entreprise — ACME SA">
      <div className="sim-form">
        <label>
          Nom
          <span className="sim-fake-input">ACME SA</span>
        </label>
        <label className={hl(has(highlight, "sector"))}>
          Secteur
          <span className="sim-fake-input">Industrie</span>
        </label>
        <label className={hl(has(highlight, "status") || has(highlight, "status+size"))}>
          Statut
          <span className="sim-fake-input">Client</span>
        </label>
        <label className={hl(has(highlight, "size") || has(highlight, "status+size"))}>
          Taille
          <span className="sim-fake-input">250–999</span>
        </label>
      </div>
    </Shell>
  );
}

function MockOppHeader({ highlight }: { highlight: string }) {
  return (
    <Shell title="Opportunité — Renouvellement ACME">
      <div className="sim-form sim-form-row">
        <label className={hl(has(highlight, "phase") || has(highlight, "phase+kind"))}>
          Phase
          <span className="sim-fake-input">Proposal</span>
        </label>
        <label className={hl(has(highlight, "kind") || has(highlight, "phase+kind"))}>
          Nature
          <span className="sim-fake-input">Upsell</span>
        </label>
        <label className={hl(has(highlight, "offer"))}>
          Solution
          <span className="sim-fake-input">Suite Pro</span>
        </label>
      </div>
    </Shell>
  );
}

function MockOppProcess({ highlight }: { highlight: string }) {
  const hlQ = has(highlight, "questions") || has(highlight, "questions+score");
  const hlS = has(highlight, "score") || has(highlight, "questions+score");
  return (
    <Shell title="Opportunité → Process">
      <div className={`sim-calc ${hl(hlS) ?? ""}`}>
        <span>Score Process</span>
        <strong>72%</strong>
        <em>Calculé à partir des réponses</em>
      </div>
      <ul className={`sim-checklist ${hl(hlQ) ?? ""}`}>
        <li>
          <b>✓</b> Besoin identifié ?
        </li>
        <li>
          <b>✓</b> Budget confirmé ?
        </li>
        <li>
          <b>○</b> Décideur engagé ?
        </li>
      </ul>
      <p className="sim-callout">
        Questions = Settings Process · % = calcul automatique
      </p>
    </Shell>
  );
}

function MockOppMapping({ highlight }: { highlight: string }) {
  const hlC = has(highlight, "cards") || has(highlight, "cards+score");
  const hlS = has(highlight, "score") || has(highlight, "cards+score");
  return (
    <Shell title="Opportunité → Mapping">
      <div className={`sim-calc ${hl(hlS) ?? ""}`}>
        <span>Score Mapping</span>
        <strong>58%</strong>
        <em>Maîtrise des cartes</em>
      </div>
      <div className={`sim-cards ${hl(hlC) ?? ""}`}>
        <span className="ok">Force ✓</span>
        <span className="ok">USP ✓</span>
        <span>Risque ○</span>
        <span className="ko">Signal ✗</span>
      </div>
      <p className="sim-callout">
        Cartes = Settings Mapping · score = calcul automatique
      </p>
    </Shell>
  );
}

function MockOppRoi({ highlight }: { highlight: string }) {
  const hlF = has(highlight, "fields") || has(highlight, "fields+total");
  const hlT = has(highlight, "total") || has(highlight, "fields+total");
  return (
    <Shell title="Opportunité → Valeur / ROI">
      <div className={`sim-form ${hl(hlF) ?? ""}`}>
        <label>
          Gain productivité
          <span className="sim-fake-input">120 000 €</span>
        </label>
        <label>
          Coût évité
          <span className="sim-fake-input">45 000 €</span>
        </label>
      </div>
      <div className={`sim-calc ${hl(hlT) ?? ""}`}>
        <span>Bénéfice total</span>
        <strong>165 000 €</strong>
        <em>Somme calculée</em>
      </div>
      <p className="sim-callout">
        Libellés des champs = Business Outcomes · total = calcul
      </p>
    </Shell>
  );
}

function MockOppVariables({ highlight }: { highlight: string }) {
  return (
    <Shell title="Opportunité → Variables">
      <div className={`sim-form ${hl(has(highlight, "fields")) ?? ""}`}>
        <label>
          Licences
          <span className="sim-fake-input">250</span>
        </label>
        <label>
          Users
          <span className="sim-fake-input">40</span>
        </label>
      </div>
      <p className="sim-callout">Champs = Variables deal (Settings)</p>
    </Shell>
  );
}

function MockOppAi({ highlight }: { highlight: string }) {
  return (
    <Shell title="Opportunité → Analyse IA">
      <div className="sim-ai">
        <div className={`sim-ai-block ${hl(has(highlight, "org")) ?? ""}`}>
          <span>Contexte vendeur</span>
          <p>Profil & USP org injectés dans le prompt</p>
        </div>
        <div className={`sim-ai-block ${hl(has(highlight, "process")) ?? ""}`}>
          <span>Gaps Process</span>
          <p>Questions non maîtrisées → priorités</p>
        </div>
        <div className={`sim-ai-block ${hl(has(highlight, "mapping")) ?? ""}`}>
          <span>SWOT / Mapping</span>
          <p>Forces, risques et USP à pousser</p>
        </div>
        <div className={`sim-ai-block ${hl(has(highlight, "intel")) ?? ""}`}>
          <span>Intel deal</span>
          <p>Compelling Events & concurrents</p>
        </div>
      </div>
      <p className="sim-callout">
        L’IA lit vos catalogues + les réponses du deal
      </p>
    </Shell>
  );
}

function MockAccountPlan({ highlight }: { highlight: string }) {
  return (
    <Shell title="Account plan">
      <div className="sim-plan">
        <div className={hl(has(highlight, "actions")) ?? ""}>
          <span>Vision & objectifs</span>
          <ul>
            <li>Action 1 — découverte sponsors</li>
            <li>Action 2 — atelier valeur</li>
          </ul>
        </div>
        <div className={hl(has(highlight, "value")) ?? ""}>
          <span>Discours valeur</span>
          <p>165 k€ — issus des Business Outcomes</p>
        </div>
      </div>
    </Shell>
  );
}

function MockOrgProfile({ highlight }: { highlight: string }) {
  return (
    <Shell title="Settings — Qui vous êtes">
      <div className="sim-form">
        <label className={hl(has(highlight, "path") || has(highlight, "usp"))}>
          Nom org
          <span className="sim-fake-input">Votre société</span>
        </label>
        <label className={hl(has(highlight, "usp"))}>
          USP
          <span className="sim-fake-input">Time-to-value · ROI mesurable</span>
        </label>
      </div>
    </Shell>
  );
}

function MockWhitespace({ highlight }: { highlight: string }) {
  return (
    <Shell title="Compte — Whitespace">
      <ul className={`sim-checklist ${hl(has(highlight, "modules")) ?? ""}`}>
        <li>
          <b>✓</b> Module Core — vendu
        </li>
        <li>
          <b>○</b> Module Analytics — manquant
        </li>
        <li>
          <b>○</b> Module AI — manquant
        </li>
      </ul>
      <p className="sim-callout">Lignes = Catalogue solutions</p>
    </Shell>
  );
}

function MockDataImport({ highlight }: { highlight: string }) {
  return (
    <Shell title="Settings — Import Excel">
      <div className={`sim-upload ${hl(has(highlight, "upload")) ?? ""}`}>
        <strong>Déposer le fichier .xlsx</strong>
        <em>Entreprises · Contacts · Opps · Ventes</em>
      </div>
    </Shell>
  );
}

function MockDataCrm({ highlight }: { highlight: string }) {
  return (
    <Shell title="Settings — CRM HubSpot">
      <div className={`sim-upload ${hl(has(highlight, "sync")) ?? ""}`}>
        <strong>Connecté · Pull / Push</strong>
        <em>Mapping champs & phases</em>
      </div>
    </Shell>
  );
}
