import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * HubSpot v3 webhooks : signature `X-HubSpot-Signature-v3`
 * (ou v1 legacy). Socle : vérifie v1 (SHA-256 clientSecret + body) si présent.
 */
export function verifyHubSpotSignature(input: {
  clientSecret: string;
  rawBody: string;
  signatureHeader?: string | null;
  signatureV3?: string | null;
  method?: string;
  uri?: string;
  timestamp?: string | null;
}): boolean {
  const secret = input.clientSecret;
  if (!secret) return false;

  // v1: hex(sha256(clientSecret + body))
  if (input.signatureHeader) {
    const hash = createHash("sha256")
      .update(secret + input.rawBody, "utf8")
      .digest("hex");
    try {
      const a = Buffer.from(hash, "utf8");
      const b = Buffer.from(input.signatureHeader, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // v3: base64(hmac sha256) — validation simplifiée documentée pour extension
  if (input.signatureV3 && input.method && input.uri && input.timestamp) {
    // Implémentation complète v3 à brancher avec URI publique exacte.
    // Pour le socle on accepte seulement si secret non vide + signature présente
    // après hash de contrôle minimal.
    const source = `${input.method}${input.uri}${input.rawBody}${input.timestamp}`;
    const expected = createHash("sha256")
      .update(secret + source, "utf8")
      .digest("base64");
    try {
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(input.signatureV3, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  return false;
}

export type HubSpotWebhookEvent = {
  eventId?: string | number;
  subscriptionType?: string;
  portalId?: number | string;
  objectId?: number | string;
};

/** Enregistre l’événement (idempotence) et signale un pull différé. */
export async function ingestWebhookEvents(input: {
  db: SupabaseClient;
  events: HubSpotWebhookEvent[];
}): Promise<{ accepted: number; duplicates: number }> {
  let accepted = 0;
  let duplicates = 0;

  for (const ev of input.events) {
    const eventId =
      ev.eventId != null
        ? String(ev.eventId)
        : `${ev.portalId || "p"}-${ev.subscriptionType || "t"}-${ev.objectId || "o"}-${Date.now()}`;

    const { data: org } = ev.portalId
      ? await input.db
          .from("crm_connections")
          .select("organization_id")
          .eq("provider", "hubspot")
          .eq("external_portal_id", String(ev.portalId))
          .eq("status", "connected")
          .maybeSingle()
      : { data: null };

    const { error } = await input.db.from("hubspot_webhook_events").insert({
      event_id: eventId,
      organization_id: org?.organization_id ?? null,
      portal_id: ev.portalId != null ? String(ev.portalId) : null,
      payload: ev as unknown as Record<string, unknown>,
    });

    if (error) {
      if (error.code === "23505") {
        duplicates += 1;
        continue;
      }
      throw new Error(error.message);
    }
    accepted += 1;
  }

  return { accepted, duplicates };
}
