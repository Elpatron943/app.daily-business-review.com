import { runDealReview } from "../../scripts/dealReviewCore";

type NetlifyEvent = {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
};

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

export async function handler(event: NetlifyEvent) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || "";

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json(500, { error: "Configuration Supabase incomplète." });
  }

  const authHeader =
    event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return json(401, { error: "Session expirée — reconnecte-toi." });
  }

  try {
    const body = JSON.parse(event.body || "{}") as Parameters<
      typeof runDealReview
    >[2];
    const result = await runDealReview(
      {
        supabaseUrl,
        serviceRoleKey: serviceKey,
        anonKey,
        openaiApiKey,
        openaiModel: process.env.OPENAI_MODEL,
        openaiInsecureTls:
          process.env.OPENAI_INSECURE_TLS === "1" ||
          process.env.OPENAI_INSECURE_TLS === "true",
        dailyLimit: Number(process.env.DEAL_REVIEW_DAILY_LIMIT || 40),
      },
      token,
      body,
    );
    if (!result.ok) {
      return json(result.status, { error: result.error });
    }
    return json(200, result.result);
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : "Erreur revue deal",
    });
  }
}
