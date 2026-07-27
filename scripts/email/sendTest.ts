/**
 * Envoi d’un e-mail de test brandé (logo public/logos/logo.png).
 * Usage : npx tsx scripts/email/sendTest.ts [email]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendBrandedEmail } from "./brandedEmail";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function loadEnvLocal(): Record<string, string> {
  const file = path.join(ROOT, ".env.local");
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY manquante dans .env.local");

  const to =
    process.argv[2]?.trim() || "viraphong@daily-business-review.com";

  const { id } = await sendBrandedEmail({
    apiKey,
    fromEmail: env.RESEND_FROM_EMAIL || "no-reply@daily-business-review.com",
    fromName: env.RESEND_FROM_NAME || "Daily Business Review",
    to,
    subject: "DBR — test e-mail avec logo",
    bodyHtml: `
      <p style="margin:0 0 12px;">Bonjour,</p>
      <p style="margin:0 0 12px;">
        Ceci est un e-mail de test Resend avec le <strong>logo DBR</strong>
        intégré (fichier <code>public/logos/logo.png</code>).
      </p>
      <p style="margin:0;">— L’équipe Daily Business Review</p>
    `,
  });

  console.log(JSON.stringify({ ok: true, id, to }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
