import { describe, expect, it } from "vitest";
import {
  CLIENT_SECTOR_MODELS,
  MEETING_TYPES,
  SELLER_PROFILES,
  buildSectorReviewAddendum,
  buildSimulationSystemPrompt,
  clientModelIdFromDealReviewSector,
  getClientSectorModel,
  getMeetingTree,
  selectableClientSectors,
} from "./sectorModels";
import { DEAL_REVIEW_SECTORS } from "./dealReviewSectors";

describe("modèles sectoriels clients", () => {
  it("chaque modèle a un arbre par type de rendez-vous, avec au moins deux questions", () => {
    for (const model of CLIENT_SECTOR_MODELS) {
      for (const meeting of MEETING_TYPES) {
        const tree = getMeetingTree(model, meeting.id);
        expect(tree, `${model.id} ${meeting.id}`).not.toBeNull();
        expect(tree!.nodes.length).toBeGreaterThanOrEqual(2);
        for (const n of tree!.nodes) {
          expect(n.branches.length).toBeGreaterThanOrEqual(1);
        }
        expect(tree!.issue.length).toBeGreaterThan(0);
      }
    }
  });

  it("une branche à risque propose toujours une action", () => {
    for (const model of CLIENT_SECTOR_MODELS) {
      for (const tree of model.trees) {
        for (const n of tree.nodes) {
          for (const b of n.branches) {
            if (b.risk) expect(b.action, `${model.id} ${n.question}`).toBeTruthy();
          }
        }
      }
    }
  });

  it("une règle sourcée porte une date, et un lien quand elle cite un texte en ligne", () => {
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
    expect(clientModelIdFromDealReviewSector("sante-pharma", "medtech")).toBe("generique");
    expect(clientModelIdFromDealReviewSector(null)).toBe("generique");
  });
});

describe("profils vendeur", () => {
  it("chaque profil couvre les quatre rendez-vous", () => {
    for (const p of SELLER_PROFILES) {
      for (const m of MEETING_TYPES) {
        expect(p.byMeeting[m.id].length, `${p.id} ${m.id}`).toBeGreaterThan(0);
      }
      expect(p.objections.length).toBeGreaterThan(0);
    }
  });
});

describe("prompts", () => {
  it("la simulation combine secteur client, profil vendeur et rendez-vous", () => {
    const prompt = buildSimulationSystemPrompt({
      clientSectorId: "banque-assurance",
      sellerProfileId: "esn-integrateur",
      meeting: "R4",
      sellerFirstName: "Alex",
      orgName: "Acme",
    });
    expect(prompt).toContain("Banque, assurance");
    expect(prompt).toContain("ESN, intégrateur");
    expect(prompt).toContain("R4 · Achats et contrat");
    expect(prompt).toContain("Taux journaliers");
    expect(prompt).toContain("ne le révèle jamais");
    expect(prompt).not.toContain("Couche grands groupes");
  });

  it("la simulation ajoute la couche grands groupes pour un client multi-filiales", () => {
    const prompt = buildSimulationSystemPrompt({
      clientSectorId: "industrie",
      sellerProfileId: null,
      multiEntity: true,
      meeting: "R1",
      buyerRole: "Achats centraux",
      sellerFirstName: "Alex",
      orgName: "Acme",
    });
    expect(prompt).toContain("Couche grands groupes");
    expect(prompt).toContain("Rôle : Achats centraux");
  });

  it("un secteur inconnu retombe sur le modèle générique", () => {
    const prompt = buildSimulationSystemPrompt({
      clientSectorId: "inconnu",
      sellerProfileId: "inconnu",
      meeting: "R2",
      sellerFirstName: "Alex",
      orgName: "Acme",
    });
    expect(prompt).toContain("modèle générique B2B");
  });

  it("l'analyse d'opportunité cite le comité attendu et le veto", () => {
    const block = buildSectorReviewAddendum({
      clientSectorId: "public",
      sellerProfileId: "editeur-saas",
      multiEntity: false,
    });
    expect(block).toContain("Peut dire non : Acheteur (procédure), Budget voté");
    expect(block).toContain("140 000 € HT");
    expect(block).toContain("Éditeur SaaS");
    expect(
      buildSectorReviewAddendum({ clientSectorId: null, sellerProfileId: null }),
    ).toBeNull();
  });
});
