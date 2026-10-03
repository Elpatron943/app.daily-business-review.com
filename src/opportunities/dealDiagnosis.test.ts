import { describe, expect, it } from "vitest";
import { DEFAULT_SALES_PROCESS } from "./salesProcess";
import {
  diagnoseOpportunity,
  type DiagnoseOpportunityInput,
} from "./dealDiagnosis";
import type { Opportunity } from "./OpportunityContext";
import { EMPTY_OPPORTUNITY_WHY_NOW } from "./OpportunityContext";

const PHASE_ORDER = [
  "Whitespace",
  "Discovery",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

const NOW = new Date("2026-10-03T12:00:00Z");

function baseOpp(patch: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    name: "Test deal",
    amount: 100000,
    currency: "EUR",
    closeDate: "2026-12-31",
    primaryAccountId: "acc-fr",
    phase: "Discovery",
    kind: "prospect",
    solutionId: "",
    moduleIds: [],
    personaIds: [],
    compellingEventIds: [],
    competitorIds: [],
    featureAssessments: {},
    projectLeverIds: [],
    projectProblemIds: [],
    projectWhy: {
      problem: "Problème client documenté",
      impacted: "",
      consequence: "",
    },
    whyNow: {
      ...EMPTY_OPPORTUNITY_WHY_NOW,
      inactionNote: "Perte de 2 ETP / an",
    },
    variables: {},
    businessOutcomes: { oneTimeInvestment: 10000 },
    processAnswers: {},
    mappingChecks: {},
    stakeholders: [],
    actions: [{ id: "a1", title: "Next step", status: "Todo", dueDate: "2026-11-01" }],
    active: true,
    ...patch,
  };
}

function run(
  patch: Partial<Opportunity>,
  extra: Partial<DiagnoseOpportunityInput> = {},
) {
  return diagnoseOpportunity({
    opportunity: baseOpp(patch),
    contacts: [
      {
        id: "c-eb",
        name: "C. Martin",
        title: "DAF",
        accountId: "acc-fr",
      },
      {
        id: "c-ch",
        name: "S. Diallo",
        title: "Head of Sales Ops",
        accountId: "acc-fr",
      },
      {
        id: "c-op",
        name: "O. Bloc",
        title: "IT",
        accountId: "acc-fr",
      },
    ],
    accounts: [
      { id: "hold", type: "Holding", holdingId: null },
      { id: "acc-fr", type: "Entreprise", holdingId: "hold" },
      { id: "acc-de", type: "Entreprise", holdingId: "hold" },
    ],
    processDomains: DEFAULT_SALES_PROCESS,
    phaseOrder: PHASE_ORDER,
    now: NOW,
    ...extra,
  });
}

function codes(findings: { code: string }[]) {
  return findings.map((f) => f.code);
}

describe("diagnoseOpportunity", () => {
  it("C1 — pas d'acheteur économique à partir de Qualification", () => {
    const f = run({ phase: "Qualification", stakeholders: [] });
    expect(codes(f)).toContain("C1");
  });

  it("C2 — acheteur économique Identified en Proposal", () => {
    const f = run({
      phase: "Proposal",
      stakeholders: [
        { contactId: "c-eb", role: "EconomicBuyer", status: "Identified" },
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
      ],
      competitorIds: ["comp-1"],
      businessOutcomes: { oneTimeInvestment: 1 },
    });
    expect(codes(f)).toContain("C2");
    expect(f.find((x) => x.code === "C2")?.severity).toBe("bloquant");
  });

  it("C3 — aucun champion Engaged/Aligned", () => {
    const f = run({
      phase: "Discovery",
      stakeholders: [
        { contactId: "c-ch", role: "Champion", status: "Identified" },
      ],
    });
    expect(codes(f)).toContain("C3");
  });

  it("C4 — deal mono-threadé", () => {
    const f = run({
      stakeholders: [
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
      ],
    });
    expect(codes(f)).toContain("C4");
  });

  it("C5 — Opposed sans action ouverte", () => {
    const f = run({
      stakeholders: [
        { contactId: "c-op", role: "Blocker", status: "Opposed" },
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
        { contactId: "c-eb", role: "EconomicBuyer", status: "Engaged" },
      ],
      actions: [],
    });
    expect(codes(f)).toContain("C5");
  });

  it("C6 — une seule entité alors que le groupe a des filiales", () => {
    const f = run({
      stakeholders: [
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
        { contactId: "c-eb", role: "EconomicBuyer", status: "Engaged" },
      ],
    });
    expect(codes(f)).toContain("C6");
  });

  it("P1 — question phase courante à Non", () => {
    const f = run({
      phase: "Discovery",
      processAnswers: {
        "q-disc-1": { status: "No", updatedAt: "2026-09-01" },
      },
    });
    expect(codes(f)).toContain("P1");
  });

  it("P2 — plus de 50 % sans réponse en phase courante", () => {
    const f = run({
      phase: "Discovery",
      processAnswers: {
        "q-disc-1": { status: "Yes" },
      },
    });
    expect(codes(f)).toContain("P2");
  });

  it("P3 — étape précédente sautée", () => {
    const f = run({
      phase: "Qualification",
      processAnswers: {},
      compellingEventIds: ["ce-1"],
      whyNow: { ...EMPTY_OPPORTUNITY_WHY_NOW, inactionNote: "x" },
    });
    expect(codes(f)).toContain("P3");
  });

  it("U1 — pas de why now ni CE à partir de Qualification", () => {
    const f = run({
      phase: "Qualification",
      whyNow: { ...EMPTY_OPPORTUNITY_WHY_NOW },
      compellingEventIds: [],
      stakeholders: [
        { contactId: "c-eb", role: "EconomicBuyer", status: "Engaged" },
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
      ],
    });
    expect(codes(f)).toContain("U1");
  });

  it("U2 — business outcomes vides en Proposal", () => {
    const f = run({
      phase: "Proposal",
      businessOutcomes: {},
      competitorIds: ["c1"],
      stakeholders: [
        { contactId: "c-eb", role: "EconomicBuyer", status: "Engaged" },
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
      ],
    });
    expect(codes(f)).toContain("U2");
  });

  it("U3 — problème client absent", () => {
    const f = run({
      projectProblemIds: [],
      projectWhy: { problem: "", impacted: "", consequence: "" },
    });
    expect(codes(f)).toContain("U3");
  });

  it("T1 — closing dépassé", () => {
    const f = run({ closeDate: "2026-01-01", phase: "Proposal" });
    expect(codes(f)).toContain("T1");
  });

  it("T2 — closing < 30 j et phase avant Negotiation", () => {
    const f = run({
      closeDate: "2026-10-20",
      phase: "Proposal",
      competitorIds: ["x"],
      stakeholders: [
        { contactId: "c-eb", role: "EconomicBuyer", status: "Engaged" },
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
      ],
    });
    expect(codes(f)).toContain("T2");
  });

  it("T3 — fiche stale", () => {
    const f = run(
      {
        processAnswers: {
          "q-disc-1": { status: "Yes", updatedAt: "2026-08-01" },
        },
      },
      { updatedAt: "2026-08-01T00:00:00Z" },
    );
    expect(codes(f)).toContain("T3");
  });

  it("A1 — aucune action ouverte", () => {
    const f = run({ actions: [] });
    expect(codes(f)).toContain("A1");
  });

  it("A2 — action en retard", () => {
    const f = run({
      actions: [
        {
          id: "late",
          title: "Relancer DAF",
          status: "Todo",
          dueDate: "2026-09-01",
        },
      ],
    });
    expect(codes(f)).toContain("A2");
  });

  it("M1 — SWOT non maîtrisée sans action", () => {
    const f = run({
      actions: [],
      mappingChecks: {
        risques: [{ id: "omap-1", status: "not_mastered" }],
      },
    });
    expect(codes(f)).toContain("M1");
  });

  it("M2 — pas de concurrent en Proposal", () => {
    const f = run({
      phase: "Proposal",
      competitorIds: [],
      stakeholders: [
        { contactId: "c-eb", role: "EconomicBuyer", status: "Engaged" },
        { contactId: "c-ch", role: "Champion", status: "Aligned" },
      ],
    });
    expect(codes(f)).toContain("M2");
  });

  it("M3 — score deal bas en Proposal+", () => {
    const f = run(
      {
        phase: "Proposal",
        competitorIds: ["x"],
        stakeholders: [
          { contactId: "c-eb", role: "EconomicBuyer", status: "Engaged" },
          { contactId: "c-ch", role: "Champion", status: "Aligned" },
        ],
      },
      { processPct: 20, mappingPct: 20 },
    );
    expect(codes(f)).toContain("M3");
  });

  it("trie bloquant avant risque / vigilance", () => {
    const f = run({
      phase: "Proposal",
      closeDate: "2026-01-01",
      competitorIds: [],
      whyNow: { ...EMPTY_OPPORTUNITY_WHY_NOW },
      compellingEventIds: [],
      stakeholders: [],
      actions: [],
    });
    const ranks = { bloquant: 0, risque: 1, vigilance: 2 } as const;
    for (let i = 1; i < f.length; i++) {
      expect(ranks[f[i].severity]).toBeGreaterThanOrEqual(
        ranks[f[i - 1].severity],
      );
    }
  });
});
