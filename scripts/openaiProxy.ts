import type { Plugin, Connect } from "vite";
import https from "node:https";

const OPENAI_HOST = "api.openai.com";
const OPENAI_PATH = "/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";

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
  if (!(err instanceof Error)) return "Erreur proxy OpenAI";
  const anyErr = err as Error & { code?: string; cause?: { code?: string } };
  const code = anyErr.cause?.code || anyErr.code;
  return code ? `${anyErr.message} (${code})` : anyErr.message;
}

function isTlsError(err: unknown): boolean {
  const anyErr = err as {
    code?: string;
    cause?: { code?: string };
    message?: string;
  };
  const code = anyErr.cause?.code || anyErr.code || "";
  return (
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "CERT_HAS_EXPIRED" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    /certificate|SSL|TLS/i.test(anyErr.message || "")
  );
}

function callChatCompletions(
  apiKey: string,
  system: string,
  user: string,
  model: string,
  insecure: boolean,
): Promise<{ status: number; text: string }> {
  const payload = JSON.stringify({
    model,
    temperature: 0.4,
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
 * Proxy local OpenAI Chat Completions — clé uniquement côté serveur Vite (dev).
 */
export function openaiRecommendProxy(): Plugin {
  return {
    name: "openai-recommend-proxy",
    configureServer(server) {
      const apiKey = () => process.env.OPENAI_API_KEY?.trim() || "";
      const model = () =>
        process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
      const insecure =
        process.env.OPENAI_INSECURE_TLS === "1" ||
        process.env.PERPLEXITY_INSECURE_TLS === "1";

      server.middlewares.use(
        async (req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (url !== "/api/openai/status" && url !== "/api/openai/analyze") {
            next();
            return;
          }

          if (url === "/api/openai/status" && req.method === "GET") {
            sendJson(res, 200, {
              available: true,
              configured: Boolean(apiKey()),
              model: model(),
            });
            return;
          }

          if (url === "/api/openai/analyze" && req.method === "POST") {
            const key = apiKey();
            if (!key) {
              sendJson(res, 503, {
                error:
                  "OPENAI_API_KEY manquante dans .env.local — relance npm run dev",
              });
              return;
            }

            try {
              const raw = await readBody(req);
              const body = JSON.parse(raw || "{}") as {
                system?: string;
                user?: string;
              };
              if (!body.system?.trim() || !body.user?.trim()) {
                sendJson(res, 400, {
                  error: "system et user sont requis",
                });
                return;
              }

              const run = (tlsInsecure: boolean) =>
                callChatCompletions(
                  key,
                  body.system!,
                  body.user!,
                  model(),
                  tlsInsecure,
                );

              let result: { status: number; text: string };
              try {
                result = await run(insecure);
              } catch (err) {
                if (!insecure && isTlsError(err)) {
                  result = await run(true);
                } else {
                  throw err;
                }
              }

              if (result.status >= 400) {
                let message = `OpenAI HTTP ${result.status}`;
                try {
                  const parsed = JSON.parse(result.text) as {
                    error?: { message?: string };
                  };
                  if (parsed.error?.message) message = parsed.error.message;
                } catch {
                  /* keep */
                }
                sendJson(res, result.status, { error: message });
                return;
              }

              const parsed = JSON.parse(result.text) as {
                choices?: { message?: { content?: string } }[];
                model?: string;
              };
              const content =
                parsed.choices?.[0]?.message?.content?.trim() ?? "";
              if (!content) {
                sendJson(res, 502, { error: "Réponse OpenAI vide" });
                return;
              }
              sendJson(res, 200, {
                content,
                model: parsed.model || model(),
              });
            } catch (err) {
              sendJson(res, 502, { error: formatError(err) });
            }
            return;
          }

          sendJson(res, 405, { error: "Méthode non autorisée" });
        },
      );
    },
  };
}
