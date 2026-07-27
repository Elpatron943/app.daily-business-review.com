import type {
  CompellingEventDef,
  ContactTypeDef,
  OrgProfile,
  ResearchCriterionDef,
} from "../config/types";
import type { Account } from "../data";
import { accountTypeLabel } from "../data";
import type { Opportunity } from "../opportunities/OpportunityContext";

const SYSTEM_PROMPT = `Tu es un analyste sales enterprise B2B.
Tu produis un brief factuel et actionnable pour préparer un account plan.
Réponds en français.

Règles de rédaction :
- Structure en sections Markdown, une section par critère demandé (## Titre exact du critère).
- Utilise le Markdown correctement : **gras** pour les termes clés, listes à puces avec "- ", titres "## ".
- N’utilise PAS de tirets cadratin cassés ni de suites de "---" au milieu d’une phrase ; pour une conclusion courte, préfixe par "→ ".
- Pour chaque point clé, cite la source [n] quand c’est possible.
- Si une information est incertaine ou introuvable, écris clairement « Non trouvé » plutôt qu’inventer.
- N’invente JAMAIS de noms de personnes. Uniquement des personnes documentées par des sources web publiques (site corporate, communiqués, presse, LinkedIn public indexé, conférences).

Actualité (si demandée) :
- Limite-toi aux **6 derniers mois**.
- Scinde clairement ## Presse positive et ## Presse négative (sous-sections de Actualités).
- Chaque item presse : titre, date si connue, résumé, impact sales.

Compelling Events (si demandés) :
- Compare les faits trouvés au **catalogue CE fourni** (ids + libellés).
- Indique quels CE du catalogue matchent (ou « aucun match catalogue »).

Personas / décideurs (si demandés) :
- Section Markdown listant 3–8 personas pertinentes pour un deal B2B (Economic Buyer, Champion, IT, Procurement…).
- Pour chaque persona : nom, titre exact, pourquoi pertinent, source.
- Remplis aussi le tableau JSON \`suggestedPersonas\` (obligatoire si ce critère est demandé).
- \`suggestedRoleId\` doit être un id du catalogue de types fourni, sinon omets le champ.

Termine TOUJOURS par un bloc JSON strict (rien après), dans une fence \`\`\`json :
{
  "relevanceScore": 0-100,
  "matchedCompellingEventIds": ["ce-..."],
  "positivePress": [{"title":"...","summary":"...","relevance":0-100,"url":"...","date":"YYYY-MM-DD"}],
  "negativePress": [{"title":"...","summary":"...","relevance":0-100,"url":"...","date":"YYYY-MM-DD"}],
  "suggestedPersonas": [{"name":"...","title":"...","suggestedRoleId":"EconomicBuyer","suggestedRoleLabel":"Economic Buyer","directionHint":"Finance","whyRelevant":"...","sourceHint":"LinkedIn public / communiqué","confidence":0-100}]
}
relevanceScore = pertinence globale du brief pour prioriser un account plan (pas la qualité rédactionnelle).
Si le critère personas n’est pas demandé, renvoie "suggestedPersonas": [].
`;

export function sixMonthsAgoMdY(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function buildResearchPrompt(input: {
  account: Account;
  criteria: ResearchCriterionDef[];
  compellingEvents?: CompellingEventDef[];
  contactTypes?: ContactTypeDef[];
  orgProfile?: OrgProfile | null;
  opportunity?: Opportunity | null;
  holdingName?: string | null;
}): {
  system: string;
  prompt: string;
  querySummary: string;
  searchAfterDate?: string;
} {
  const {
    account,
    criteria,
    compellingEvents = [],
    contactTypes = [],
    orgProfile,
    opportunity,
    holdingName,
  } = input;
  const typeLabel = accountTypeLabel[account.type] ?? account.type;
  const wantsNews = criteria.some(
    (c) => c.id === "rc-news" || /actualit/i.test(c.label),
  );
  const wantsCe = criteria.some(
    (c) => c.id === "rc-ce" || /compelling/i.test(c.label),
  );
  const wantsPersonas = criteria.some(
    (c) =>
      c.id === "rc-buyers" ||
      /décideur|persona|buyer|stakeholder/i.test(c.label),
  );

  const criteriaBlock = criteria
    .map(
      (c, i) =>
        `${i + 1}. **${c.label}**\n   Consigne : ${c.hint || c.label}`,
    )
    .join("\n");

  const ceBlock =
    wantsCe && compellingEvents.length > 0
      ? [
          ``,
          `## Catalogue Compelling Events (référentiel admin)`,
          `Rapproche les faits de la cible à ces CE (utilise les id dans matchedCompellingEventIds) :`,
          ...compellingEvents.map(
            (ce) =>
              `- \`${ce.id}\` **${ce.label}** — ${ce.description || ce.label}`,
          ),
        ].join("\n")
      : "";

  const rolesBlock =
    wantsPersonas && contactTypes.length > 0
      ? [
          ``,
          `## Catalogue types de contact (pour suggestedRoleId)`,
          ...contactTypes
            .filter((t) => t.active !== false)
            .map((t) => `- \`${t.id}\` — ${t.label}`),
        ].join("\n")
      : "";

  const vendorBlock = orgProfile
    ? `Vendeur : ${orgProfile.name}\n${orgProfile.description || ""}`.trim()
    : "";

  const oppBlock = opportunity
    ? `Opportunité liée : ${opportunity.name} (${opportunity.kind}, ${opportunity.phase}, montant ${opportunity.amount} €, close ${opportunity.closeDate || "—"})`
    : "";

  const prompt = [
    `Recherche web sur la cible commerciale suivante.`,
    wantsNews
      ? `Priorise les sources des **6 derniers mois** (après ${sixMonthsAgoMdY()}).`
      : null,
    wantsPersonas
      ? `Identifie des **personas / décideurs** documentés publiquement (pas d’invention de noms).`
      : null,
    ``,
    `## Cible`,
    `- Nom : ${account.name}`,
    `- Type : ${typeLabel}`,
    holdingName ? `- Groupe : ${holdingName}` : null,
    account.sector ? `- Secteur : ${account.sector}` : null,
    account.size ? `- Taille : ${account.size}` : null,
    `- Statut commercial (côté vendeur) : ${account.commercialStatus}`,
    oppBlock || null,
    vendorBlock ? `\n## Contexte vendeur\n${vendorBlock}` : null,
    ``,
    `## Critères à remonter`,
    criteriaBlock,
    ceBlock || null,
    rolesBlock || null,
    ``,
    `Produis le brief Markdown puis le bloc JSON final selon les consignes système.`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const querySummary = [
    account.name,
    typeLabel,
    criteria.map((c) => c.label).join(", "),
    wantsNews ? "fenêtre 6 mois" : null,
    wantsPersonas ? "personas" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    system: SYSTEM_PROMPT,
    prompt,
    querySummary,
    searchAfterDate: wantsNews ? sixMonthsAgoMdY() : undefined,
  };
}
