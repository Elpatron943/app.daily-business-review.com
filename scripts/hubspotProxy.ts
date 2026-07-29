import type { Plugin, Connect } from "vite";
import { handleHubSpotRequest } from "./hubspot/handler";

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseQuery(url: string): Record<string, string | undefined> {
  const i = url.indexOf("?");
  if (i < 0) return {};
  const out: Record<string, string | undefined> = {};
  new URLSearchParams(url.slice(i + 1)).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function send(
  res: Connect.ServerResponse,
  result: Awaited<ReturnType<typeof handleHubSpotRequest>>,
) {
  if (result.location) {
    res.statusCode = result.statusCode;
    res.setHeader("Location", result.location);
    res.end();
    return;
  }
  res.statusCode = result.statusCode;
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, v);
    }
  }
  res.end(result.body ?? "");
}

/** Proxy local `/api/hubspot/*` (équivalent Netlify function hubspot). */
export function hubspotProxy(): Plugin {
  return {
    name: "dbr-hubspot-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const full = req.url || "";
        const pathOnly = full.split("?")[0] ?? "";
        if (!pathOnly.startsWith("/api/hubspot")) return next();

        try {
          const method = req.method || "GET";
          const rawBody =
            method === "GET" || method === "HEAD" || method === "OPTIONS"
              ? null
              : await readBody(req);

          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            headers[k] = Array.isArray(v) ? v[0] : v;
          }

          const result = await handleHubSpotRequest({
            method,
            pathname: pathOnly,
            query: parseQuery(full),
            headers,
            rawBody,
          });
          send(res, result);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Erreur HubSpot",
            }),
          );
        }
      });
    },
  };
}
