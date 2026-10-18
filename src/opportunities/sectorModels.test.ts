import { describe, expect, it } from "vitest";
import {
  CLIENT_SECTOR_MODELS,
  MEETING_TYPES,
  SELLER_PROFILES,
  buildSectorReviewAddendum,
  clientModelIdFromDealReviewSector,
  getClientSectorModel,
  selectableClientSectors,
} from "./sectorModels";
import {
  buildDebrief,
  buildSimulation,
  listPatterns,
  playChoice,
  type SimTurn,
} from "./meetingPatterns";
import { DEAL_REVIEW_SECTORS } from "./dealReviewSectors";

describe("variables sectorielles", () => {
  it("chaque secteur renseigne toutes les variables et un interlocuteur par rendez-vous", () => {
    for (const model of CLIENT_SECTOR_MODELS) {
      for (const [key, value] of Object.entries(model.vars)) {
        expect(value.trim().length, `${model.id}.${key}`).toBeGreaterThan(0);
      }
      for (const m of MEETING_TYPES) {
        expect(model.interlocutors[m.id].length).toBeGreaterThan(0);
      }
    }
  });

  it("une règle porte une date, et un lien https quand elle en cite un", () => {
    for (const model of CLIENT_SECTOR_MODELS) {
      for (const r of model.rules) {
        expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        if (r.source) expect(r.source).toMatch(/^https:\/\//);
      }
    }
  });

  it("la couche grands groupes n'est pas proposée comme secteur client", () => {
    const ids = selectableClientSectors().map((m) => m.id);
    expect(ids).not.toContain("grands-groupes");
    expect(ids).toContain("generique");
  });

  it("chaque famille du chatbot mène à un modèle existant", () => {
    for (const sector of DEAL_REVIEW_SECTORS) {
      for (const sub of sector.subSectors) {
        const id = clientModelIdFromDealReviewSector(sector.id, sub.id);
        expect(getClientSectorModel(id), `${sector.id}/${sub.id}`).not.toBeNull();
      }
    }
    expect(clientModelIdFromDealReviewSector("sante-pharma", "etablissement-sante")).toBe(
      "sante-publique",
    );
    expect(clientModelIdFromDealReviewSector(null)).toBe("generique");
  });

  it("l'analyse d'opportunité cite le veto, la procédure et le profil vendeur", () => {
    const block = buildSectorReviewAddendum({
      clientSectorId: "public",
      sellerProfileId: "editeur-saas",
    });
    expect(block).toContain("Peut dire non : Acheteur (procédure), Budget voté");
    expect(block).toContain("140 000 € HT");
    expect(block).toContain("Éditeur SaaS");
    expect(buildSectorReviewAddendum({ clientSectorId: null, sellerProfileId: null })).toBeNull();
  });
});

describe("patterns communs", () => {
  it("la majorité des patterns est commune à tous les secteurs", () => {
    const all = listPatterns();
    const common = all.filter((p) => !p.sectorSpecific);
    expect(common.length / all.length).toBeGreaterThan(0.75);
    for (const m of MEETING_TYPES) {
      expect(common.filter((p) => p.meeting === m.id).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("le même pattern est ajusté par les variables du secteur", () => {
    const banque = buildSimulation({ clientSectorId: "banque-assurance", sellerProfileId: null, meeting: "R3", seed: 1 });
    const hopital = buildSimulation({ clientSectorId: "sante-publique", sellerProfileId: null, meeting: "R3", seed: 1 });
    const qBanque = banque.steps.find((s) => s.id === "r3-exigences")!;
    const qHopital = hopital.steps.find((s) => s.id === "r3-exigences")!;
    expect(qBanque.buyerLine).toContain("DORA");
    expect(qHopital.buyerLine).toContain("GHT");
  });
});

describe("rendez-vous à boutons", () => {
  const setups = CLIENT_SECTOR_MODELS.filter((m) => !m.overlay).flatMap((m) =>
    MEETING_TYPES.flatMap((mt) =>
      [null, ...SELLER_PROFILES.map((p) => p.id)].flatMap((seller) =>
        [false, true].map((multi) => ({
          clientSectorId: m.id,
          sellerProfileId: seller,
          multiEntity: multi,
          meeting: mt.id,
          seed: 7,
        })),
      ),
    ),
  );

  it("chaque combinaison donne trois boutons distincts par étape, dont une seule bonne question", () => {
    for (const setup of setups) {
      const sim = buildSimulation(setup);
      expect(sim.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of sim.steps) {
        expect(step.choices).toHaveLength(3);
        expect(new Set(step.choices.map((c) => c.kind)).size).toBe(3);
        expect(new Set(step.choices.map((c) => c.label)).size).toBe(3);
        expect(step.choices.find((c) => c.kind === "question")!.label).toBe(step.goodQuestion);
        expect(step.buyerLine).not.toMatch(/undefined/);
      }
    }
  });

  it("le profil vendeur ajoute son objection, la couche groupe ses étapes", () => {
    const base = buildSimulation({ clientSectorId: "industrie", sellerProfileId: null, meeting: "R1", seed: 3 });
    const withSeller = buildSimulation({ clientSectorId: "industrie", sellerProfileId: "esn-integrateur", meeting: "R1", seed: 3 });
    const withGroup = buildSimulation({ clientSectorId: "industrie", sellerProfileId: null, multiEntity: true, meeting: "R1", seed: 3 });
    expect(withSeller.steps.map((s) => s.id)).toContain("objection-vendeur");
    expect(base.steps.map((s) => s.id)).not.toContain("objection-vendeur");
    expect(withGroup.steps.map((s) => s.id)).toContain("r1-entite");
  });

  it("une même graine rejoue la même partie", () => {
    const a = buildSimulation({ clientSectorId: "public", sellerProfileId: "conseil", meeting: "R4", seed: 42 });
    const b = buildSimulation({ clientSectorId: "public", sellerProfileId: "conseil", meeting: "R4", seed: 42 });
    expect(a.steps).toEqual(b.steps);
  });

  it("chaque partie contient au moins un risque", () => {
    for (const setup of setups) {
      const sim = buildSimulation(setup);
      expect(sim.steps.some((s) => s.risky), JSON.stringify(setup)).toBe(true);
    }
  });

  it("seule la bonne question révèle le risque ; le débrief compte les oublis", () => {
    const sim = buildSimulation({ clientSectorId: "banque-assurance", sellerProfileId: "editeur-saas", meeting: "R1", seed: 11 });
    const allGood: SimTurn[] = sim.steps.map((s) =>
      playChoice(s, s.choices.find((c) => c.kind === "question")!.id),
    );
    const good = buildDebrief(sim, allGood);
    expect(good.missed).toHaveLength(0);
    expect(good.issueReached).toBe(true);
    expect(good.risksMissed).toHaveLength(0);
    expect(good.risksFound.length).toBe(sim.steps.filter((s) => s.risky).length);

    const allArgue: SimTurn[] = sim.steps.map((s) =>
      playChoice(s, s.choices.find((c) => c.kind === "argument")!.id),
    );
    const bad = buildDebrief(sim, allArgue);
    expect(bad.asked).toHaveLength(0);
    expect(bad.issueReached).toBe(false);
    expect(bad.risksFound).toHaveLength(0);
    expect(bad.risksMissed.length).toBeGreaterThan(0);
    expect(bad.nextStep).toContain("vrai deal");
  });
});
