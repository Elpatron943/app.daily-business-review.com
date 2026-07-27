import * as XLSX from "xlsx";
import { parseCsv, type CsvTable } from "./csv";
import { normalizeHeader, canonicalizeHeaders } from "./csv";

export type ExcelImportTables = {
  accounts?: CsvTable;
  contacts?: CsvTable;
  opportunities?: CsvTable;
};

export type ExcelTemplateRefs = {
  directions: string[];
  sectors: string[];
  solutions: string[];
  sizes: string[];
  statuses: string[];
  types: string[];
  phases: string[];
  kinds: string[];
};

export type ExcelExportData = {
  accounts: (string | number)[][];
  contacts: (string | number)[][];
  opportunities: (string | number)[][];
  refs?: ExcelTemplateRefs;
};

const SHEET_ACCOUNTS = ["entreprises", "comptes", "accounts", "groupes"];
const SHEET_CONTACTS = ["contacts"];

function sheetKind(name: string): keyof ExcelImportTables | null {
  const n = normalizeHeader(name);
  if (SHEET_ACCOUNTS.includes(n)) return "accounts";
  if (SHEET_CONTACTS.includes(n)) return "contacts";
  if (n.includes("opportun") || n === "deals") return "opportunities";
  return null;
}

function sheetToTable(sheet: XLSX.WorkSheet): CsvTable {
  const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  ) as unknown as (string | number | boolean | null)[][];

  if (!raw.length) return { headers: [], rows: [] };

  const headerCells = (raw[0] ?? []).map((c) => String(c ?? "").trim());
  const headers = canonicalizeHeaders(headerCells);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < raw.length; i++) {
    const line = raw[i] ?? [];
    const cells = headerCells.map((_, idx) => String(line[idx] ?? "").trim());
    if (cells.every((c) => !c)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

/** Lit un fichier Excel (.xlsx) ou CSV. */
export async function parseImportWorkbook(
  file: File,
): Promise<ExcelImportTables> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await file.text();
    const table = parseCsv(text);
    const cols = new Set(table.headers);
    if (cols.has("phase") || cols.has("amount") || cols.has("kind")) {
      return { opportunities: table };
    }
    if (cols.has("title") || cols.has("direction")) {
      return { contacts: table };
    }
    return { accounts: table };
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const out: ExcelImportTables = {};

  for (const sheetName of wb.SheetNames) {
    const kind = sheetKind(sheetName);
    if (!kind) continue;
    const table = sheetToTable(wb.Sheets[sheetName]);
    if (table.rows.length === 0 && table.headers.length === 0) continue;
    out[kind] = table;
  }

  if (!out.accounts && !out.contacts && !out.opportunities && wb.SheetNames[0]) {
    out.accounts = sheetToTable(wb.Sheets[wb.SheetNames[0]]);
  }

  return out;
}

function downloadBlob(filename: string, data: ArrayBuffer) {
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function appendDataSheet(
  wb: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

function appendGuide(wb: XLSX.WorkBook) {
  const guide = XLSX.utils.aoa_to_sheet([
    ["Powermap / DBR — Template d’import"],
    [""],
    ["Comment utiliser"],
    ["1. Remplir les onglets Entreprises, Contacts et Opportunites."],
    ["2. Ne pas renommer les onglets ni la ligne d’en-têtes."],
    ["3. Relier les lignes avec la colonne Cle."],
    ["4. Enregistrer en .xlsx puis importer dans Settings → Import."],
    [""],
    ["Correspondances de clés"],
    ["Entreprises.Cle → Contacts.Compte et Opportunites.Compte"],
    ["Entreprises.Cle_groupe → Cle d’un groupe (Type = Holding ou Groupe)"],
    [""],
    ["Type (Entreprises)"],
    ["Holding ou Groupe | Entreprise"],
    [""],
    ["Statut"],
    ["Client | Prospect | Partner / Partenaire | Other / Autre"],
    [""],
    ["Phase"],
    [
      "Whitespace | Discovery | Solution Validation | Negotiation | Closed Won | Closed Lost",
    ],
    [""],
    ["Nature"],
    ["prospect | up / Upsell | cross / Cross-sell | renewal / Renouvellement | new_in_group"],
    [""],
    ["Dates"],
    ["Format recommandé : AAAA-MM-JJ (ex. 2026-12-31)"],
  ]);
  guide["!cols"] = [{ wch: 92 }];
  XLSX.utils.book_append_sheet(wb, guide, "Guide");
}

function appendReferentiel(wb: XLSX.WorkBook, refs?: ExcelTemplateRefs) {
  if (!refs) return;
  const refRows: (string | number)[][] = [["Liste", "Valeur"]];
  for (const v of refs.types) refRows.push(["Type", v]);
  for (const v of refs.statuses) refRows.push(["Statut", v]);
  for (const v of refs.sizes) refRows.push(["Taille", v]);
  for (const v of refs.phases) refRows.push(["Phase", v]);
  for (const v of refs.kinds) refRows.push(["Nature", v]);
  for (const v of refs.directions) refRows.push(["Direction", v]);
  for (const v of refs.sectors) refRows.push(["Secteur", v]);
  for (const v of refs.solutions) refRows.push(["Solution", v]);
  const sheet = XLSX.utils.aoa_to_sheet(refRows);
  sheet["!cols"] = [{ wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, sheet, "Referentiel");
}

const ACCOUNT_HEADERS_FR = [
  "Cle",
  "Nom",
  "Type",
  "Statut",
  "Cle_groupe",
  "Secteur",
  "Taille",
];
const CONTACT_HEADERS_FR = ["Cle", "Nom", "Titre", "Compte", "Direction"];
const OPP_HEADERS_FR = [
  "Cle",
  "Nom",
  "Compte",
  "Montant",
  "Date_cloture",
  "Phase",
  "Nature",
  "Solution",
];

/** Template Excel multi-onglets prêt à remplir (exemples inclus). */
export function downloadExcelTemplate(refs?: ExcelTemplateRefs) {
  const wb = XLSX.utils.book_new();
  appendGuide(wb);

  appendDataSheet(wb, "Entreprises", ACCOUNT_HEADERS_FR, [
    ["G1", "Groupe Exemple", "Holding", "Client", "", "", ""],
    ["E1", "Exemple France", "Entreprise", "Prospect", "G1", "", "1001-2500"],
    ["E2", "Exemple Belgique", "Entreprise", "Client", "G1", "", "2501-5000"],
  ]);

  appendDataSheet(wb, "Contacts", CONTACT_HEADERS_FR, [
    ["C1", "Alice Martin", "CEO", "E1", refs?.directions[0] ?? ""],
    ["C2", "Bruno Leroy", "CFO", "E1", refs?.directions[0] ?? ""],
    ["C3", "Chloé Dubois", "IT Director", "E2", ""],
  ]);

  appendDataSheet(wb, "Opportunites", OPP_HEADERS_FR, [
    [
      "O1",
      "Deal Cloud 2026",
      "E1",
      150000,
      "2026-12-31",
      "Discovery",
      "prospect",
      refs?.solutions[0] ?? "",
    ],
    [
      "O2",
      "Upsell licence",
      "E2",
      45000,
      "2026-09-30",
      "Solution Validation",
      "up",
      refs?.solutions[0] ?? "",
    ],
  ]);

  appendReferentiel(wb, refs);

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob("powermap_import_template.xlsx", out);
}

/** Export des données actuelles au même format que le template. */
export function downloadExcelExport(
  data: ExcelExportData,
  filename = "powermap_export.xlsx",
) {
  const wb = XLSX.utils.book_new();
  appendGuide(wb);
  appendDataSheet(wb, "Entreprises", ACCOUNT_HEADERS_FR, data.accounts);
  appendDataSheet(wb, "Contacts", CONTACT_HEADERS_FR, data.contacts);
  appendDataSheet(wb, "Opportunites", OPP_HEADERS_FR, data.opportunities);
  appendReferentiel(wb, data.refs);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(filename, out);
}

export { ACCOUNT_HEADERS_FR, CONTACT_HEADERS_FR, OPP_HEADERS_FR };
