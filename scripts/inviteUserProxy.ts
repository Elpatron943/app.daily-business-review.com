import type { Plugin, Connect } from "vite";
import { inviteOrganizationUser } from "./inviteUserCore";

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

/** Proxy local POST /api/invite-user (équivalent Netlify function). */
export function inviteUserProxy(): Plugin {
  return {
    name: "dbr-invite-user-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/invite-user") return next();
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const supabaseUrl =
          process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
        const serviceKey =
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_KEY ||
          "";

        if (!supabaseUrl || !serviceKey) {
          sendJson(res, 500, {
            error:
              "SUPABASE_SERVICE_ROLE_KEY manquante dans .env.local (jamais préfixer VITE_).",
          });
          return;
        }

        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) {
          sendJson(res, 401, { error: "Authorization Bearer requis." });
          return;
        }

        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}") as {
            email?: string;
            fullName?: string;
            role?: "admin" | "user";
          };
          const result = await inviteOrganizationUser(
            { supabaseUrl, serviceRoleKey: serviceKey },
            token,
            {
              email: body.email ?? "",
              fullName: body.fullName,
              role: body.role,
              redirectTo: process.env.VITE_APP_URL || "http://localhost:5173/",
            },
          );
          if (!result.ok) {
            sendJson(res, result.status, { error: result.error });
            return;
          }
          sendJson(res, 200, { ok: true, userId: result.userId });
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : "Erreur invitation",
          });
        }
      });
    },
  };
}
