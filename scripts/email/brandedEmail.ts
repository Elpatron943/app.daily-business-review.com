/**
 * HTML e-mails DBR avec logo inline (CID).
 * Logo source : public/logos/logo.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
/** Préférence : src/assets/logos, sinon public/logos. */
export const LOGO_PATH = (() => {
  const asset = path.join(ROOT, "src", "assets", "logos", "logo.png");
  const pub = path.join(ROOT, "public", "logos", "logo.png");
  if (fs.existsSync(asset)) return asset;
  return pub;
})();
export const LOGO_CONTENT_ID = "dbr-logo";

export function loadLogoBase64(): string {
  if (!fs.existsSync(LOGO_PATH)) {
    throw new Error(`Logo introuvable : ${LOGO_PATH}`);
  }
  return fs.readFileSync(LOGO_PATH).toString("base64");
}

export function logoAttachment() {
  return {
    filename: "logo.png",
    content: loadLogoBase64(),
    content_id: LOGO_CONTENT_ID,
    content_type: "image/png",
  };
}

/** Corps HTML brandé (logo CID + contenu). */
export function buildBrandedEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Daily Business Review</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td align="center" style="padding:28px 28px 12px;background:#ffffff;">
              <img
                src="cid:${LOGO_CONTENT_ID}"
                alt="DBR — Daily Business Review"
                width="220"
                style="display:block;width:220px;max-width:80%;height:auto;border:0;"
              />
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-size:15px;line-height:1.55;color:#1a1a2e;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #f0f0f2;font-size:12px;line-height:1.4;color:#71717a;text-align:center;">
              Daily Business Review · Turn Strategy into Revenue.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export type SendBrandedEmailInput = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  to: string | string[];
  subject: string;
  bodyHtml: string;
};

export async function sendBrandedEmail(
  input: SendBrandedEmailInput,
): Promise<{ id: string }> {
  const https = await import("node:https");
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const payload = JSON.stringify({
    from: `${input.fromName} <${input.fromEmail}>`,
    to,
    subject: input.subject,
    html: buildBrandedEmailHtml(input.bodyHtml),
    attachments: [logoAttachment()],
  });

  const data = await new Promise<{ id?: string; message?: string }>(
    (resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.resend.com",
          path: "/emails",
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            try {
              resolve(JSON.parse(text) as { id?: string; message?: string });
            } catch {
              reject(new Error(text || `HTTP ${res.statusCode}`));
            }
          });
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    },
  );

  if (!data.id) {
    throw new Error(data.message || "Échec envoi Resend");
  }
  return { id: data.id };
}
