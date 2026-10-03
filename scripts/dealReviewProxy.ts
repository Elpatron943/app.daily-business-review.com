import type { Plugin, Connect } from "vite";

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
  res.end(JSON.stringify(body));
}

/** Proxy local — même contrat que netlify/functions/deal-review. */
export function dealReviewProxy(): Plugin {
  return {
    name: "deal-review-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/deal-review") return next();
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) {
          sendJson(res, 401, { error: "Session expirée — reconnecte-toi." });
          return;
        }

        try {
          const { runDealReview } = await import("./dealReviewCore");
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}") as Parameters<
            typeof runDealReview
          >[2];
          const result = await runDealReview(
            {
              supabaseUrl:
                process.env.VITE_SUPABASE_URL ||
                process.env.SUPABASE_URL ||
                "",
              serviceRoleKey:
                process.env.SUPABASE_SERVICE_ROLE_KEY ||
                process.env.SUPABASE_SERVICE_KEY ||
                "",
              anonKey:
                process.env.VITE_SUPABASE_ANON_KEY ||
                process.env.SUPABASE_ANON_KEY ||
                "",
              openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
              openaiModel: process.env.OPENAI_MODEL,
              openaiInsecureTls:
                process.env.OPENAI_INSECURE_TLS === "1" ||
                process.env.OPENAI_INSECURE_TLS === "true" ||
                process.env.PERPLEXITY_INSECURE_TLS === "1",
              dailyLimit: Number(process.env.DEAL_REVIEW_DAILY_LIMIT || 40),
            },
            token,
            body,
          );
          if (!result.ok) {
            sendJson(res, result.status, { error: result.error });
            return;
          }
          sendJson(res, 200, result.result);
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : "Erreur revue deal",
          });
        }
      });
    },
  };
}
