import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEAL_REVIEW_SECTORS } from "../src/opportunities/dealReviewSectors";

const root = "docs/agents/commercial";
const old = [
  "industrie-manufacturing.md",
  "saas-tech.md",
  "services-professionnels.md",
  "banque-assurance.md",
  "sante-pharma.md",
  "retail-distribution.md",
  "energie-utilities.md",
  "secteur-public.md",
];

for (const f of old) {
  const p = join(root, f);
  if (existsSync(p)) unlinkSync(p);
}

const rows: string[] = [];
for (const sector of DEAL_REVIEW_SECTORS) {
  const dir = join(root, sector.id);
  mkdirSync(dir, { recursive: true });
  for (const sub of sector.subSectors) {
    const rel = `${sector.id}/${sub.id}.md`;
    writeFileSync(join(root, rel), `${sub.agent.trim()}\n`, "utf8");
    rows.push(
      `| [${rel}](./${rel}) | ${sector.label} | ${sub.firstName} | ${sub.label} |`,
    );
  }
}

const readme = `# Agents commerciaux digitaux — par sous-secteur

Personas de coaching pour le **directeur commercial digital**.
Le diagnostic code (\`dealDiagnosis.ts\`) reste commun ; **chaque sous-secteur a son agent complet** (prénom + avatar + posture).
La famille (Tech / SaaS, Industrie…) ne sert qu’au regroupement UI.

Source runtime : \`src/opportunities/dealReviewSectors.ts\` (ces fichiers MD sont le miroir doc).

| Fichier | Famille | Prénom | Agent |
|---------|---------|--------|-------|
${rows.join("\n")}

## Usage prévu

Injecter l’agent du sous-secteur choisi en complément du prompt système générique, sans jamais inventer de faits hors \`<diagnostic>\`.
`;

writeFileSync(join(root, "README.md"), readme, "utf8");
console.log(`Wrote ${rows.length} agents`);
