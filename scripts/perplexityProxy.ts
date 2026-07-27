import type { Plugin, Connect } from "vite";
import https from "node:https";

type SonarCitation = {
  url?: string;
  title?: string;
};

const SONAR_HOST = "api.perplexity.ai";
const SONAR_PATH = "/v1/sonar";

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

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return "Erreur proxy Perplexity";
  const anyErr = err as Error & { code?: string; cause?: { code?: string } };
  const code = anyErr.cause?.code || anyErr.code;
  return code ? `${anyErr.message} (${code})` : anyErr.message;
}

function isTlsError(err: unknown): boolean {
  const anyErr = err as { code?: string; cause?: { code?: string }; message?: string };
  const code = anyErr.cause?.code || anyErr.code || "";
  return (
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "CERT_HAS_EXPIRED" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    /certificate|SSL|TLS/i.test(anyErr.message || "")
  );
}

function callSonar(
  apiKey: string,
  messages: { role: string; content: string }[],
  insecure: boolean,
  options?: { searchAfterDate?: string },
): Promise<{ status: number; text: string }> {
  const body: Record<string, unknown> = {
    model: "sonar-pro",
    messages,
  };
  if (options?.searchAfterDate) {
    body.search_after_date_filter = options.searchAfterDate;
  }
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: SONAR_HOST,
        path: SONAR_PATH,
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
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 502,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Proxy local Perplexity Sonar — clé uniquement côté serveur Vite (dev).
 */
export function perplexityResearchProxy(): Plugin {
  return {
    name: "perplexity-research-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const url = req.url?.split("?")[0] ?? "";
          if (!url.startsWith("/api/research")) {
            next();
            return;
          }

          const apiKey = process.env.PERPLEXITY_API_KEY?.trim() ?? "";
          const forceInsecure =
            process.env.PERPLEXITY_INSECURE_TLS === "1" ||
            process.env.PERPLEXITY_INSECURE_TLS === "true";

          if (req.method === "GET" && url === "/api/research/status") {
            sendJson(res, 200, {
              configured: Boolean(apiKey),
              model: "sonar-pro",
            });
            return;
          }

          if (req.method === "POST" && url === "/api/research") {
            if (!apiKey) {
              sendJson(res, 503, {
                error:
                  "PERPLEXITY_API_KEY manquante. Ajoute-la dans .env.local puis relance npm run dev.",
              });
              return;
            }

            try {
              const raw = await readBody(req);
              const body = JSON.parse(raw || "{}") as {
                prompt?: string;
                system?: string;
                searchAfterDate?: string;
              };
              const prompt = body.prompt?.trim() ?? "";
              if (!prompt) {
                sendJson(res, 400, { error: "prompt requis" });
                return;
              }

              const messages: { role: string; content: string }[] = [];
              if (body.system?.trim()) {
                messages.push({
                  role: "system",
                  content: body.system.trim(),
                });
              }
              messages.push({ role: "user", content: prompt });

              const sonarOpts = body.searchAfterDate?.trim()
                ? { searchAfterDate: body.searchAfterDate.trim() }
                : undefined;

              let upstream: { status: number; text: string };
              try {
                upstream = await callSonar(
                  apiKey,
                  messages,
                  forceInsecure,
                  sonarOpts,
                );
              } catch (err) {
                if (!forceInsecure && isTlsError(err)) {
                  server.config.logger.warn(
                    "[perplexity] TLS intercepté — nouvel essai sans vérification certificat (dev local).",
                  );
                  upstream = await callSonar(
                    apiKey,
                    messages,
                    true,
                    sonarOpts,
                  );
                } else {
                  throw err;
                }
              }

              let data: {
                error?: { message?: string } | string;
                detail?: unknown;
                choices?: { message?: { content?: string } }[];
                citations?: (string | SonarCitation)[];
                search_results?: SonarCitation[];
              };
              try {
                data = JSON.parse(upstream.text) as typeof data;
              } catch {
                sendJson(res, 502, {
                  error: `Réponse Perplexity non JSON (HTTP ${upstream.status})`,
                });
                return;
              }

              if (upstream.status < 200 || upstream.status >= 300) {
                const msg =
                  typeof data.error === "string"
                    ? data.error
                    : data.error?.message ||
                      (data.detail
                        ? JSON.stringify(data.detail).slice(0, 400)
                        : `Perplexity HTTP ${upstream.status}`);
                sendJson(res, upstream.status, { error: msg });
                return;
              }

              const content =
                data.choices?.[0]?.message?.content?.trim() ?? "";
              const citations: { url: string; title?: string }[] = [];
              const seen = new Set<string>();

              const pushCite = (citeUrl: string, title?: string) => {
                if (!citeUrl || seen.has(citeUrl)) return;
                seen.add(citeUrl);
                citations.push(
                  title ? { url: citeUrl, title } : { url: citeUrl },
                );
              };

              for (const c of data.citations ?? []) {
                if (typeof c === "string") pushCite(c);
                else if (c?.url) pushCite(c.url, c.title);
              }
              for (const c of data.search_results ?? []) {
                if (c?.url) pushCite(c.url, c.title);
              }

              sendJson(res, 200, { content, citations });
            } catch (err) {
              server.config.logger.error(`[perplexity] ${formatError(err)}`);
              sendJson(res, 500, { error: formatError(err) });
            }
            return;
          }

          sendJson(res, 404, { error: "Not found" });
        })().catch((err) => {
          server.config.logger.error(`[perplexity] ${formatError(err)}`);
          if (!res.headersSent) {
            sendJson(res, 500, { error: formatError(err) });
          }
        });
      });
    },
  };
}
