import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  applyNodeChanges,
  ConnectionMode,
  type Node,
  type Edge,
  type NodeProps,
  type OnNodesChange,
  type NodeChange,
  type Connection,
  type OnConnect,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import SettingsPanel from "./SettingsPanel";
import DataEntryPanel, { type DataSection } from "./DataEntryPanel";
import DashboardPage from "./DashboardPage";
import AccountPlanPage from "./AccountPlanPage";
import OptionalModulePage from "./OptionalModulePage";
import SoldSolutionEditor from "./SoldSolutionEditor";
import SameSectorPanel, {
  buildPeerGroups,
  type PeerFilters,
} from "./SameSectorPanel";
import AccountOpportunitiesInfluenceOverview from "./AccountOpportunitiesInfluenceOverview";
import { useOrgConfig } from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";
import { isModuleEnabled } from "./billing/optionalModules";
import {
  isDataSection,
  isOptionalModulePage,
  NAV_DATA,
  NAV_MAIN,
  NAV_PILOTAGE,
  type AppPage,
} from "./navigation";
import {
  accountTypeLabel,
  aggregateKpis,
  buildHoldingEdges,
  companyRelationLabel,
  contactRelationLabel,
  engagementLabel,
  formatEur,
  getContactChildrenIds,
  getContactParentId,
  opportunitiesForAccountScope,
  salesForAccountScope,
  soldLinePersonaIds,
  type AccountType,
  type CommercialStatus,
  type CompanyRelationType,
  type ContactRelationType,
  type ScopeKpis,
  type Status,
} from "./data";
import {
  computeAccountHealth,
  computeWhiteSpace,
  contactsOnAccount,
  useAccountPlans,
} from "./accountPlans/AccountPlanContext";
import { useOpportunities } from "./opportunities/OpportunityContext";
import { useAuth } from "./auth/AuthContext";
import AuthScreen from "./auth/AuthScreen";
import ResetPasswordScreen from "./auth/ResetPasswordScreen";
import TeamAdminPanel from "./auth/TeamAdminPanel";
import BillingQuotaBanner from "./billing/BillingQuotaBanner";
import LanguageSwitcher from "./i18n/LanguageSwitcher";
import { useT } from "./i18n/LocaleContext";
import type { MessageKey } from "./i18n/messages";

function statusClass(s: CommercialStatus) {
  return `status-${s.toLowerCase()}`;
}

function KpiPanel({ kpis }: { kpis: ScopeKpis }) {
  return (
    <section className="kpi-panel">
      <h2>KPI · {kpis.scopeLabel}</h2>
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">CA installé</span>
          <strong>{formatEur(kpis.billedAmount)}</strong>
          <span className="kpi-sublabel">stock facturé</span>
        </div>
        <div className="kpi-card kpi-potential">
          <span className="kpi-label">Pipeline</span>
          <strong>{formatEur(kpis.potentialAmount)}</strong>
          <span className="kpi-sublabel">opps engagées</span>
        </div>
        <div className="kpi-card kpi-whitespace">
          <span className="kpi-label">Whitespace</span>
          <strong>{formatEur(kpis.whitespaceAmount)}</strong>
          <span className="kpi-sublabel">à qualifier</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Renouvellements en cours</span>
          <strong>{formatEur(kpis.renewalAmount)}</strong>
          <span className="kpi-sublabel">ouverts · pas encore gagnés</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Montant cible</span>
          <strong>{formatEur(kpis.targetAmount)}</strong>
          <span className="kpi-sublabel">WS + pipeline + renouv.</span>
        </div>
      </div>

      {kpis.bySolution.length === 0 ? (
        <p className="muted">Aucune solution / opportunité sur ce périmètre.</p>
      ) : (
        <ul className="kpi-solutions">
          {kpis.bySolution.map((line) => (
            <li key={line.solutionId}>
              <div className="kpi-sol-head">
                <strong>{line.name}</strong>
                <span
                  className={
                    line.potentialAmount > 0
                      ? "tag-hunt"
                      : line.whitespaceAmount > 0
                        ? "tag-whitespace"
                        : "tag-covered"
                  }
                >
                  {line.potentialAmount > 0
                    ? `Pipeline ${formatEur(line.potentialAmount)}`
                    : line.whitespaceAmount > 0
                      ? `Whitespace ${formatEur(line.whitespaceAmount)}`
                      : line.targetAmount > 0
                        ? "Pipeline clos"
                        : "Pas de pipeline"}
                </span>
              </div>
              <div className="kpi-sol-metrics">
                <span>CA {formatEur(line.billedAmount)}</span>
                <span>Cible {formatEur(line.targetAmount)}</span>
              </div>
              <div className="kpi-bar">
                <span
                  style={{
                    width: `${
                      line.targetAmount > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (line.billedAmount / line.targetAmount) * 100,
                            ),
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountNode({ data }: NodeProps) {
  const { statusLabel } = useOrgConfig();
  const d = data as {
    name: string;
    type: string;
    commercialStatus: CommercialStatus;
    holdingName?: string;
    solutions: { name: string; amount: number }[];
    billed: number;
    potential: number;
    isFocus?: boolean;
  };
  return (
    <div
      className={`node account-node ${statusClass(d.commercialStatus)}${
        d.isFocus ? " is-focus" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="handle" />
      <Handle
        type="target"
        id="side-in"
        position={Position.Left}
        className="handle"
      />
      <span className="node-eyebrow">
        {accountTypeLabel[d.type as AccountType] ?? d.type}
      </span>
      <strong>{d.name}</strong>
      <span className={`badge ${statusClass(d.commercialStatus)}`}>
        {statusLabel(d.commercialStatus)}
      </span>
      {d.holdingName && (
        <span className="node-meta">Groupe : {d.holdingName}</span>
      )}
      {(d.billed > 0 || d.potential > 0) && (
        <span className="node-meta kpi-inline">
          CA {formatEur(d.billed)}
          {d.potential > 0 ? ` · Pot. ${formatEur(d.potential)}` : ""}
        </span>
      )}
      {d.solutions.length > 0 && (
        <div className="solution-chips">
          {d.solutions.map((s) => (
            <span key={s.name} className="solution-chip">
              {s.name}
              {s.amount > 0 ? ` · ${formatEur(s.amount)}` : ""}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="handle" />
      <Handle
        type="source"
        id="side"
        position={Position.Right}
        className="handle"
      />
    </div>
  );
}

/** Espacement horizontal en mode comparables (nœuds ~170–250px + focus scale). */
const PEER_LAYOUT_GAP = 300;

/**
 * Recale les entreprises visibles autour du cœur (affichage seul, sans toucher x/y stockés).
 * Évite les overlaps quand les positions d’origine sont trop serrées.
 */
function peerCompareLayoutPositions(
  focusId: string,
  focusPos: { x: number; y: number },
  peerIds: string[],
): Map<string, { x: number; y: number }> {
  const sorted = peerIds.slice().sort((a, b) => a.localeCompare(b));
  const mid = Math.ceil(sorted.length / 2);
  const ordered = [...sorted.slice(0, mid), focusId, ...sorted.slice(mid)];
  const focusIndex = ordered.indexOf(focusId);
  const map = new Map<string, { x: number; y: number }>();
  ordered.forEach((id, i) => {
    map.set(id, {
      x: focusPos.x + (i - focusIndex) * PEER_LAYOUT_GAP,
      y: focusPos.y,
    });
  });
  return map;
}

/** Centre / cadre le compte cœur (+ comparables visibles). */
function FocusAccountCamera({
  focusId,
  peerIds,
}: {
  focusId: string | null;
  peerIds: string[];
}) {
  const { getNode, fitView, setCenter } = useReactFlow();
  const peerKey = peerIds.slice().sort().join("|");

  useEffect(() => {
    if (!focusId) return;
    const frame = requestAnimationFrame(() => {
      const ids = [focusId, ...peerIds];
      const nodes = ids
        .map((id) => getNode(id))
        .filter((n): n is NonNullable<typeof n> => Boolean(n));
      if (nodes.length > 1) {
        fitView({ nodes, padding: 0.28, duration: 450, maxZoom: 1.05 });
        return;
      }
      const node = getNode(focusId);
      if (!node) return;
      const w = node.measured?.width ?? 200;
      const h = node.measured?.height ?? 110;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: 1.05,
        duration: 450,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusId, peerKey, peerIds, getNode, fitView, setCenter]);

  return null;
}

function ContactNode({ data }: NodeProps) {
  const { contactTypeLabel, contactTypeColor } = useOrgConfig();
  const d = data as {
    name: string;
    title: string;
    role: string;
    status?: Status;
    mapped: boolean;
    personaName: string;
    accountName: string;
  };
  const status = d.mapped ? (d.status ?? "Unknown") : "Unknown";
  const hasRole = Boolean(d.role);
  const color = hasRole ? contactTypeColor(d.role) : "#9ca3af";
  return (
    <div
      className={`node contact-node status-${status.toLowerCase()}${
        d.mapped ? " is-mapped" : " is-unmapped"
      }`}
      style={{
        borderLeftColor: color,
        borderLeftWidth: 4,
      }}
    >
      <Handle type="target" position={Position.Top} className="handle" />
      <span className="node-eyebrow" style={{ color }}>
        {d.mapped
          ? hasRole
            ? contactTypeLabel(d.role)
            : "Type non défini"
          : "Hors deal"}
      </span>
      <strong>{d.name}</strong>
      <span className="node-meta">{d.title}</span>
      <span className="node-persona">{d.personaName}</span>
      <span className="node-meta">{d.accountName}</span>
      {d.mapped ? (
        <span className="node-meta" style={{ color }}>
          {status}
        </span>
      ) : (
        <span className="node-meta">Hors deal actif</span>
      )}
      <Handle type="source" position={Position.Bottom} className="handle" />
      <Handle
        type="source"
        id="side"
        position={Position.Right}
        className="handle"
      />
      <Handle
        type="target"
        id="side-in"
        position={Position.Left}
        className="handle"
      />
    </div>
  );
}

const nodeTypes = {
  account: AccountNode,
  contact: ContactNode,
};

const companyEdgeStyle: Record<
  CompanyRelationType | "holdingOf" | "hasMember",
  { stroke: string; strokeDasharray?: string; width?: number }
> = {
  holdingOf: { stroke: "#374151", width: 2.5 },
  hasMember: { stroke: "#a8a29e", strokeDasharray: "4 4", width: 1.5 },
  PartnerOf: { stroke: "#2563eb", width: 2.5 },
  CompetitorOf: { stroke: "#b91c1c", strokeDasharray: "6 3", width: 2.5 },
  SameSectorAs: { stroke: "#a16207", strokeDasharray: "4 4", width: 2 },
  SupplierOf: { stroke: "#b45309", strokeDasharray: "4 3", width: 2 },
  CustomerOf: { stroke: "#0f766e", width: 2 },
  InvestorIn: { stroke: "#7c3aed", width: 2 },
};

const contactEdgeStyle: Record<
  ContactRelationType,
  { stroke: string; strokeDasharray?: string; width?: number }
> = {
  ReportsTo: { stroke: "#374151", width: 2 },
  Influences: { stroke: "#0f766e", width: 2 },
  AlliesWith: { stroke: "#2563eb", strokeDasharray: "6 3", width: 2 },
  Blocks: { stroke: "#b91c1c", width: 2.5 },
  FormerColleague: { stroke: "#9333ea", strokeDasharray: "5 4", width: 2 },
  Knows: { stroke: "#64748b", strokeDasharray: "2 3", width: 1.75 },
};

export default function App() {
  const {
    loading: authLoading,
    user,
    profile,
    can: canPerm,
    profileError,
    passwordRecovery,
    signOut,
    billing,
  } = useAuth();
  const t = useT();
  const [teamOpen, setTeamOpen] = useState(false);

  function navLabel(id: AppPage): string {
    const key =
      id === "account-plans"
        ? "nav.accountPlans"
        : id === "ai_phone_script"
          ? "nav.ai_phone_script"
          : id === "ai_email_script"
            ? "nav.ai_email_script"
            : (`nav.${id}` as MessageKey);
    return t(key);
  }

  function roleText(role: "admin" | "manager" | "user" | "viewer") {
    if (role === "admin") return t("role.admin");
    if (role === "manager") return t("role.manager");
    if (role === "viewer") return t("role.viewer");
    return t("role.user");
  }
  const {
    activeSolutions,
    activeContactTypes,
    activeCommercialStatuses,
    catalogFeatures,
    solutionLabel,
    contactTypeLabel,
    personaLabel,
    salesTaxonomy,
    statusLabel,
  } = useOrgConfig();
  const { soldSolutions } = useSales();
  const {
    activeAccounts,
    activeContacts,
    companyRelations,
    contactRelations,
    setMapNodePosition,
    setAccountHolding,
    setContactParent,
  } = useDomain();
  const { getPlanForAccount, getPlanForOpportunity } = useAccountPlans();
  const { activeOpportunity, activeOpportunities } = useOpportunities();

  const holdingEdges = useMemo(
    () => buildHoldingEdges(activeAccounts),
    [activeAccounts],
  );

  const accountContactEdges = useMemo(
    () =>
      activeContacts.map((c) => ({
        id: `e-${c.accountId}-${c.id}`,
        source: c.accountId,
        target: c.id,
        type: "hasMember" as const,
      })),
    [activeContacts],
  );

  const [page, setPage] = useState<AppPage>("dashboard");
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const navigate = useCallback((next: AppPage) => {
    if (next === "account-plans") {
      const id = sessionStorage.getItem("powermap.openPlanId");
      if (id) {
        sessionStorage.removeItem("powermap.openPlanId");
        setOpenPlanId(id);
      }
    }
    setPage(next);
  }, []);

  useEffect(() => {
    if (
      isOptionalModulePage(page) &&
      !isModuleEnabled(billing.organization?.optional_modules, page)
    ) {
      setPage("dashboard");
    }
  }, [page, billing.organization?.optional_modules]);

  useEffect(() => {
    if (page === "settings" && !canPerm("settings.access")) {
      setPage("dashboard");
    }
  }, [page, profile?.role, canPerm]);

  const [visibleCommercialStatuses, setVisibleCommercialStatuses] = useState<
    Record<string, boolean>
  >({});
  const [showContacts, setShowContacts] = useState(false);
  const [showContactLinks, setShowContactLinks] = useState(false);
  const [visibleRoles, setVisibleRoles] = useState<Record<string, boolean>>(
    {},
  );

  const [visibleSolutions, setVisibleSolutions] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setVisibleRoles((prev) => {
      const next = { ...prev };
      for (const t of activeContactTypes) {
        if (next[t.id] === undefined) next[t.id] = false;
      }
      return next;
    });
  }, [activeContactTypes]);

  useEffect(() => {
    setVisibleCommercialStatuses((prev) => {
      const next = { ...prev };
      for (const s of activeCommercialStatuses) {
        if (next[s.id] === undefined) next[s.id] = false;
      }
      return next;
    });
  }, [activeCommercialStatuses]);

  useEffect(() => {
    setVisibleSolutions((prev) => {
      const next = { ...prev };
      for (const s of activeSolutions) {
        if (next[s.id] === undefined) next[s.id] = false;
      }
      return next;
    });
  }, [activeSolutions]);

  const isCommercialStatusVisible = useCallback(
    (status: string) => visibleCommercialStatuses[status] === true,
    [visibleCommercialStatuses],
  );

  /** Solutions vendues + contacts : uniquement Client / Prospect. */
  const isCrmDetailStatus = useCallback(
    (status: string) => status === "Client" || status === "Prospect",
    [],
  );

  const crmDetailFiltersVisible =
    isCommercialStatusVisible("Client") ||
    isCommercialStatusVisible("Prospect");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [peerFilters, setPeerFilters] = useState<PeerFilters>({
    sameSector: false,
    sameEffectif: false,
  });

  /** Compte focus = nœud compte cliqué ou entreprise du contact. */
  const focusAccountId = useMemo(() => {
    if (!selectedId) return null;
    if (activeAccounts.some((a) => a.id === selectedId)) return selectedId;
    const contact = activeContacts.find((c) => c.id === selectedId);
    if (contact) return contact.accountId;
    return null;
  }, [selectedId, activeAccounts, activeContacts]);

  const toggleRole = (role: string) => {
    setVisibleRoles((prev) => ({ ...prev, [role]: !prev[role] }));
  };

  const toggleSolution = (solutionId: string) => {
    setVisibleSolutions((prev) => ({
      ...prev,
      [solutionId]: !prev[solutionId],
    }));
  };

  const activeSolutionIds = useMemo(
    () =>
      new Set(
        activeSolutions
          .filter((s) => visibleSolutions[s.id] === true)
          .map((s) => s.id),
      ),
    [visibleSolutions, activeSolutions],
  );

  /** Aucune case cochée = pas de filtre solution (tout passe). */
  const solutionFilterActive = activeSolutionIds.size > 0;

  const accountPassesSolutionFilter = useCallback(
    (accountId: string) => {
      const acc = activeAccounts.find((a) => a.id === accountId);
      if (acc && !isCrmDetailStatus(acc.commercialStatus)) return true;
      if (!solutionFilterActive) return true;
      const related = soldSolutions.filter((s) => s.accountId === accountId);
      if (related.length === 0) return true;
      return related.some((s) => activeSolutionIds.has(s.solutionId));
    },
    [
      activeAccounts,
      isCrmDetailStatus,
      solutionFilterActive,
      activeSolutionIds,
      soldSolutions,
    ],
  );

  const peerGroups = useMemo(
    () => buildPeerGroups(activeAccounts, focusAccountId, peerFilters),
    [activeAccounts, focusAccountId, peerFilters],
  );

  /** Comparables actifs seulement si Client/Prospect + critère renseigné. */
  const peerOverlayActive =
    crmDetailFiltersVisible &&
    ((peerFilters.sameSector && Boolean(peerGroups.sector)) ||
      (peerFilters.sameEffectif && Boolean(peerGroups.effectif)));

  /**
   * Visibilité carte :
   * 1) Statut = filtre principal (tous les comptes au(x) statut(s) coché(s))
   * 2) Compte focus toujours visible (sélection / KPI)
   * 3) Comparables = ajoutent les pairs, sans masquer le reste
   */
  const visibleAccountIds = useMemo(() => {
    const ids = new Set<string>();

    for (const a of activeAccounts) {
      if (!a.active) continue;
      if (!isCommercialStatusVisible(a.commercialStatus)) continue;
      if (!accountPassesSolutionFilter(a.id)) continue;
      ids.add(a.id);
    }

    if (focusAccountId) {
      const focus = activeAccounts.find((a) => a.id === focusAccountId);
      if (focus?.active !== false) {
        ids.add(focusAccountId);
        if (focus?.holdingId) ids.add(focus.holdingId);
        if (focus?.type === "Holding") {
          for (const child of activeAccounts) {
            if (
              child.holdingId === focus.id &&
              isCommercialStatusVisible(child.commercialStatus) &&
              accountPassesSolutionFilter(child.id)
            ) {
              ids.add(child.id);
            }
          }
        }
      }
    }

    /** Pairs ajoutés même hors filtre statut (exploration explicite). */
    if (peerOverlayActive) {
      for (const { holding, entreprises } of peerGroups.groups) {
        if (holding) ids.add(holding.id);
        for (const e of entreprises) {
          if (!accountPassesSolutionFilter(e.id)) continue;
          ids.add(e.id);
          if (e.holdingId) ids.add(e.holdingId);
        }
      }
    }

    /** Holdings orphelins sans enfant visible ni CA → hors carte. */
    for (const a of activeAccounts) {
      if (a.type !== "Holding" || !ids.has(a.id)) continue;
      if (a.id === focusAccountId) continue;
      const children = activeAccounts.filter((c) => c.holdingId === a.id);
      const anyChild = children.some((c) => ids.has(c.id));
      if (anyChild) continue;
      const holdingSales = soldSolutions.filter((s) => s.accountId === a.id);
      if (holdingSales.length === 0) ids.delete(a.id);
    }

    return ids;
  }, [
    activeAccounts,
    focusAccountId,
    peerGroups,
    peerOverlayActive,
    isCommercialStatusVisible,
    accountPassesSolutionFilter,
    soldSolutions,
  ]);

  const visibleContactIds = useMemo(() => {
    const ids = new Set<string>();
    if (!crmDetailFiltersVisible || !showContacts) return ids;
    const stakeByContact = new Map(
      (activeOpportunity?.stakeholders ?? []).map((s) => [s.contactId, s]),
    );
    for (const c of activeContacts) {
      if (!visibleAccountIds.has(c.accountId)) continue;
      const acc = activeAccounts.find((a) => a.id === c.accountId);
      if (!acc || !isCrmDetailStatus(acc.commercialStatus)) continue;
      const stake = stakeByContact.get(c.id);
      if (stake?.role) {
        const roleFilterActive = activeContactTypes.some(
          (t) => visibleRoles[t.id] === true,
        );
        if (roleFilterActive) {
          if (visibleRoles[stake.role] !== true) continue;
          if (!activeContactTypes.some((t) => t.id === stake.role)) continue;
        }
      }
      ids.add(c.id);
    }
    return ids;
  }, [
    crmDetailFiltersVisible,
    showContacts,
    visibleAccountIds,
    visibleRoles,
    activeContactTypes,
    activeContacts,
    activeAccounts,
    isCrmDetailStatus,
    activeOpportunity,
  ]);

  const graphNodes: Node[] = useMemo(() => {
    const list: Node[] = [];

    const focusAccount = focusAccountId
      ? activeAccounts.find((a) => a.id === focusAccountId)
      : undefined;
    const peerEntrepriseIds = peerOverlayActive
      ? peerGroups.groups.flatMap((g) => g.entreprises.map((e) => e.id))
      : [];
    const peerLayout =
      peerOverlayActive && focusAccount && peerEntrepriseIds.length > 0
        ? peerCompareLayoutPositions(
            focusAccount.id,
            { x: focusAccount.x, y: focusAccount.y },
            peerEntrepriseIds.filter((id) => visibleAccountIds.has(id)),
          )
        : null;

    for (const a of activeAccounts) {
      if (!visibleAccountIds.has(a.id)) continue;
      const scopeSales = salesForAccountScope(
        a.id,
        soldSolutions,
        activeAccounts,
      );
      const scopeOpps = opportunitiesForAccountScope(
        a.id,
        activeOpportunities,
        activeAccounts,
      );
      const rollup = aggregateKpis(
        scopeSales,
        a.name,
        solutionLabel,
        scopeOpps,
        undefined,
        salesTaxonomy,
      );
      const chips = isCrmDetailStatus(a.commercialStatus)
        ? rollup.bySolution
            .filter(
              (s) =>
                s.billedAmount > 0 ||
                s.potentialAmount > 0 ||
                s.whitespaceAmount > 0,
            )
            .map((s) => ({
              name: s.name,
              amount:
                s.potentialAmount > 0
                  ? s.potentialAmount
                  : s.whitespaceAmount > 0
                    ? s.whitespaceAmount
                    : s.targetAmount,
            }))
        : [];
      const isFocus = Boolean(
        focusAccountId && a.id === focusAccountId,
      );
      const layoutPos = peerLayout?.get(a.id);
      list.push({
        id: a.id,
        type: "account",
        position: layoutPos ?? { x: a.x, y: a.y },
        selected: selectedId === a.id,
        className: isFocus ? "is-focus-node" : "is-satellite-node",
        zIndex: isFocus ? 1000 : undefined,
        draggable: true,
        data: {
          name: a.name,
          type: a.type,
          commercialStatus: a.commercialStatus,
          holdingName:
            a.holdingId && visibleAccountIds.has(a.holdingId)
              ? activeAccounts.find((h) => h.id === a.holdingId)?.name
              : undefined,
          solutions: chips,
          billed: isCrmDetailStatus(a.commercialStatus)
            ? rollup.billedAmount
            : 0,
          potential: isCrmDetailStatus(a.commercialStatus)
            ? rollup.potentialAmount
            : 0,
          isFocus,
        },
      });
    }

    for (const c of activeContacts) {
      if (!visibleContactIds.has(c.id)) continue;
      const stake =
        activeOpportunity?.stakeholders?.find(
          (s) => s.contactId === c.id,
        ) ?? null;
      list.push({
        id: c.id,
        type: "contact",
        position: { x: c.x, y: c.y },
        selected: selectedId === c.id,
        draggable: true,
        data: {
          name: c.name,
          title: c.title,
          role: stake?.role ?? "",
          status: stake?.status,
          mapped: Boolean(stake),
          personaName: personaLabel(c.personaId),
          accountName:
            activeAccounts.find((a) => a.id === c.accountId)?.name ?? "",
        },
      });
    }

    return list;
  }, [
    peerOverlayActive,
    peerGroups,
    focusAccountId,
    selectedId,
    visibleAccountIds,
    visibleContactIds,
    soldSolutions,
    solutionLabel,
    personaLabel,
    activeAccounts,
    activeContacts,
    activeOpportunity,
    activeOpportunities,
    isCrmDetailStatus,
    salesTaxonomy,
  ]);

  const mapStructureKey = useMemo(
    () =>
      [
        peerOverlayActive ? "1" : "0",
        focusAccountId ?? "",
        [...visibleAccountIds].sort().join(","),
        [...visibleContactIds].sort().join(","),
      ].join("|"),
    [
      peerOverlayActive,
      focusAccountId,
      visibleAccountIds,
      visibleContactIds,
    ],
  );

  const [nodes, setNodes] = useState<Node[]>(graphNodes);
  const mapStructureRef = useRef(mapStructureKey);

  useEffect(() => {
    const structureChanged = mapStructureRef.current !== mapStructureKey;
    mapStructureRef.current = mapStructureKey;
    setNodes((prev) => {
      if (structureChanged || prev.length === 0) return graphNodes;
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return graphNodes.map((n) => {
        const existing = prevById.get(n.id);
        if (!existing) return n;
        return {
          ...n,
          position: existing.position,
          selected: n.selected,
        };
      });
    });
  }, [graphNodes, mapStructureKey]);

  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      setMapNodePosition(node.id, node.position.x, node.position.y);
    },
    [setMapNodePosition],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = connection.source;
      const target = connection.target;
      if (!source || !target || source === target) return false;

      const srcA = activeAccounts.find((a) => a.id === source);
      const tgtA = activeAccounts.find((a) => a.id === target);
      if (srcA && tgtA) {
        return (
          (srcA.type === "Holding" && tgtA.type === "Entreprise") ||
          (srcA.type === "Entreprise" && tgtA.type === "Holding")
        );
      }

      const srcC = activeContacts.find((c) => c.id === source);
      const tgtC = activeContacts.find((c) => c.id === target);
      return Boolean(srcC && tgtC);
    },
    [activeAccounts, activeContacts],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const source = connection.source;
      const target = connection.target;
      if (!source || !target || source === target) return;

      const srcA = activeAccounts.find((a) => a.id === source);
      const tgtA = activeAccounts.find((a) => a.id === target);
      if (srcA && tgtA) {
        if (srcA.type === "Holding" && tgtA.type === "Entreprise") {
          setAccountHolding(tgtA.id, srcA.id);
        } else if (srcA.type === "Entreprise" && tgtA.type === "Holding") {
          setAccountHolding(srcA.id, tgtA.id);
        }
        return;
      }

      const srcC = activeContacts.find((c) => c.id === source);
      const tgtC = activeContacts.find((c) => c.id === target);
      if (!srcC || !tgtC) return;

      const srcNode = nodes.find((n) => n.id === source);
      const tgtNode = nodes.find((n) => n.id === target);
      /** Nœud plus haut = parent ; sinon convention ReportsTo (source → parent). */
      let parentId = target;
      let childId = source;
      if (
        srcNode &&
        tgtNode &&
        srcNode.position.y < tgtNode.position.y - 8
      ) {
        parentId = source;
        childId = target;
      }
      setContactParent(childId, parentId);
    },
    [
      activeAccounts,
      activeContacts,
      nodes,
      setAccountHolding,
      setContactParent,
    ],
  );

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    const visible = new Set([
      ...visibleAccountIds,
      ...visibleContactIds,
    ]);
    const pushIfVisible = (edge: Edge) => {
      if (visible.has(edge.source) && visible.has(edge.target)) {
        list.push(edge);
      }
    };

    for (const e of holdingEdges) {
      const s = companyEdgeStyle.holdingOf;
      pushIfVisible({
        id: e.id,
        source: e.source,
        target: e.target,
        label: "du groupe",
        style: { stroke: s.stroke, strokeWidth: s.width },
        markerEnd: { type: MarkerType.ArrowClosed, color: s.stroke },
      });
    }

    for (const e of companyRelations) {
      /** Même secteur stocké : remplacé par les arêtes Comparables dynamiques. */
      if (e.relation === "SameSectorAs") continue;
      const s = companyEdgeStyle[e.relation];
      pushIfVisible({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: "side",
        targetHandle: "side-in",
        label: companyRelationLabel[e.relation],
        animated: e.relation === "CompetitorOf",
        style: {
          stroke: s.stroke,
          strokeWidth: s.width,
          strokeDasharray: s.strokeDasharray,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: s.stroke },
      });
    }

    /** Liens comparables (overlay) depuis le compte sélectionné. */
    if (
      peerOverlayActive &&
      focusAccountId &&
      visible.has(focusAccountId)
    ) {
      const peerStyle = companyEdgeStyle.SameSectorAs;
      const peerLabel =
        peerFilters.sameSector && peerFilters.sameEffectif
          ? "Comparable"
          : peerFilters.sameSector
            ? "Même secteur"
            : peerFilters.sameEffectif
              ? "Même effectif"
              : "Comparable";
      for (const { entreprises } of peerGroups.groups) {
        for (const ent of entreprises) {
          if (!visible.has(ent.id)) continue;
          pushIfVisible({
            id: `peer-${focusAccountId}-${ent.id}`,
            source: focusAccountId,
            target: ent.id,
            sourceHandle: "side",
            targetHandle: "side-in",
            label: peerLabel,
            style: {
              stroke: peerStyle.stroke,
              strokeWidth: peerStyle.width,
              strokeDasharray: peerStyle.strokeDasharray,
            },
          });
        }
      }
    }

    if (showContacts) {
      for (const e of accountContactEdges) {
        const s = companyEdgeStyle.hasMember;
        pushIfVisible({
          id: e.id,
          source: e.source,
          target: e.target,
          style: {
            stroke: s.stroke,
            strokeWidth: s.width,
            strokeDasharray: s.strokeDasharray,
          },
        });
      }
    }

    if (showContactLinks) {
      for (const e of contactRelations) {
        const s = contactEdgeStyle[e.relation];
        const crossCompany =
          activeContacts.find((c) => c.id === e.source)?.accountId !==
          activeContacts.find((c) => c.id === e.target)?.accountId;
        pushIfVisible({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: "side",
          targetHandle: "side-in",
          label: contactRelationLabel[e.relation] + (crossCompany ? " ✦" : ""),
          animated:
            e.relation === "Blocks" ||
            e.relation === "Influences" ||
            e.relation === "ReportsTo" ||
            crossCompany,
          style: {
            stroke: s.stroke,
            strokeWidth: s.width,
            strokeDasharray: s.strokeDasharray,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: s.stroke },
        });
      }
    }

    return list;
  }, [
    peerOverlayActive,
    showContacts,
    showContactLinks,
    visibleAccountIds,
    visibleContactIds,
    accountContactEdges,
    holdingEdges,
    companyRelations,
    contactRelations,
    activeContacts,
    activeAccounts,
    focusAccountId,
    peerGroups,
    peerFilters,
  ]);

  useEffect(() => {
    if (!selectedId) return;
    const stillVisible =
      visibleAccountIds.has(selectedId) ||
      visibleContactIds.has(selectedId);
    if (!stillVisible) setSelectedId(null);
  }, [
    selectedId,
    visibleAccountIds,
    visibleContactIds,
  ]);

  const selectedContact = activeContacts.find((c) => c.id === selectedId);
  const selectedAccount = activeAccounts.find((a) => a.id === selectedId);

  const mapPlanAccountId = useMemo(() => {
    if (selectedAccount?.type === "Entreprise") return selectedAccount.id;
    if (selectedContact) return selectedContact.accountId;
    // Groupe : pas de plan propre
    return null;
  }, [selectedAccount, selectedContact]);

  const mapPlan = useMemo(() => {
    if (activeOpportunity) {
      const byOpp = getPlanForOpportunity(activeOpportunity.id);
      if (byOpp) return byOpp;
    }
    if (!mapPlanAccountId) return null;
    return getPlanForAccount(mapPlanAccountId);
  }, [
    mapPlanAccountId,
    activeOpportunity,
    getPlanForOpportunity,
    getPlanForAccount,
  ]);

  const mapPlanHealth = useMemo(() => {
    if (!mapPlan) return null;
    const scopeId = mapPlan.accountId;
    const scopeSales = salesForAccountScope(
      scopeId,
      soldSolutions,
      activeAccounts,
    );
    const scopeOpps = opportunitiesForAccountScope(
      scopeId,
      activeOpportunities,
      activeAccounts,
    );
    const acc = activeAccounts.find((a) => a.id === scopeId);
    const kpis = aggregateKpis(
      scopeSales,
      acc?.name ?? "Entreprise",
      solutionLabel,
      scopeOpps,
      undefined,
      salesTaxonomy,
    );
    const contactCount = contactsOnAccount(scopeId, activeContacts);
    const soldIds = [...new Set(scopeSales.map((s) => s.solutionId))];
    const whiteSpaceCount = computeWhiteSpace(
      activeSolutions.map((s) => s.id),
      soldIds,
    ).length;
    return computeAccountHealth({
      plan: mapPlan,
      billedAmount: kpis.billedAmount,
      targetAmount: kpis.targetAmount,
      contactCount,
      whiteSpaceCount,
    });
  }, [
    mapPlan,
    soldSolutions,
    activeAccounts,
    activeContacts,
    activeSolutions,
    activeOpportunities,
    solutionLabel,
    salesTaxonomy,
  ]);

  const scopeKpis = useMemo(() => {
    if (selectedAccount) {
      return aggregateKpis(
        salesForAccountScope(
          selectedAccount.id,
          soldSolutions,
          activeAccounts,
        ),
        selectedAccount.type === "Holding"
          ? `Groupe ${selectedAccount.name}`
          : `Entreprise ${selectedAccount.name}`,
        solutionLabel,
        opportunitiesForAccountScope(
          selectedAccount.id,
          activeOpportunities,
          activeAccounts,
        ),
        undefined,
        salesTaxonomy,
      );
    }
    if (selectedContact) {
      return aggregateKpis(
        salesForAccountScope(
          selectedContact.accountId,
          soldSolutions,
          activeAccounts,
        ),
        activeAccounts.find((a) => a.id === selectedContact.accountId)?.name ??
          "Entreprise",
        solutionLabel,
        opportunitiesForAccountScope(
          selectedContact.accountId,
          activeOpportunities,
          activeAccounts,
        ),
        undefined,
        salesTaxonomy,
      );
    }
    return aggregateKpis(
      [],
      "Aucune sélection",
      solutionLabel,
      [],
      undefined,
      salesTaxonomy,
    );
  }, [
    selectedAccount,
    selectedContact,
    soldSolutions,
    solutionLabel,
    salesTaxonomy,
    activeAccounts,
    activeOpportunities,
  ]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const peerNodeIds = useMemo(() => {
    const ids: string[] = [];
    for (const { entreprises } of peerGroups.groups) {
      for (const e of entreprises) {
        if (visibleAccountIds.has(e.id)) ids.push(e.id);
      }
    }
    return ids;
  }, [peerGroups, visibleAccountIds]);

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="muted">{t("auth.loading")}</p>
        </div>
      </div>
    );
  }

  if (passwordRecovery) {
    return <ResetPasswordScreen />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (profileError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>{t("auth.profileRequired")}</h1>
          <p className="auth-error">{profileError}</p>
          <p className="muted">{t("auth.profileHint")}</p>
          <button type="button" className="ghost" onClick={() => void signOut()}>
            {t("sidebar.signOut")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img
            src="/favicon/favicon.png"
            alt="DBR"
            className="brand-mark-img"
            width={44}
            height={44}
          />
          <div className="brand-copy">
            <span className="brand-lockup" aria-label="DBR">
              DB<span className="brand-r">R</span>
            </span>
            <span className="brand-product">Daily Business Review</span>
            <span className="brand-tagline">
              Turn Strategy into <em>Revenue.</em>
            </span>
          </div>
        </div>

        <BillingQuotaBanner />

        {!billing.canWrite ? (
          <p className="billing-readonly-hint" role="status">
            {t("billing.readonly")}
            {billing.organization?.subscription_status
              ? ` (${billing.organization.subscription_status})`
              : ""}
            .
          </p>
        ) : null}

        <nav className="sidebar-nav" aria-label={t("nav.aria")}>
          <p className="sidebar-group">{t("nav.group.view")}</p>
          {NAV_MAIN.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              {navLabel(item.id)}
            </button>
          ))}

          <p className="sidebar-group">{t("nav.group.data")}</p>
          {NAV_DATA.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              {navLabel(item.id)}
            </button>
          ))}

          <p className="sidebar-group">{t("nav.group.pilotage")}</p>
          {NAV_PILOTAGE.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              {navLabel(item.id)}
            </button>
          ))}

        </nav>
      </aside>

      <div className="app-main">
        <header className="app-userbar" aria-label="Compte utilisateur">
          <div className="app-userbar-actions">
            <LanguageSwitcher className="app-userbar-lang" />
            <p className="app-userbar-user muted" title={user.email ?? undefined}>
              <span className="app-userbar-email">{user.email}</span>
              {profile ? (
                <span className={`role-pill role-${profile.role}`}>
                  {roleText(profile.role)}
                </span>
              ) : null}
            </p>
            <button
              type="button"
              className="ghost tiny"
              onClick={() => void signOut()}
            >
              {t("sidebar.signOut")}
            </button>
            {canPerm("team.manage") && (
              <button
                type="button"
                className="ghost tiny"
                onClick={() => setTeamOpen(true)}
              >
                {t("sidebar.team")}
              </button>
            )}
            {canPerm("settings.access") && (
              <button
                type="button"
                className={`ghost tiny${page === "settings" ? " active" : ""}`}
                onClick={() => navigate("settings")}
              >
                {t("sidebar.settings")}
              </button>
            )}
          </div>
        </header>

        <div className="app-main-body">
        {page === "dashboard" && (
          <DashboardPage onNavigate={navigate} />
        )}

        {page === "settings" && canPerm("settings.access") ? (
          <SettingsPanel onOpenTeam={() => setTeamOpen(true)} />
        ) : null}

        {page === "account-plans" && (
          <AccountPlanPage
            openPlanId={openPlanId}
            onOpenPlanConsumed={() => setOpenPlanId(null)}
          />
        )}

        {isDataSection(page) && (
          <DataEntryPanel
            section={page as DataSection}
            onNavigate={navigate}
          />
        )}

        {isOptionalModulePage(page) && (
          <OptionalModulePage moduleId={page} />
        )}

        {page === "map" && (
          <div className="app map-app">
            <header className="topbar">
              <div className="brand">
                {crmDetailFiltersVisible ? (
                  <SameSectorPanel
                    accounts={activeAccounts}
                    focusAccountId={focusAccountId}
                    onOpenAccount={(id) => setSelectedId(id)}
                    filters={peerFilters}
                    onFiltersChange={setPeerFilters}
                  />
                ) : null}
              </div>
              <div className="opp">
                <div className="opp-account-meta">
                  {mapPlan && (
                    <button
                      type="button"
                      className="plan-chip"
                      onClick={() => {
                        sessionStorage.setItem(
                          "powermap.openPlanId",
                          mapPlan.id,
                        );
                        navigate("account-plans");
                      }}
                    >
                      Plan
                    </button>
                  )}
                </div>
                <p className="opp-kpis">
                  <span>
                    CA <strong>{formatEur(scopeKpis.billedAmount)}</strong>
                  </span>
                  <span className="dot">·</span>
                  <span className="opp-potential">
                    Pipeline{" "}
                    <strong>{formatEur(scopeKpis.potentialAmount)}</strong>
                  </span>
                  <span className="dot">·</span>
                  <span>
                    Whitespace{" "}
                    <strong>{formatEur(scopeKpis.whitespaceAmount)}</strong>
                  </span>
                  <span className="dot">·</span>
                  <span>
                    Renouv.{" "}
                    <strong>{formatEur(scopeKpis.renewalAmount)}</strong>
                  </span>
                  <span className="dot">·</span>
                  <span>
                    Cible{" "}
                    <strong>{formatEur(scopeKpis.targetAmount)}</strong>
                  </span>
                </p>
              </div>
              {mapPlanHealth ? (
                <div
                  className={`health health-${mapPlanHealth.status.toLowerCase()}`}
                >
                  <span className="health-label">{mapPlanHealth.status}</span>
                  <span className="health-score">{mapPlanHealth.score}%</span>
                  <span className="health-msg">{mapPlanHealth.message}</span>
                </div>
              ) : null}
            </header>

            <div className="workspace">
                  <main className="canvas-wrap">
                    <div className="filters-stack">
                      <div className="filters">
                        <span className="filters-label">Statut</span>
                        {activeCommercialStatuses.map((s) => (
                          <label key={s.id}>
                            <input
                              type="checkbox"
                              checked={visibleCommercialStatuses[s.id] === true}
                              onChange={() =>
                                setVisibleCommercialStatuses((prev) => ({
                                  ...prev,
                                  [s.id]: !prev[s.id],
                                }))
                              }
                            />
                            {statusLabel(s.id)}
                          </label>
                        ))}
                      </div>

                      {crmDetailFiltersVisible ? (
                        <div className="filters filters-solutions">
                          <span className="filters-label">Solutions vendues</span>
                          {activeSolutions.map((s) => (
                            <label key={s.id} className="solution-filter">
                              <input
                                type="checkbox"
                                checked={visibleSolutions[s.id] === true}
                                onChange={() => toggleSolution(s.id)}
                              />
                              {s.name}
                            </label>
                          ))}
                        </div>
                      ) : null}

                      {crmDetailFiltersVisible ? (
                      <div className="filters filters-contacts">
                        <span className="filters-label">Contacts</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={showContacts}
                            onChange={(e) => setShowContacts(e.target.checked)}
                          />
                          Contacts
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={showContactLinks}
                            onChange={(e) =>
                              setShowContactLinks(e.target.checked)
                            }
                            disabled={!showContacts}
                          />
                          Réseau métier
                        </label>
                        <span className="filters-sep" />
                        {activeContactTypes.map((role) => (
                          <label key={role.id} className="role-filter">
                            <input
                              type="checkbox"
                              checked={visibleRoles[role.id] === true}
                              onChange={() => toggleRole(role.id)}
                              disabled={!showContacts}
                            />
                            <i
                              className="swatch"
                              style={{ background: role.color }}
                              aria-hidden
                            />
                            {role.label}
                          </label>
                        ))}
                      </div>
                      ) : null}
                    </div>

                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={nodeTypes}
                      onNodesChange={onNodesChange}
                      onNodeClick={onNodeClick}
                      onNodeDragStop={onNodeDragStop}
                      onConnect={onConnect}
                      isValidConnection={isValidConnection}
                      connectionMode={ConnectionMode.Loose}
                      nodesDraggable
                      nodesConnectable
                      elementsSelectable
                      fitView
                      minZoom={0.35}
                      maxZoom={1.6}
                      proOptions={{ hideAttribution: true }}
                    >
                      <FocusAccountCamera
                        focusId={focusAccountId}
                        peerIds={peerNodeIds}
                      />
                      <Background gap={20} color="#d6d3cd" />
                      <Controls />
                      <MiniMap
                        nodeColor={(n) => {
                          if (n.className?.includes("is-focus-node"))
                            return "#c9a227";
                          if (n.type === "account") return "#1f2937";
                          return "#0f766e";
                        }}
                        maskColor="rgba(250,248,244,0.7)"
                      />
                    </ReactFlow>
                  </main>

                  <aside className="rail">
                    <KpiPanel kpis={scopeKpis} />

                    <section>
                      <h2>Sélection</h2>
                      {!selectedContact && !selectedAccount && (
                          <p className="muted">Aucune sélection.</p>
                        )}
                      {selectedContact && (
                        <div className="detail">
                          <strong>{selectedContact.name}</strong>
                          <p>{selectedContact.title}</p>
                          <p>
                            Persona :{" "}
                            {personaLabel(selectedContact.personaId)}
                            <br />
                            Entreprise :{" "}
                            {
                              activeAccounts.find(
                                (a) => a.id === selectedContact.accountId,
                              )?.name
                            }
                          </p>
                          {(() => {
                            const stake =
                              activeOpportunity?.stakeholders?.find(
                                (s) => s.contactId === selectedContact.id,
                              ) ?? null;
                            if (!activeOpportunity) {
                              return (
                                <p className="muted">
                                  Type / engagement : aucune opportunité active.
                                </p>
                              );
                            }
                            if (!stake) {
                              return (
                                <p className="muted">
                                  Non mappé sur « {activeOpportunity.name} ».
                                </p>
                              );
                            }
                            return (
                              <p>
                                Sur « {activeOpportunity.name} » :<br />
                                Type :{" "}
                                {stake.role
                                  ? contactTypeLabel(stake.role)
                                  : "—"}
                                <br />
                                Engagement :{" "}
                                {engagementLabel[stake.status] ?? stake.status}
                              </p>
                            );
                          })()}
                          <p>
                            Parent / N+1 :{" "}
                            {(() => {
                              const parentId = getContactParentId(
                                selectedContact.id,
                                contactRelations,
                              );
                              return (
                                activeContacts.find((c) => c.id === parentId)
                                  ?.name ?? "—"
                              );
                            })()}
                            <br />
                            Enfants :{" "}
                            {getContactChildrenIds(
                              selectedContact.id,
                              contactRelations,
                            )
                              .map(
                                (id) =>
                                  activeContacts.find((c) => c.id === id)
                                    ?.name ?? id,
                              )
                              .join(", ") || "—"}
                          </p>
                        </div>
                      )}
                      {selectedAccount &&
                        selectedAccount.type === "Entreprise" && (
                          <SoldSolutionEditor
                            accountId={selectedAccount.id}
                            personaId={null}
                            allowPersonaPick={catalogFeatures.personae}
                            readOnly
                          />
                        )}
                      {selectedAccount && (
                        <div className="detail">
                          <strong>{selectedAccount.name}</strong>
                          <p>
                            Type : {selectedAccount.type}
                            <br />
                            Statut :{" "}
                            {statusLabel(selectedAccount.commercialStatus)}
                          </p>
                          <p>
                            Lignes (rollup) :
                            <ul className="detail-sales">
                              {salesForAccountScope(
                                selectedAccount.id,
                                soldSolutions,
                                activeAccounts,
                              ).map((s) => {
                                const personas = soldLinePersonaIds(s);
                                const personaScopeLabel =
                                  personas.length === 0
                                    ? " (entreprise)"
                                    : ` @ ${personas.map((id: string) => personaLabel(id)).join(", ")}`;
                                const mods = (s.moduleIds ?? [])
                                  .map((mid) => {
                                    const sol = activeSolutions.find(
                                      (x) => x.id === s.solutionId,
                                    );
                                    return (
                                      sol?.modules?.find((m) => m.id === mid)
                                        ?.label ?? mid
                                    );
                                  })
                                  .filter(Boolean);
                                return (
                                  <li key={s.id}>
                                    {solutionLabel(s.solutionId)}
                                    {personaScopeLabel}
                                    {mods.length > 0
                                      ? ` · ${mods.join(", ")}`
                                      : ""}{" "}
                                    — CA {formatEur(s.billedAmount)}
                                  </li>
                                );
                              })}
                            </ul>
                          </p>
                          <p>
                            Relations :{" "}
                            {companyRelations
                              .filter(
                                (r) =>
                                  r.source === selectedAccount.id ||
                                  r.target === selectedAccount.id,
                              )
                              .map((r) => {
                                const otherId =
                                  r.source === selectedAccount.id
                                    ? r.target
                                    : r.source;
                                const other = activeAccounts.find(
                                  (a) => a.id === otherId,
                                );
                                return `${companyRelationLabel[r.relation]} ↔ ${other?.name}`;
                              })
                              .join(" · ") || "—"}
                          </p>
                        </div>
                      )}
                      {(selectedAccount || selectedContact) && (
                        <AccountOpportunitiesInfluenceOverview
                          accountId={
                            selectedAccount?.id ??
                            selectedContact!.accountId
                          }
                          compact
                          onOpenOpportunity={() => navigate("opportunites")}
                          onOpenContact={(id) => setSelectedId(id)}
                        />
                      )}
                    </section>
                  </aside>
            </div>
          </div>
        )}
        </div>
      </div>

      {teamOpen && canPerm("team.manage") && (
        <TeamAdminPanel onClose={() => setTeamOpen(false)} />
      )}
    </div>
  );
}
