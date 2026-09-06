import type { Plugin, Connect } from "vite";
import {
  assertProvisionApiKey,
  selfServeProvision,
  type SelfServePlan,
} from "./selfServeProvisionCore";

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: Connect.ServerResponse,
  status: number,
  body: unknown,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

/** Proxy local POST /accounts/provision (site marketing → app DBR). */
export function accountsProvisionProxy(): Plugin {
  return {
    name: "dbr-accounts-provision-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/accounts/provision") return next();

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type",
          );
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.end();
          return;
        }

        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const expectedKey = process.env.DBR_PROVISION_API_KEY || "";
        const auth = req.headers.authorization || "";
        if (!assertProvisionApiKey(auth, expectedKey)) {
          sendJson(res, 401, { error: "Non autorisé." });
          return;
        }

        const supabaseUrl =
          process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
        const serviceKey =
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_KEY ||
          "";
        if (!supabaseUrl || !serviceKey) {
          sendJson(res, 500, { error: "Supabase non configuré." });
          return;
        }

        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}") as Record<string, unknown>;
          const planRaw = String(body.plan || "");
          const plan: SelfServePlan | null =
            planRaw === "freemium" || planRaw === "sales" ? planRaw : null;
          if (!plan) {
            sendJson(res, 400, {
              error: "plan invalide (freemium|sales).",
            });
            return;
          }

          const appLoginUrl =
            process.env.VITE_APP_URL || "http://localhost:5173";

          const result = await selfServeProvision({
            url: supabaseUrl,
            serviceKey,
            appLoginUrl,
            body: {
              email: String(body.email || ""),
              name: String(body.name || ""),
              phone: typeof body.phone === "string" ? body.phone : undefined,
              company:
                typeof body.company === "string" ? body.company : undefined,
              plan,
              password:
                typeof body.password === "string" ? body.password : undefined,
              trialDays:
                typeof body.trialDays === "number"
                  ? body.trialDays
                  : undefined,
              maxOpportunities:
                typeof body.maxOpportunities === "number"
                  ? body.maxOpportunities
                  : undefined,
              locale:
                typeof body.locale === "string" ? body.locale : undefined,
              stripeCustomerId:
                typeof body.stripeCustomerId === "string"
                  ? body.stripeCustomerId
                  : undefined,
              stripeSubscriptionId:
                typeof body.stripeSubscriptionId === "string"
                  ? body.stripeSubscriptionId
                  : undefined,
            },
          });

          if (!result.ok) {
            sendJson(res, result.status, { error: result.error });
            return;
          }

          sendJson(res, 200, {
            ok: true,
            loginUrl: result.loginUrl,
            orgId: result.orgId,
            userId: result.userId,
          });
        } catch (err) {
          sendJson(res, 500, {
            error:
              err instanceof Error ? err.message : "Erreur provisionnement",
          });
        }
      });
    },
  };
}
