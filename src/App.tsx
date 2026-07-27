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
import SoldSolutionEditor from "./SoldSolutionEditor";
import AccountSearchSelect from "./AccountSearchSelect";
import SameSectorPanel, {
  buildPeerGroups,
  type PeerFilters,
} from "./SameSectorPanel";
import AccountOpportunitiesInfluenceOverview from "./AccountOpportunitiesInfluenceOverview";
import { useOrgConfig } from "./config/ConfigContext";
import {
  directionNodeId,
  parseDirectionNodeId,
} from "./config/ConfigContext";
import { useDomain } from "./domain/DomainContext";
import { useSales } from "./sales/SalesContext";
import {
  isDataSection,
  NAV_DATA,
  NAV_MAIN,
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
  opportunitiesForDirectionScope,
  salesForAccountScope,
  salesForDirectionScope,
  soldSolutionsForDirection,
  soldLineMatchesDirection,
  isCompanyLevelSoldLine,
  soldLineDirectionIds,
  type Account,
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
          <span className="kpi-sublabel">facturé + Closed Won</span>
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
          <span className="kpi-label">Renouvellement</span>
          <strong>{formatEur(kpis.renewalAmount)}</strong>
          <span className="kpi-sublabel">ouverts</span>
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

function DirectionNode({ data }: NodeProps) {
  const { statusLabel } = useOrgConfig();
  const d = data as {
    name: string;
    accountName: string;
    commercialStatus: CommercialStatus;
    memberCount: number;
    solutions: { name: string; billed: number }[];
  };
  return (
    <div className={`node direction-node ${statusClass(d.commercialStatus)}`}>
      <Handle type="target" position={Position.Top} className="handle" />
      <span className="node-eyebrow">Direction</span>
      <strong>{d.name}</strong>
      <span className={`badge ${statusClass(d.commercialStatus)}`}>
        {statusLabel(d.commercialStatus)}
      </span>
      <span className="node-meta">
        {d.accountName} · {d.memberCount} contact
        {d.memberCount > 1 ? "s" : ""}
      </span>
      {d.solutions.length > 0 && (
        <div className="solution-chips">
          {d.solutions.map((s) => (
            <span key={s.name} className="solution-chip">
              {s.name}
              {s.billed > 0 ? ` · CA ${formatEur(s.billed)}` : ""}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="handle" />
    </div>
  );
}

function ContactNode({ data }: NodeProps) {
  const { contactTypeLabel, contactTypeColor } = useOrgConfig();
  const d = data as {
    name: string;
    title: string;
    role: string;
    status?: Status;
    mapped: boolean;
    directionName: string;
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
      <span className="node-direction">{d.directionName}</span>
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
  direction: DirectionNode,
  contact: ContactNode,
};

const companyEdgeStyle: Record<
  CompanyRelationType | "holdingOf" | "hasDirection" | "hasMember",
  { stroke: string; strokeDasharray?: string; width?: number }
> = {
  holdingOf: { stroke: "#374151", width: 2.5 },
  hasDirection: { stroke: "#78716c", width: 1.75 },
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

function accountKind(
  accountId: string,
  accountList: Account[],
): "holding" | "entreprise" | "partner" {
  const account = accountList.find((a) => a.id === accountId);
  if (!account) return "entreprise";

  const root = account.holdingId
    ? (accountList.find((h) => h.id === account.holdingId) ?? account)
    : account;

  if (
    account.commercialStatus === "Partner" ||
    root.commercialStatus === "Partner"
  ) {
    return "partner";
  }
  if (account.type === "Holding") return "holding";
  return "entreprise";
}

export default function App() {
  const {
    loading: authLoading,
    user,
    profile,
    isAdmin,
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
        : (`nav.${id}` as MessageKey);
    return t(key);
  }

  function roleText(role: "admin" | "user") {
    return role === "admin" ? t("role.admin") : t("role.user");
  }
  const {
    activeSolutions,
    activeContactTypes,
    activeDirections,
    solutionLabel,
    contactTypeLabel,
    directionLabel,
    salesTaxonomy,
    statusLabel,
  } = useOrgConfig();
  const { soldSolutions } = useSales();
  const {
    activeAccounts,
    activeContacts,
    companyRelations,
    contactRelations,
    layoutPositions,
    setMapNodePosition,
    setAccountHolding,
    setContactParent,
  } = useDomain();
  const { getPlanForAccount, getPlanForOpportunity } = useAccountPlans();
  const { activeOpportunity, activeOpportunities } = useOpportunities();

  const holdingIdOfAccount = useCallback(
    (accountId: string) => {
      const a = activeAccounts.find((x) => x.id === accountId);
      if (!a) return null;
      if (a.type === "Holding") return a.id;
      return a.holdingId;
    },
    [activeAccounts],
  );

  const holdingEdges = useMemo(
    () => buildHoldingEdges(activeAccounts),
    [activeAccounts],
  );

  const directionEdges = useMemo(() => {
    const edges: {
      id: string;
      source: string;
      target: string;
      type: "hasDirection";
    }[] = [];
    const seen = new Set<string>();
    for (const c of activeContacts) {
      const holdingId = holdingIdOfAccount(c.accountId);
      if (!holdingId) continue;
      if (!activeDirections.some((d) => d.id === c.directionId)) continue;
      const target = directionNodeId(holdingId, c.directionId);
      if (seen.has(target)) continue;
      seen.add(target);
      edges.push({
        id: `e-${holdingId}-${c.directionId}`,
        source: holdingId,
        target,
        type: "hasDirection",
      });
    }
    return edges;
  }, [activeContacts, activeDirections, holdingIdOfAccount]);

  const contactMembershipEdges = useMemo(
    () =>
      activeContacts
        .filter((c) => activeDirections.some((d) => d.id === c.directionId))
        .map((c) => {
          const holdingId = holdingIdOfAccount(c.accountId) ?? c.accountId;
          const source = directionNodeId(holdingId, c.directionId);
          return {
            id: `e-${source}-${c.id}`,
            source,
            target: c.id,
            type: "hasMember" as const,
          };
        }),
    [activeContacts, activeDirections, holdingIdOfAccount],
  );

  const [page, setPage] = useState<AppPage>("dashboard");
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showHoldings, setShowHoldings] = useState(true);
  const [showEntreprises, setShowEntreprises] = useState(true);
  const [showPartners, setShowPartners] = useState(true);
  const [showCompetitors, setShowCompetitors] = useState(true);

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

  const [showDirections, setShowDirections] = useState(true);
  const [showContacts, setShowContacts] = useState(true);
  const [showContactLinks, setShowContactLinks] = useState(true);
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
        if (next[t.id] === undefined) next[t.id] = true;
      }
      return next;
    });
  }, [activeContactTypes]);

  useEffect(() => {
    setVisibleSolutions((prev) => {
      const next = { ...prev };
      for (const s of activeSolutions) {
        if (next[s.id] === undefined) next[s.id] = true;
      }
      return next;
    });
  }, [activeSolutions]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Compte choisi dans la liste déroulante = cœur du graphe (indépendant du clic carte). */
  const [mapFocusAccountId, setMapFocusAccountId] = useState<string | null>(
    null,
  );
  const [peerFilters, setPeerFilters] = useState<PeerFilters>({
    sameSector: true,
    sameEffectif: false,
  });

  useEffect(() => {
    if (mapFocusAccountId) return;
    const first =
      activeAccounts.find((a) => a.type === "Holding")?.id ??
      activeAccounts[0]?.id ??
      null;
    if (first) {
      setMapFocusAccountId(first);
      if (!selectedId) setSelectedId(first);
    }
  }, [mapFocusAccountId, selectedId, activeAccounts]);

  useEffect(() => {
    if (!mapFocusAccountId) return;
    if (activeAccounts.some((a) => a.id === mapFocusAccountId)) return;
    const first =
      activeAccounts.find((a) => a.type === "Holding")?.id ??
      activeAccounts[0]?.id ??
      null;
    setMapFocusAccountId(first);
  }, [mapFocusAccountId, activeAccounts]);

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
        activeSolutions.filter((s) => visibleSolutions[s.id] !== false).map((s) => s.id),
      ),
    [visibleSolutions, activeSolutions],
  );

  const allSolutionsActive =
    activeSolutions.length > 0 &&
    activeSolutions.every((s) => visibleSolutions[s.id] !== false);

  const accountPassesSolutionFilter = useCallback(
    (accountId: string) => {
      if (allSolutionsActive) return true;
      const related = soldSolutions.filter((s) => s.accountId === accountId);
      if (related.length === 0) return true;
      return related.some((s) => activeSolutionIds.has(s.solutionId));
    },
    [allSolutionsActive, activeSolutionIds, soldSolutions],
  );

  const directionPassesSolutionFilter = useCallback(
    (directionId: string, accountId: string) => {
      if (allSolutionsActive) return true;
      const atDirection = soldSolutions.filter((s) =>
        soldLineMatchesDirection(s, directionId),
      );
      const atCompany = soldSolutions.filter(
        (s) => s.accountId === accountId && isCompanyLevelSoldLine(s),
      );
      if (atDirection.length === 0 && atCompany.length === 0) return true;
      if (atDirection.some((s) => activeSolutionIds.has(s.solutionId))) {
        return true;
      }
      if (atCompany.some((s) => activeSolutionIds.has(s.solutionId))) {
        return true;
      }
      return false;
    },
    [allSolutionsActive, activeSolutionIds, soldSolutions],
  );

  const peerGroups = useMemo(
    () => buildPeerGroups(activeAccounts, mapFocusAccountId, peerFilters),
    [activeAccounts, mapFocusAccountId, peerFilters],
  );

  /** Mode comparables : vue entreprise ↔ entreprise uniquement (pas directions / contacts). */
  const peerCompareMode =
    peerFilters.sameSector || peerFilters.sameEffectif;

  const visibleAccountIds = useMemo(() => {
    const focusHoldingId = (() => {
      if (!mapFocusAccountId) return null;
      const acc = activeAccounts.find((a) => a.id === mapFocusAccountId);
      if (!acc) return null;
      return acc.type === "Holding" ? acc.id : acc.holdingId ?? acc.id;
    })();

    const ids = new Set<string>();
    for (const a of activeAccounts) {
      if (focusHoldingId) {
        const inFocus =
          a.id === focusHoldingId ||
          a.holdingId === focusHoldingId ||
          a.id === mapFocusAccountId;
        if (!inFocus) continue;
      }
      const kind = accountKind(a.id, activeAccounts);
      if (kind === "holding" && !showHoldings) continue;
      if (kind === "entreprise" && !showEntreprises) continue;
      if (kind === "partner" && !showPartners) continue;
      if (!accountPassesSolutionFilter(a.id)) continue;
      ids.add(a.id);
    }

    /** Comparables (même secteur / même effectif) autour du compte cœur. */
    for (const { holding, entreprises } of peerGroups.groups) {
      if (!peerCompareMode && holding && (showHoldings || showEntreprises)) {
        ids.add(holding.id);
      }
      for (const e of entreprises) {
        if (!showEntreprises) continue;
        if (!accountPassesSolutionFilter(e.id)) continue;
        ids.add(e.id);
        if (!peerCompareMode && e.holdingId) ids.add(e.holdingId);
      }
    }

    /** Étend le périmètre aux comptes liés (concurrents, partenaires). */
    const ecosystemEnabled: CompanyRelationType[] = [];
    if (showCompetitors) ecosystemEnabled.push("CompetitorOf");
    if (showPartners) ecosystemEnabled.push("PartnerOf");

    if (ecosystemEnabled.length > 0 && ids.size > 0) {
      let grew = true;
      while (grew) {
        grew = false;
        for (const rel of companyRelations) {
          if (!ecosystemEnabled.includes(rel.relation)) continue;
          const srcIn = ids.has(rel.source);
          const tgtIn = ids.has(rel.target);
          if (srcIn === tgtIn) continue;
          const outsider = srcIn ? rel.target : rel.source;
          const acc = activeAccounts.find((a) => a.id === outsider);
          if (!acc || !acc.active) continue;
          const kind = accountKind(acc.id, activeAccounts);
          if (kind === "holding" && !showHoldings) continue;
          if (kind === "entreprise" && !showEntreprises) continue;
          ids.add(acc.id);
          if (!peerCompareMode && acc.holdingId) ids.add(acc.holdingId);
          if (!peerCompareMode && acc.type === "Holding") {
            for (const child of activeAccounts) {
              if (child.holdingId === acc.id) ids.add(child.id);
            }
          }
          grew = true;
        }
      }
    }

    for (const a of activeAccounts) {
      if (a.type !== "Holding" || !ids.has(a.id)) continue;
      if (peerCompareMode && a.id !== mapFocusAccountId) {
        ids.delete(a.id);
        continue;
      }
      const children = activeAccounts.filter((c) => c.holdingId === a.id);
      if (children.length === 0) continue;
      const anyChild = children.some((c) => ids.has(c.id));
      if (!anyChild) {
        const holdingSales = soldSolutions.filter((s) => s.accountId === a.id);
        if (holdingSales.length === 0) ids.delete(a.id);
      }
    }

    /** Comparables : uniquement le cœur + entreprises pairs (statut visible). */
    if (peerCompareMode) {
      const peerEntrepriseIds = new Set(
        peerGroups.groups.flatMap((g) => g.entreprises.map((e) => e.id)),
      );
      for (const id of [...ids]) {
        const acc = activeAccounts.find((a) => a.id === id);
        if (!acc) continue;
        if (acc.type === "Holding") {
          if (acc.id !== mapFocusAccountId) ids.delete(id);
          continue;
        }
        if (
          acc.type === "Entreprise" &&
          acc.id !== mapFocusAccountId &&
          !peerEntrepriseIds.has(acc.id)
        ) {
          ids.delete(id);
        }
      }
    }

    return ids;
  }, [
    activeAccounts,
    mapFocusAccountId,
    peerGroups,
    peerCompareMode,
    showHoldings,
    showEntreprises,
    showPartners,
    showCompetitors,
    companyRelations,
    accountPassesSolutionFilter,
    soldSolutions,
  ]);

  const visibleDirectionIds = useMemo(() => {
    const ids = new Set<string>();
    if (peerCompareMode || !showDirections) return ids;
    for (const c of activeContacts) {
      if (!visibleAccountIds.has(c.accountId)) continue;
      const holdingId = holdingIdOfAccount(c.accountId);
      if (!holdingId || !visibleAccountIds.has(holdingId)) continue;
      if (!activeDirections.some((d) => d.id === c.directionId)) continue;
      if (!directionPassesSolutionFilter(c.directionId, c.accountId)) continue;
      ids.add(directionNodeId(holdingId, c.directionId));
    }
    return ids;
  }, [
    peerCompareMode,
    showDirections,
    visibleAccountIds,
    directionPassesSolutionFilter,
    activeContacts,
    activeDirections,
    holdingIdOfAccount,
  ]);

  const visibleContactIds = useMemo(() => {
    const ids = new Set<string>();
    if (peerCompareMode || !showContacts) return ids;
    const stakeByContact = new Map(
      (activeOpportunity?.stakeholders ?? []).map((s) => [s.contactId, s]),
    );
    for (const c of activeContacts) {
      if (!visibleAccountIds.has(c.accountId)) continue;
      if (showDirections) {
        const holdingId = holdingIdOfAccount(c.accountId);
        if (
          !holdingId ||
          !visibleDirectionIds.has(
            directionNodeId(holdingId, c.directionId),
          )
        ) {
          continue;
        }
      }
      const stake = stakeByContact.get(c.id);
      if (stake?.role) {
        if (!visibleRoles[stake.role]) continue;
        if (!activeContactTypes.some((t) => t.id === stake.role)) continue;
      }
      ids.add(c.id);
    }
    return ids;
  }, [
    peerCompareMode,
    showContacts,
    showDirections,
    visibleAccountIds,
    visibleDirectionIds,
    visibleRoles,
    activeContactTypes,
    activeContacts,
    holdingIdOfAccount,
    activeOpportunity,
  ]);

  const graphNodes: Node[] = useMemo(() => {
    const list: Node[] = [];

    const focusAccount = mapFocusAccountId
      ? activeAccounts.find((a) => a.id === mapFocusAccountId)
      : undefined;
    const peerLayout =
      peerCompareMode && focusAccount
        ? peerCompareLayoutPositions(
            focusAccount.id,
            { x: focusAccount.x, y: focusAccount.y },
            [...visibleAccountIds].filter(
              (id) =>
                id !== focusAccount.id &&
                activeAccounts.some(
                  (a) => a.id === id && a.type === "Entreprise",
                ),
            ),
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
      const chips = rollup.bySolution
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
        }));
      const isFocus = Boolean(
        mapFocusAccountId && a.id === mapFocusAccountId,
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
          billed: rollup.billedAmount,
          potential: rollup.potentialAmount,
          isFocus,
        },
      });
    }

    for (const nodeId of visibleDirectionIds) {
      const parsed = parseDirectionNodeId(nodeId);
      if (!parsed) continue;
      const holding = activeAccounts.find((a) => a.id === parsed.holdingId);
      const dir = activeDirections.find((d) => d.id === parsed.directionId);
      if (!holding || !dir) continue;
      const siblings = [...visibleDirectionIds].filter((id) =>
        id.startsWith(`dnode-${parsed.holdingId}--`),
      );
      const index = siblings.indexOf(nodeId);
      const saved = layoutPositions[nodeId];
      list.push({
        id: nodeId,
        type: "direction",
        position: saved ?? {
          x: holding.x - 200 + index * 220,
          y: holding.y + 270,
        },
        selected: selectedId === nodeId,
        draggable: true,
        data: {
          name: dir.name,
          accountName: holding.name,
          commercialStatus: "Other" as CommercialStatus,
          memberCount: activeContacts.filter(
            (c) =>
              c.directionId === parsed.directionId &&
              holdingIdOfAccount(c.accountId) === parsed.holdingId &&
              visibleContactIds.has(c.id),
          ).length,
          solutions: soldSolutionsForDirection(
            parsed.directionId,
            soldSolutions,
          ).map((s) => ({
            name: solutionLabel(s.solutionId),
            billed: s.billedAmount,
          })),
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
          directionName: directionLabel(c.directionId),
          accountName:
            activeAccounts.find((a) => a.id === c.accountId)?.name ?? "",
        },
      });
    }

    return list;
  }, [
    peerCompareMode,
    mapFocusAccountId,
    selectedId,
    visibleAccountIds,
    visibleDirectionIds,
    visibleContactIds,
    soldSolutions,
    solutionLabel,
    directionLabel,
    activeDirections,
    activeAccounts,
    activeContacts,
    holdingIdOfAccount,
    activeOpportunity,
    activeOpportunities,
    layoutPositions,
  ]);

  const mapStructureKey = useMemo(
    () =>
      [
        peerCompareMode ? "1" : "0",
        mapFocusAccountId ?? "",
        [...visibleAccountIds].sort().join(","),
        [...visibleDirectionIds].sort().join(","),
        [...visibleContactIds].sort().join(","),
      ].join("|"),
    [
      peerCompareMode,
      mapFocusAccountId,
      visibleAccountIds,
      visibleDirectionIds,
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
      if (peerCompareMode) return false;
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
    [peerCompareMode, activeAccounts, activeContacts],
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
      ...visibleDirectionIds,
      ...visibleContactIds,
    ]);
    const pushIfVisible = (edge: Edge) => {
      if (visible.has(edge.source) && visible.has(edge.target)) {
        list.push(edge);
      }
    };

    for (const e of holdingEdges) {
      if (peerCompareMode) continue;
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
      if (peerCompareMode) continue;
      if (e.relation === "PartnerOf" && !showPartners) continue;
      if (e.relation === "CompetitorOf" && !showCompetitors) continue;
      /** Même secteur stocké : remplacé par les arêtes Comparables dynamiques. */
      if (e.relation === "SameSectorAs") continue;
      if (
        (e.relation === "SupplierOf" ||
          e.relation === "CustomerOf" ||
          e.relation === "InvestorIn") &&
        !showPartners
      ) {
        continue;
      }
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

    /** Liens comparables depuis le compte cœur. */
    if (mapFocusAccountId && visible.has(mapFocusAccountId)) {
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
            id: `peer-${mapFocusAccountId}-${ent.id}`,
            source: mapFocusAccountId,
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

    if (showDirections) {
      for (const e of directionEdges) {
        const s = companyEdgeStyle.hasDirection;
        pushIfVisible({
          id: e.id,
          source: e.source,
          target: e.target,
          label: "direction",
          style: { stroke: s.stroke, strokeWidth: s.width },
          markerEnd: { type: MarkerType.ArrowClosed, color: s.stroke },
        });
      }
    }

    if (showContacts && showDirections) {
      for (const e of contactMembershipEdges) {
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
    peerCompareMode,
    showPartners,
    showCompetitors,
    showDirections,
    showContacts,
    showContactLinks,
    visibleAccountIds,
    visibleDirectionIds,
    visibleContactIds,
    directionEdges,
    contactMembershipEdges,
    holdingEdges,
    companyRelations,
    contactRelations,
    activeContacts,
    activeAccounts,
    mapFocusAccountId,
    peerGroups,
    peerFilters,
  ]);

  useEffect(() => {
    if (!selectedId) return;
    const stillVisible =
      visibleAccountIds.has(selectedId) ||
      visibleDirectionIds.has(selectedId) ||
      visibleContactIds.has(selectedId);
    if (!stillVisible) {
      const fallback =
        (mapFocusAccountId && visibleAccountIds.has(mapFocusAccountId)
          ? mapFocusAccountId
          : null) ??
        activeAccounts.find((a) => a.type === "Holding")?.id ??
        activeAccounts[0]?.id ??
        null;
      setSelectedId(fallback);
    }
  }, [
    selectedId,
    mapFocusAccountId,
    visibleAccountIds,
    visibleDirectionIds,
    visibleContactIds,
    activeAccounts,
  ]);

  const selectedContact = activeContacts.find((c) => c.id === selectedId);
  const selectedAccount = activeAccounts.find((a) => a.id === selectedId);
  const selectedDirNode = selectedId
    ? parseDirectionNodeId(selectedId)
    : null;
  const selectedDirection = selectedDirNode
    ? activeDirections.find((d) => d.id === selectedDirNode.directionId)
    : null;

  const mapPlanAccountId = useMemo(() => {
    if (selectedAccount?.type === "Entreprise") return selectedAccount.id;
    if (selectedContact) return selectedContact.accountId;
    // Groupe / direction : pas de plan propre
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
    if (selectedDirection) {
      return aggregateKpis(
        salesForDirectionScope(selectedDirection.id, soldSolutions),
        `Direction ${selectedDirection.name}`,
        solutionLabel,
        opportunitiesForDirectionScope(
          selectedDirection.id,
          activeOpportunities,
          activeContacts,
        ),
        undefined,
        salesTaxonomy,
      );
    }
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
      const dir = activeDirections.find(
        (d) => d.id === selectedContact.directionId,
      );
      if (dir) {
        return aggregateKpis(
          salesForDirectionScope(dir.id, soldSolutions),
          `Direction ${dir.name} (via contact)`,
          solutionLabel,
          opportunitiesForDirectionScope(
            dir.id,
            activeOpportunities,
            activeContacts,
          ),
          undefined,
          salesTaxonomy,
        );
      }
    }
    const fallbackId =
      activeAccounts.find((a) => a.type === "Holding")?.id ??
      activeAccounts[0]?.id;
    if (!fallbackId) {
      return aggregateKpis(
        [],
        "Aucun compte",
        solutionLabel,
        [],
        undefined,
        salesTaxonomy,
      );
    }
    const fallback = activeAccounts.find((a) => a.id === fallbackId)!;
    return aggregateKpis(
      salesForAccountScope(fallbackId, soldSolutions, activeAccounts),
      fallback.type === "Holding"
        ? `Groupe ${fallback.name}`
        : `Entreprise ${fallback.name}`,
      solutionLabel,
      opportunitiesForAccountScope(
        fallbackId,
        activeOpportunities,
        activeAccounts,
      ),
      undefined,
      salesTaxonomy,
    );
  }, [
    selectedAccount,
    selectedDirection,
    selectedContact,
    soldSolutions,
    solutionLabel,
    salesTaxonomy,
    activeDirections,
    activeAccounts,
    activeContacts,
    activeOpportunities,
  ]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedId(node.id);
  }, []);

  function selectMapFocusAccount(id: string) {
    setMapFocusAccountId(id);
    setSelectedId(id);
  }

  const accountPickerValue = mapFocusAccountId;
  const focusAccountId = mapFocusAccountId;
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
        </nav>

        <div className="sidebar-foot">
          <LanguageSwitcher className="sidebar-lang" />
          <p className="sidebar-user muted" title={user.email ?? undefined}>
            {user.email}
            {profile ? (
              <>
                <br />
                <span className={`role-pill role-${profile.role}`}>
                  {roleText(profile.role)}
                </span>
              </>
            ) : null}
          </p>
          <button
            type="button"
            className="ghost tiny"
            onClick={() => void signOut()}
          >
            {t("sidebar.signOut")}
          </button>
          {isAdmin && (
            <button
              type="button"
              className="ghost tiny"
              onClick={() => setTeamOpen(true)}
            >
              {t("sidebar.team")}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="settings-trigger"
              onClick={() => setSettingsOpen(true)}
            >
              {t("sidebar.settings")}
            </button>
          )}
        </div>
      </aside>

      <div className="app-main">
        {page === "dashboard" && (
          <DashboardPage onNavigate={navigate} />
        )}

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

        {page === "map" && (
          <div className="app map-app">
            <header className="topbar">
              <div className="brand">
                <AccountSearchSelect
                  accounts={activeAccounts}
                  value={accountPickerValue}
                  onChange={selectMapFocusAccount}
                  ariaLabel={t("map.pickAccount")}
                />
                <SameSectorPanel
                  accounts={activeAccounts}
                  focusAccountId={accountPickerValue}
                  onOpenAccount={selectMapFocusAccount}
                  filters={peerFilters}
                  onFiltersChange={setPeerFilters}
                />
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
                        <span className="filters-label">Entreprises</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={showHoldings}
                            onChange={(e) => setShowHoldings(e.target.checked)}
                          />
                          Groupes
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={showEntreprises}
                            onChange={(e) =>
                              setShowEntreprises(e.target.checked)
                            }
                          />
                          Entreprises
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={showPartners}
                            onChange={(e) => setShowPartners(e.target.checked)}
                          />
                          Partenaires
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={showCompetitors}
                            onChange={(e) =>
                              setShowCompetitors(e.target.checked)
                            }
                          />
                          Concurrents
                        </label>
                      </div>

                      <div className="filters filters-solutions">
                        <span className="filters-label">Solutions vendues</span>
                        {activeSolutions.map((s) => (
                          <label key={s.id} className="solution-filter">
                            <input
                              type="checkbox"
                              checked={visibleSolutions[s.id] !== false}
                              onChange={() => toggleSolution(s.id)}
                            />
                            {s.name}
                          </label>
                        ))}
                      </div>

                      <div className="filters filters-contacts">
                        <span className="filters-label">Contacts</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={showDirections}
                            onChange={(e) =>
                              setShowDirections(e.target.checked)
                            }
                          />
                          Directions
                        </label>
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
                              checked={visibleRoles[role.id] !== false}
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
                          if (n.type === "direction") return "#57534e";
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
                      {!selectedContact &&
                        !selectedAccount &&
                        !selectedDirection && (
                          <p className="muted">Aucune sélection.</p>
                        )}
                      {selectedContact && (
                        <div className="detail">
                          <strong>{selectedContact.name}</strong>
                          <p>{selectedContact.title}</p>
                          <p>
                            Direction :{" "}
                            {directionLabel(selectedContact.directionId)}
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
                      {selectedDirection && selectedDirNode && (
                        <SoldSolutionEditor
                          accountId={selectedDirNode.holdingId}
                          directionId={selectedDirection.id}
                          readOnly
                        />
                      )}
                      {selectedAccount &&
                        selectedAccount.type === "Entreprise" && (
                          <SoldSolutionEditor
                            accountId={selectedAccount.id}
                            directionId={null}
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
                                const dirs = soldLineDirectionIds(s);
                                const dirLabel =
                                  dirs.length === 0
                                    ? " (entreprise)"
                                    : ` @ ${dirs.map((id) => directionLabel(id)).join(", ")}`;
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
                                    {dirLabel}
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

      {settingsOpen && isAdmin && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}
      {teamOpen && isAdmin && (
        <TeamAdminPanel onClose={() => setTeamOpen(false)} />
      )}
    </div>
  );
}
