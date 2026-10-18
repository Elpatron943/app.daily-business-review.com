import { describe, expect, it } from "vitest";
import {
  CLIENT_SIZES,
  computeComplexity,
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
import {
  BLOCKER_FACTORS,
  buildBlockerFactorsAddendum,
  summarizeFactors,
} from "./blockerFactors";

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
      expect(sim.steps.length).toBeGreaterThanOrEqual(2);
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

describe("facteurs de blocage", () => {
  it("chaque facteur peut être découvert dans au moins un rendez-vous", () => {
    const probed = new Set(listPatterns().map((p) => p.factor).filter(Boolean));
    for (const f of BLOCKER_FACTORS) {
      expect(probed.has(f.id), f.id).toBe(true);
    }
  });

  it("les facteurs fréquents des secteurs et des profils existent dans la grille", () => {
    const ids = new Set(BLOCKER_FACTORS.map((f) => f.id));
    for (const m of CLIENT_SECTOR_MODELS) {
      for (const f of m.likelyBlockers) expect(ids.has(f), `${m.id} ${f}`).toBe(true);
    }
    for (const p of SELLER_PROFILES) {
      for (const f of [...p.likelyBlockers, p.objectionFactor]) {
        expect(ids.has(f), `${p.id} ${f}`).toBe(true);
      }
    }
  });

  it("chaque partie cache plusieurs blocages, chacun découvrable par une étape", () => {
    for (const m of CLIENT_SECTOR_MODELS.filter((x) => !x.overlay)) {
      for (const mt of MEETING_TYPES) {
        for (const multi of [false, true]) {
          const sim = buildSimulation({ clientSectorId: m.id, sellerProfileId: "editeur-saas", multiEntity: multi, meeting: mt.id, seed: 5 });
          expect(sim.blockers.length, `${m.id} ${mt.id}`).toBeGreaterThanOrEqual(1);
          expect(new Set(sim.blockers).size).toBe(sim.blockers.length);
          for (const b of sim.blockers) {
            expect(sim.steps.some((s) => s.factor === b && s.risky), `${m.id} ${mt.id} ${b}`).toBe(true);
          }
        }
      }
    }
  });

  it("le débrief dit ce qui bloquait le deal, trouvé ou non", () => {
    const sim = buildSimulation({ clientSectorId: "public", sellerProfileId: "esn-integrateur", meeting: "R1", seed: 21 });
    const good = buildDebrief(sim, sim.steps.map((s) => playChoice(s, s.choices.find((c) => c.kind === "question")!.id)));
    expect(good.blockers.map((b) => b.factor)).toEqual(sim.blockers);
    expect(good.blockers.every((b) => b.found)).toBe(true);
    const vague = buildDebrief(sim, sim.steps.map((s) => playChoice(s, s.choices.find((c) => c.kind === "vague")!.id)));
    expect(vague.blockers.every((b) => !b.found)).toBe(true);
    expect(vague.nextStep).toContain("vérifie d'abord ce blocage");
  });

  it("le secteur oriente le tirage des blocages", () => {
    const count = (sector: string, factor: string) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const sim = buildSimulation({ clientSectorId: sector, sellerProfileId: null, meeting: "R1", seed });
        if (sim.blockers.includes(factor as never)) n++;
      }
      return n;
    };
    expect(count("public", "budget")).toBeGreaterThan(count("generique", "budget"));
  });

  it("les constats du diagnostic sont rattachés aux facteurs", () => {
    const summary = summarizeFactors([
      { code: "C1", severity: "bloquant" },
      { code: "C3", severity: "risque" },
      { code: "C5", severity: "bloquant" },
      { code: "U2", severity: "risque" },
      { code: "T1", severity: "bloquant" },
    ]);
    expect(summary.map((s) => s.factor.id)).toEqual(["influence", "decideur", "valeur"]);
    expect(summary.find((s) => s.factor.id === "influence")!.findings).toBe(2);
  });

  it("la revue IA reçoit la grille et doit nommer les facteurs", () => {
    const block = buildBlockerFactorsAddendum(["budget", "achats"]);
    for (const f of BLOCKER_FACTORS) expect(block).toContain(f.label);
    expect(block).toContain("Budget, Achats et procédure");
    expect(block).toContain('"facteurs"');
  });
});

describe("complexité du deal", () => {
  it("le niveau combine secteur, taille et groupe", () => {
    expect(computeComplexity({ clientSectorId: "generique", clientSize: "pme" }).level).toBe(1);
    expect(computeComplexity({ clientSectorId: "industrie", clientSize: "pme" }).level).toBe(2);
    expect(computeComplexity({ clientSectorId: "industrie", clientSize: "eti" }).level).toBe(3);
    expect(computeComplexity({ clientSectorId: "banque-assurance", clientSize: "ge", multiEntity: true }).level).toBe(4);
  });

  it("plus le deal est complexe, plus il y a de questions et de blocages", () => {
    for (const mt of MEETING_TYPES) {
      const sizes = CLIENT_SIZES.map((c) => c.id);
      const sims = [
        buildSimulation({ clientSectorId: "generique", clientSize: "pme", sellerProfileId: null, meeting: mt.id, seed: 9 }),
        buildSimulation({ clientSectorId: "industrie", clientSize: "pme", sellerProfileId: null, meeting: mt.id, seed: 9 }),
        buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: null, meeting: mt.id, seed: 9 }),
        buildSimulation({ clientSectorId: "banque-assurance", clientSize: "ge", sellerProfileId: null, meeting: mt.id, seed: 9 }),
      ];
      expect(sizes).toEqual(["pme", "eti", "ge"]);
      expect(sims.map((x) => x.complexity.level)).toEqual([1, 2, 3, 4]);
      for (let i = 1; i < sims.length; i++) {
        expect(sims.at(i)!.steps.length, `${mt.id} niveau ${i + 1}`).toBeGreaterThan(sims.at(i - 1)!.steps.length);
        expect(sims.at(i)!.blockers.length).toBeGreaterThanOrEqual(sims.at(i - 1)!.blockers.length);
      }
      expect(sims[0]!.blockers).toHaveLength(1);
      expect(sims[3]!.blockers).toHaveLength(3);
    }
  });
});
