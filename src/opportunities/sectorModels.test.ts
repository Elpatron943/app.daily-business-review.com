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
  applyChoice,
  buildDebrief,
  buyerLineFor,
  currentStep,
  isFinished,
  startSimulation,
  buildSimulation,
  listPatterns,
  type ChoiceKind,
  type SimState,
  type SimStep,
  type Simulation,
} from "./meetingPatterns";
import { DEAL_REVIEW_SECTORS } from "./dealReviewSectors";
import { METIER_PACKS, crossRulesFor } from "./metierPacks";
import {
  BLOCKER_FACTORS,
  buildBlockerFactorsAddendum,
  summarizeFactors,
} from "./blockerFactors";

function play(sim: Simulation, pick: (s: SimStep, n: number) => ChoiceKind): SimState {
  let st = startSimulation(sim);
  let n = 0;
  while (!isFinished(st)) {
    const step = currentStep(st)!;
    st = applyChoice(st, step.choices.find((c) => c.kind === pick(step, n))!.id);
    n++;
  }
  return st;
}

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

  it("bonnes questions : tout est trouvé et creusé ; arguments : rendez-vous écourté", () => {
    const sim = buildSimulation({ clientSectorId: "banque-assurance", sellerProfileId: "editeur-saas", meeting: "R1", seed: 11 });
    const good = buildDebrief(sim, play(sim, () => "question"));
    expect(good.missed).toHaveLength(0);
    expect(good.issueReached).toBe(true);
    expect(good.blockers.every((b) => b.status === "creuse")).toBe(true);

    const st = play(sim, () => "argument");
    const bad = buildDebrief(sim, st);
    expect(st.endedEarly).toBe(true);
    expect(st.played).toHaveLength(sim.patience);
    expect(bad.lost.length).toBe(sim.steps.length - sim.patience);
    expect(bad.asked).toHaveLength(0);
    expect(bad.blockers.every((b) => b.status === "manque")).toBe(true);
    expect(bad.nextStep).toContain("écourté");
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
    const good = buildDebrief(sim, play(sim, () => "question"));
    expect(good.blockers.map((b) => b.factor)).toEqual(sim.blockers);
    expect(good.blockers.every((b) => b.found)).toBe(true);
    const vague = buildDebrief(sim, play(sim, () => "vague"));
    expect(vague.blockers.every((b) => !b.found)).toBe(true);
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

describe("enchaînement des questions", () => {
  const sim = buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: null, meeting: "R1", seed: 4 });

  it("une bonne question qui révèle un blocage débloque une relance juste après", () => {
    let st = startSimulation(sim);
    while (!isFinished(st)) {
      const step = currentStep(st)!;
      st = applyChoice(st, step.choices.find((c) => c.kind === "question")!.id);
      if (st.played.at(-1)!.turn.riskFound) break;
    }
    const factor = st.played.at(-1)!.turn.riskFound!.factor;
    expect(currentStep(st)!.origin).toBe("relance");
    expect(currentStep(st)!.factor).toBe(factor);
    // relance ratée : trouvé mais pas creusé
    st = applyChoice(st, currentStep(st)!.choices.find((c) => c.kind === "vague")!.id);
    while (!isFinished(st)) {
      const step = currentStep(st)!;
      st = applyChoice(st, step.choices.find((c) => c.kind === "question")!.id);
    }
    const d = buildDebrief(sim, st);
    expect(d.blockers.find((b) => b.factor === factor)!.status).toBe("repere");
    expect(d.carryOver).toContain(factor);
  });

  it("une bonne question rend de la patience : alterner évite d'écourter", () => {
    const st = play(sim, (_, n) => (n % 2 === 0 ? "argument" : "question"));
    expect(st.endedEarly).toBe(false);
  });

  it("un blocage non traité revient au rendez-vous suivant, plus grave", () => {
    const d = buildDebrief(sim, play(sim, (_, n) => (n === 0 ? "question" : n % 2 ? "vague" : "question")));
    expect(d.carryOver.length).toBeGreaterThan(0);
    const next = buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: null, meeting: "R2", seed: 8, carryOver: d.carryOver, known: d.known });
    expect(next.carried).toEqual(d.carryOver);
    expect(next.steps.slice(0, d.carryOver.length).every((s) => s.origin === "retour" && s.risk?.level === "risque_majeur")).toBe(true);
    for (const f of d.carryOver) expect(next.blockers).toContain(f);
    const st = play(next, () => "question");
    const nd = buildDebrief(next, st);
    for (const f of d.carryOver) {
      const b = nd.blockers.find((x) => x.factor === f)!;
      expect(b.carried).toBe(true);
      expect(b.status).toBe("creuse");
    }
  });

  it("l'acheteur se souvient d'un sujet déjà exploré", () => {
    const next = buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: null, meeting: "R4", seed: 2, known: ["decideur"] });
    const st = startSimulation(next);
    const signataire = next.steps.find((s) => s.id === "r4-signataire")!;
    expect(buyerLineFor(st, signataire)).toContain("Comme je vous l'ai dit");
    const fresh = startSimulation(buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: null, meeting: "R4", seed: 2 }));
    expect(buyerLineFor(fresh, signataire)).not.toContain("Comme je vous l'ai dit");
  });

  it("le débrief raconte l'enchaînement", () => {
    const d = buildDebrief(sim, play(sim, () => "argument"));
    expect(d.events.some((e) => e.includes("s'agace"))).toBe(true);
    expect(d.events.at(-1)).toContain("écourte le rendez-vous");
  });
});

describe("packs métier", () => {
  it("chaque domaine cyber a ses questions propres sur au moins trois rendez-vous, rattachées à un facteur", () => {
    const factors = new Set(BLOCKER_FACTORS.map((f) => f.id));
    const patternIds = new Set(listPatterns().map((p) => p.id));
    for (const pack of METIER_PACKS) {
      for (const d of pack.domains) {
        expect(d.questions.length, d.id).toBeGreaterThanOrEqual(4);
        expect(new Set(d.questions.map((q) => q.meeting)).size, d.id).toBeGreaterThanOrEqual(3);
        for (const q of d.questions) expect(factors.has(q.factor), `${d.id} ${q.id}`).toBe(true);
        for (const id of Object.keys(d.variants)) expect(patternIds.has(id), `${d.id} ${id}`).toBe(true);
        for (const f of d.likelyBlockers) expect(factors.has(f)).toBe(true);
      }
    }
    expect(METIER_PACKS.find((p) => p.id === "cybersecurite")!.domains).toHaveLength(7);
  });

  it("le métier reformule un moment commun et ajoute ses questions", () => {
    const base = buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: "editeur-saas", meeting: "R1", seed: 6 });
    const tprm = buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: "editeur-saas", meeting: "R1", seed: 6, metierId: "cyber-tprm" });
    expect(tprm.steps.length).toBeGreaterThan(base.steps.length);
    expect(tprm.steps.find((s) => s.id === "r1-probleme")!.goodQuestion).toContain("fournisseurs critiques");
    expect(base.steps.find((s) => s.id === "r1-probleme")!.goodQuestion).not.toContain("fournisseurs critiques");
    expect(tprm.steps.some((s) => s.id === "metier-tprm-proprietaire")).toBe(true);
    expect(tprm.metier?.domain).toBe("Gestion du risque fournisseur");
    expect(tprm.opening).toContain("gestion du risque fournisseur");
  });

  it("toutes les combinaisons métier restent jouables (3 boutons distincts par étape)", () => {
    for (const d of METIER_PACKS.flatMap((p) => p.domains)) {
      for (const m of CLIENT_SECTOR_MODELS.filter((x) => !x.overlay)) {
        for (const mt of MEETING_TYPES) {
          const sim = buildSimulation({ clientSectorId: m.id, clientSize: "ge", multiEntity: true, sellerProfileId: "editeur-saas", meeting: mt.id, seed: 13, metierId: d.id });
          for (const step of sim.steps) {
            expect(new Set(step.choices.map((c) => c.label)).size, `${d.id} ${m.id} ${mt.id} ${step.id}`).toBe(3);
            expect(step.goodQuestion).not.toMatch(/undefined/);
          }
          const st = play(sim, () => "question");
          expect(buildDebrief(sim, st).blockers.every((b) => b.status === "creuse")).toBe(true);
        }
      }
    }
  });

  it("une règle croisée change le rendez-vous : risque fournisseur vendu à une banque", () => {
    const banque = buildSimulation({ clientSectorId: "banque-assurance", clientSize: "eti", sellerProfileId: null, meeting: "R1", seed: 3, metierId: "cyber-tprm" });
    expect(banque.steps.find((s) => s.id === "r1-urgence")!.goodQuestion).toContain("DORA");
    const industrie = buildSimulation({ clientSectorId: "industrie", clientSize: "eti", sellerProfileId: null, meeting: "R1", seed: 3, metierId: "cyber-tprm" });
    expect(industrie.steps.find((s) => s.id === "r1-urgence")!.goodQuestion).not.toContain("DORA");
    expect(crossRulesFor("cyber-tprm", "banque-assurance")).toHaveLength(1);
  });
});
