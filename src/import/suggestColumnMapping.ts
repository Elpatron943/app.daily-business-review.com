import type { ImportEntityKind } from "./mappingFields";
import { DBR_IMPORT_FIELDS } from "./mappingFields";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Réponse IA non JSON");
  }
}

/**
 * Propose un mapping en-têtes fichier → champs DBR via OpenAI.
 * Retourne Record<sourceHeader, fieldId | "">.
 */
export async function suggestImportColumnMapping(input: {
  kind: ImportEntityKind;
  headers: string[];
  samples: Record<string, string>;
}): Promise<Record<string, string>> {
  const fields = DBR_IMPORT_FIELDS[input.kind];
  const system = [
    "Tu aides à mapper des colonnes Excel vers le CRM DBR.",
    "Réponds UNIQUEMENT avec un objet JSON plat : clé = en-tête exact du fichier, valeur = id du champ DBR ou chaîne vide si ignorer.",
    "N’invente pas d’ids hors catalogue. Une colonne source max par champ cible.",
  ].join(" ");

  const user = JSON.stringify(
    {
      entity: input.kind,
      dbr_fields: fields.map((f) => ({
        id: f.id,
        label: f.label,
        required: Boolean(f.required),
      })),
      file_headers: input.headers,
      sample_row: input.samples,
    },
    null,
    2,
  );

  const res = await fetch("/api/openai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    content?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 404
          ? "Suggestion IA indisponible (proxy OpenAI non démarré)."
          : `Suggestion IA indisponible (${res.status})`),
    );
  }

  if (!data.content?.trim()) {
    throw new Error("Réponse IA vide");
  }

  const parsed = extractJsonObject(data.content) as Record<string, unknown>;
  const allowed = new Set(fields.map((f) => f.id));
  const used = new Set<string>();
  const mapping: Record<string, string> = {};

  for (const header of input.headers) {
    const raw = parsed[header];
    const field = typeof raw === "string" ? raw.trim() : "";
    if (field && allowed.has(field) && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    } else {
      mapping[header] = "";
    }
  }

  return mapping;
}
