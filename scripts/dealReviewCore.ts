import { createClient } from "@supabase/supabase-js";
import https from "node:https";
import {
  accountFromRow,
  contactFromRow,
  opportunityActionFromRow,
  opportunityFromRow,
  stakeholderFromRow,
} from "../src/sync/mappers";
import type { OppPhaseDef, ProcessDomainDef } from "../src/config/types";
import { DEFAULT_SALES_PROCESS } from "../src/opportunities/salesProcess";
import {
  computeProcessProgress,
  funnelMidPhases,
} from "../src/opportunities/salesProcess";
import {
  computeMappingScorecard,
  mappingWeightsFromSubtypes,
} from "../src/opportunities/mappingScore";
import {
  buildDealReviewDiagnostic,
  buildDealReviewSystemPrompt,
  type DealReviewDiagnostic,
} from "../src/opportunities/buildDealReviewDiagnostic";
import {
  buildDealReviewSectorAddendum,
  getDealReviewSubSector,
} from "../src/opportunities/dealReviewSectors";
import type { Opportunity } from "../src/opportunities/OpportunityContext";
import type { OppMappingSubtypeDef } from "../src/config/types";

function processDomainsFromConfig(raw: unknown): ProcessDomainDef[] {
  if (!raw || typeof raw !== "object") return DEFAULT_SALES_PROCESS;
  const domains = (raw as { processDomains?: unknown }).processDomains;
  return Array.isArray(domains) && domains.length > 0
    ? (domains as ProcessDomainDef[])
    : DEFAULT_SALES_PROCESS;
}

function phasesFromConfig(raw: unknown): OppPhaseDef[] {
  if (!raw || typeof raw !== "object") return [];
  const phases = (raw as { oppPhases?: unknown }).oppPhases;
  return Array.isArray(phases) ? (phases as OppPhaseDef[]) : [];
}

function mappingSubtypesFromConfig(raw: unknown): OppMappingSubtypeDef[] {
  if (!raw || typeof raw !== "object") return [];
  const subs = (raw as { oppMappingSubtypes?: unknown }).oppMappingSubtypes;
  return Array.isArray(subs) ? (subs as OppMappingSubtypeDef[]) : [];
}

const OPENAI_HOST = "api.openai.com";
const OPENAI_PATH = "/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";

export type DealReviewChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DealReviewRequest = {
  opportunityId: string;
  orgName?: string;
  sellerFirstName?: string;
  /** Id agent secteur (voir dealReviewSectors). */
  sectorId?: string | null;
  /** Id sous-secteur (optionnel). */
  subSectorId?: string | null;
  messages?: DealReviewChatMessage[];
  /** Uniquement si le reload serveur échoue (dev). */
  clientDiagnostic?: DealReviewDiagnostic;
};

export type DealReviewAiJson = {
  message: string;
  topic?: string;
  proposed_updates?: Array<{
    type: string;
    target: string;
    value: string;
  }>;
  done?: boolean;
};

function callOpenAi(
  apiKey: string,
  system: string,
  user: string,
  model: string,
  insecure: boolean,
): Promise<{ status: number; text: string }> {
  const payload = JSON.stringify({
    model,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: OPENAI_HOST,
        path: OPENAI_PATH,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        rejectUnauthorized: !insecure,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 500,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function parseAiJson(raw: string): DealReviewAiJson {
  try {
    const parsed = JSON.parse(raw) as DealReviewAiJson;
    if (parsed?.message?.trim()) return parsed;
  } catch {
    /* fallthrough */
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as DealReviewAiJson;
    if (parsed?.message?.trim()) return parsed;
  }
  throw new Error("Réponse IA illisible");
}

async function loadPreviousAnswers(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  opportunityId: string,
): Promise<Array<{ code: string; date: string; answer: string }>> {
  const { data, error } = await admin
    .from("deal_reviews")
    .select("created_at, findings, answers")
    .eq("organization_id", organizationId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error || !data) return [];
  const out: Array<{ code: string; date: string; answer: string }> = [];
  for (const row of data) {
    const answers = row.answers;
    if (!Array.isArray(answers)) continue;
    for (const a of answers) {
      if (!a || typeof a !== "object") continue;
      const o = a as Record<string, unknown>;
      if (typeof o.code !== "string" || typeof o.answer !== "string") continue;
      out.push({
        code: o.code,
        date: String(row.created_at ?? "").slice(0, 10),
        answer: o.answer,
      });
    }
  }
  return out.slice(0, 12);
}

async function countReviewsToday(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin
    .from("deal_reviews")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("created_by", userId)
    .gte("created_at", start.toISOString());
  if (error) return 0;
  return count ?? 0;
}

export async function runDealReview(
  env: {
    supabaseUrl: string;
    serviceRoleKey: string;
    anonKey: string;
    openaiApiKey: string;
    openaiModel?: string;
    openaiInsecureTls?: boolean;
    dailyLimit?: number;
  },
  accessToken: string,
  body: DealReviewRequest,
): Promise<
  | { ok: true; result: DealReviewAiJson & { diagnosticFindingsCount: number } }
  | { ok: false; status: number; error: string }
> {
  if (!body.opportunityId?.trim()) {
    return { ok: false, status: 400, error: "opportunityId manquant." };
  }
  if (!env.openaiApiKey) {
    return { ok: false, status: 503, error: "OPENAI_API_KEY manquante." };
  }

  const userClient = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(accessToken);
  if (userErr || !user) {
    return { ok: false, status: 401, error: "Session expirée — reconnecte-toi." };
  }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const orgId =
    typeof profile?.organization_id === "string"
      ? profile.organization_id
      : null;
  if (!orgId) {
    return { ok: false, status: 403, error: "Organisation introuvable." };
  }

  const dailyLimit = env.dailyLimit ?? 40;
  const used = await countReviewsToday(admin, orgId, user.id);
  if (used >= dailyLimit) {
    return {
      ok: false,
      status: 429,
      error: `Limite de revues atteinte (${dailyLimit}/jour).`,
    };
  }

  // Reload serveur (source de vérité) — RLS via userClient
  const { data: oppRow, error: oppErr } = await userClient
    .from("opportunities")
    .select("*")
    .eq("id", body.opportunityId)
    .maybeSingle();
  if (oppErr || !oppRow) {
    return {
      ok: false,
      status: 404,
      error: "Opportunité introuvable ou accès refusé.",
    };
  }

  const [{ data: stakeRows }, { data: actRows }, { data: contactRows }, { data: accountRows }, { data: configRow }] =
    await Promise.all([
      userClient
        .from("opportunity_stakeholders")
        .select("*")
        .eq("opportunity_id", body.opportunityId),
      userClient
        .from("opportunity_actions")
        .select("*")
        .eq("opportunity_id", body.opportunityId),
      admin.from("contacts").select("*").eq("organization_id", orgId),
      admin.from("accounts").select("*").eq("organization_id", orgId),
      admin
        .from("org_configs")
        .select("config")
        .eq("organization_id", orgId)
        .maybeSingle(),
    ]);

  const stakeholders = (stakeRows ?? [])
    .map((r) => stakeholderFromRow(r as Record<string, unknown>))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const actions = (actRows ?? []).map((r) =>
    opportunityActionFromRow(r as Record<string, unknown>),
  );
  const opportunity: Opportunity = opportunityFromRow(
    oppRow as Record<string, unknown>,
    stakeholders,
    actions,
  );

  const contacts = (contactRows ?? []).map((r) =>
    contactFromRow(r as Record<string, unknown>),
  );
  const accounts = (accountRows ?? []).map((r) =>
    accountFromRow(r as Record<string, unknown>),
  );

  const rawConfig = configRow?.config ?? null;
  const domains = processDomainsFromConfig(rawConfig);
  const mid = funnelMidPhases(phasesFromConfig(rawConfig)).map((p) => p.id);
  const phaseOrder = ["Whitespace", ...mid, "Closed Won", "Closed Lost"];
  const proc = computeProcessProgress(domains, opportunity.processAnswers);
  const weights = mappingWeightsFromSubtypes(
    mappingSubtypesFromConfig(rawConfig),
  );
  const mapping = computeMappingScorecard(opportunity.mappingChecks, weights);
  const mappingPct =
    mapping.masteryPct !== null
      ? mapping.masteryPct
      : mapping.total > 0
        ? Math.round((mapping.covered / mapping.total) * 100)
        : null;

  const previousAnswers = await loadPreviousAnswers(
    admin,
    orgId,
    body.opportunityId,
  );

  const { diagnostic, findings } = buildDealReviewDiagnostic({
    opportunity,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title,
      accountId: c.accountId,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      holdingId: a.holdingId,
    })),
    processDomains: domains,
    phaseOrder,
    processPct: proc.overallPct,
    mappingPct,
    updatedAt:
      typeof (oppRow as { updated_at?: string }).updated_at === "string"
        ? (oppRow as { updated_at: string }).updated_at
        : null,
    previousAnswers,
  });

  // Prefer server diagnostic; ignore clientDiagnostic when reload OK.
  void body.clientDiagnostic;

  const orgName = body.orgName?.trim() || "votre organisation";
  const seller =
    body.sellerFirstName?.trim() ||
    (typeof profile?.full_name === "string"
      ? profile.full_name.split(/\s+/)[0]
      : "toi");

  const agent = getDealReviewSubSector(body.sectorId, body.subSectorId);
  const system = buildDealReviewSystemPrompt({
    orgName,
    sellerFirstName: seller || "toi",
    agentFirstName: agent?.firstName ?? null,
    sectorAddendum: buildDealReviewSectorAddendum(
      body.sectorId,
      body.subSectorId,
    ),
  });
  const history = (body.messages ?? [])
    .map((m) => `${m.role === "user" ? "Commercial" : "Directeur"}: ${m.content}`)
    .join("\n");
  const userPrompt = `<diagnostic>
${JSON.stringify(diagnostic, null, 2)}
</diagnostic>

${history ? `Échanges déjà tenus :\n${history}\n` : ""}
Réponds en JSON selon le format imposé.`;

  const model = env.openaiModel?.trim() || DEFAULT_MODEL;
  const insecure = Boolean(env.openaiInsecureTls);
  const aiRes = await callOpenAi(
    env.openaiApiKey,
    system,
    userPrompt,
    model,
    insecure,
  );
  if (aiRes.status >= 400) {
    return {
      ok: false,
      status: 502,
      error: `OpenAI HTTP ${aiRes.status}`,
    };
  }
  let content = "";
  try {
    const envelope = JSON.parse(aiRes.text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    content = envelope.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return { ok: false, status: 502, error: "Réponse OpenAI illisible" };
  }
  if (!content) {
    return { ok: false, status: 502, error: "Réponse OpenAI vide" };
  }

  const parsed = parseAiJson(content);

  const userAnswers = (body.messages ?? [])
    .filter((m) => m.role === "user")
    .map((m) => ({
      code: parsed.topic || "general",
      answer: m.content,
    }));

  const { error: saveErr } = await admin.from("deal_reviews").insert({
    organization_id: orgId,
    opportunity_id: body.opportunityId,
    created_by: user.id,
    findings: findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      fact: f.fact,
      question: f.question,
    })),
    answers: userAnswers,
    decided_actions: parsed.proposed_updates ?? [],
    model,
  });
  void saveErr; /* table absente tant que la migration n’est pas appliquée */

  return {
    ok: true,
    result: {
      ...parsed,
      diagnosticFindingsCount: findings.length,
    },
  };
}
