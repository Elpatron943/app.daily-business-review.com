import { inviteOrganizationUser } from "../../scripts/inviteUserCore";

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

  if (!supabaseUrl || !serviceKey) {
    return json(500, {
      error: "SUPABASE_SERVICE_ROLE_KEY manquante sur Netlify.",
    });
  }

  const authHeader =
    event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return json(401, { error: "Authorization Bearer requis." });
  }

  try {
    const body = JSON.parse(event.body || "{}") as {
      email?: string;
      fullName?: string;
      role?: "admin" | "user";
    };
    const siteUrl =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      process.env.VITE_APP_URL ||
      "";

    const result = await inviteOrganizationUser(
      { supabaseUrl, serviceRoleKey: serviceKey },
      token,
      {
        email: body.email ?? "",
        fullName: body.fullName,
        role: body.role,
        redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, "")}/` : undefined,
      },
    );

    if (!result.ok) {
      return json(result.status, { error: result.error });
    }
    return json(200, { ok: true, userId: result.userId });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : "Erreur invitation",
    });
  }
}
