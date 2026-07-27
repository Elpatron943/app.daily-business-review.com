/** Parse CSV simple (virgule ou point-virgule, guillemets). */

export type CsvTable = {
  headers: string[];
  rows: Record<string, string>[];
};

function detectDelimiter(headerLine: string): "," | ";" {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function parseLine(line: string, delimiter: "," | ";"): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Alias → clé canonique. */
const HEADER_ALIASES: Record<string, string> = {
  external_key: "external_key",
  cle: "external_key",
  cle_externe: "external_key",
  key: "external_key",
  id_externe: "external_key",
  id: "id",
  name: "name",
  nom: "name",
  type: "type",
  status: "status",
  statut: "status",
  commercial_status: "status",
  holding_key: "holding_key",
  groupe_key: "holding_key",
  cle_groupe: "holding_key",
  holding: "holding_key",
  groupe: "holding_key",
  sector: "sector",
  secteur: "sector",
  size: "size",
  taille: "size",
  effectif: "size",
  title: "title",
  titre: "title",
  fonction: "title",
  account_key: "account_key",
  entreprise_key: "account_key",
  compte_key: "account_key",
  account: "account_key",
  entreprise: "account_key",
  compte: "account_key",
  direction: "direction",
  amount: "amount",
  montant: "amount",
  close_date: "close_date",
  date_close: "close_date",
  date_cloture: "close_date",
  phase: "phase",
  etape: "phase",
  kind: "kind",
  type_deal: "kind",
  nature: "kind",
  solution: "solution",
  solution_id: "solution",
  solution_code: "solution",
};

export function canonicalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => {
    const n = normalizeHeader(h);
    return HEADER_ALIASES[n] ?? n;
  });
}

export function parseCsv(text: string): CsvTable {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseLine(lines[0], delimiter);
  const headers = canonicalizeHeaders(rawHeaders);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i], delimiter);
    if (cells.every((c) => !c)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join(
    "\n",
  );
}
