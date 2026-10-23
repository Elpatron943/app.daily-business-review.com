import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config/defaults";
import type { OrgConfig } from "../config/types";
import {
  savedAnswerSections,
  savedConfigSections,
} from "./savedSetup";

function withSetup(patch: Partial<OrgConfig>): OrgConfig {
  return { ...structuredClone(defaultConfig), ...patch };
}

describe("savedSetup", () => {
  it("affiche les réponses validées, pas le référentiel d’usine", () => {
    const sections = savedAnswerSections({
      companyName: "Acme",
      activity: "Logiciel pour DSI",
      competitors: "Aprovali\nBoard of cyber",
    });
    expect(sections.map((section) => section.title)).toEqual([
      "Entreprise",
      "Activité",
      "Concurrents",
    ]);
    expect(sections[2]?.lines).toEqual(["Aprovali", "Board of cyber"]);
  });

  it("retrouve ce qui a été ajouté à la config quand les réponses brutes manquent", () => {
    const config = withSetup({
      orgProfile: {
        name: "Acme",
        description: "Logiciel",
        usps: [
          {
            id: "usp-1",
            label: "Time-to-value",
            description: "",
            active: true,
            order: 1,
          },
        ],
      },
      personae: [
        ...defaultConfig.personae,
        { id: "persona-rssi", name: "RSSI", active: true, order: 9 },
      ],
      competitors: [
        {
          id: "comp-1",
          name: "Aprovali",
          description: "",
          active: true,
          order: 1,
          features: [],
        },
      ],
    });

    const sections = savedConfigSections(config);
    expect(sections.find((section) => section.title === "Entreprise")?.lines).toEqual([
      "Acme",
      "Logiciel",
    ]);
    expect(sections.find((section) => section.title === "Personae")?.lines).toEqual([
      "RSSI",
    ]);
    expect(
      sections.find((section) => section.title === "Concurrents")?.lines,
    ).toEqual(["Aprovali"]);
  });
});
