import * as XLSX from "xlsx";
import { parseCsv, type CsvTable } from "./csv";
import { normalizeHeader } from "./csv";
import { collectColumnSamples } from "./catalogGaps";
import {
  headersMatchOfficialTemplate,
  type ImportEntityKind,
} from "./mappingFields";

export type ExcelImportTables = {
  accounts?: CsvTable;
  contacts?: CsvTable;
  opportunities?: CsvTable;
  sold_solutions?: CsvTable;
};

/** Feuille brute : en-têtes d’origine pour le mapping UI. */
export type RawImportSheet = {
  kind: ImportEntityKind;
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  /** Jusqu’à 3 valeurs d’exemple distinctes par colonne. */
  sampleValues: Record<string, string[]>;
  /** @deprecated préférer sampleValues */
  samples: Record<string, string>;
};

export type ExcelTemplateRefs = {
  personae: string[];
  /** @deprecated alias import — utiliser personae */
  directions?: string[];
  sectors: string[];
  solutions: string[];
  modules: string[];
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
  soldSolutions: (string | number)[][];
  refs?: ExcelTemplateRefs;
};

const SHEET_ACCOUNTS = ["entreprises", "comptes", "accounts", "groupes"];
const SHEET_CONTACTS = ["contacts"];
const SHEET_SOLD = [
  "solutions_vendues",
  "sold_solutions",
  "sold",
  "ca_installe",
  "ventes",
];

function sheetKind(name: string): ImportEntityKind | null {
  const n = normalizeHeader(name);
  if (SHEET_ACCOUNTS.includes(n)) return "accounts";
  if (SHEET_CONTACTS.includes(n)) return "contacts";
  if (n.includes("opportun") || n === "deals") return "opportunities";
  if (SHEET_SOLD.includes(n) || n.includes("vendu") || n.includes("installe"))
    return "sold_solutions";
  return null;
}

function sheetToRawTable(
  sheet: XLSX.WorkSheet,
  kind: ImportEntityKind,
  sheetName: string,
): RawImportSheet {
  const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  ) as unknown as (string | number | boolean | null)[][];

  if (!raw.length) {
    return {
      kind,
      sheetName,
      headers: [],
      rows: [],
      sampleValues: {},
      samples: {},
    };
  }

  const headerCells = (raw[0] ?? []).map((c, idx) => {
    const t = String(c ?? "").trim();
    return t || `Colonne ${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const line = raw[i] ?? [];
    const cells = headerCells.map((_, idx) => String(line[idx] ?? "").trim());
    if (cells.every((c) => !c)) continue;
    const row: Record<string, string> = {};
    headerCells.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }

  const sampleValues = collectColumnSamples(headerCells, rows, 3);
  const samples: Record<string, string> = {};
  for (const h of headerCells) {
    samples[h] = sampleValues[h]?.[0] ?? "";
  }

  return {
    kind,
    sheetName,
    headers: headerCells,
    rows,
    sampleValues,
    samples,
  };
}

export type ImportWorkbookParseResult = {
  sheets: RawImportSheet[];
  ignoredSheetNames: string[];
  isOfficialTemplate: boolean;
};

function isOfficialTemplateSheets(sheets: RawImportSheet[]): boolean {
  const withData = sheets.filter((s) => s.rows.length > 0);
  if (withData.length === 0) return false;
  return withData.every((s) => headersMatchOfficialTemplate(s.headers, s.kind));
}

/** Lit un fichier Excel en conservant les en-têtes d’origine. */
export async function parseImportWorkbookWithMeta(
  file: File,
): Promise<ImportWorkbookParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const sheets = await parseCsvAsSingleSheet(file);
    return {
      sheets,
      ignoredSheetNames: [],
      isOfficialTemplate: isOfficialTemplateSheets(sheets),
    };
  }

  const buffer = await file.arrayBuffer();
  const { sheets, ignoredSheetNames } = parseExcelWorkbookBuffer(buffer);
  return {
    sheets,
    ignoredSheetNames,
    isOfficialTemplate: isOfficialTemplateSheets(sheets),
  };
}

/** Onglet sans lignes de données — ignoré pour la validation et l’import. */
export function isEmptyImportSheet(sheet: RawImportSheet): boolean {
  return sheet.rows.length === 0;
}

export async function parseImportWorkbookRaw(
  file: File,
): Promise<RawImportSheet[]> {
  const parsed = await parseImportWorkbookWithMeta(file);
  return parsed.sheets;
}

async function parseCsvAsSingleSheet(file: File): Promise<RawImportSheet[]> {
  const text = await file.text();
  const table = parseCsv(text);
  const kind: ImportEntityKind =
    table.headers.includes("billed_amount") ||
    (table.headers.includes("modules") &&
      table.headers.includes("solution") &&
      !table.headers.includes("phase"))
      ? "sold_solutions"
      : table.headers.includes("phase") ||
          table.headers.includes("amount") ||
          table.headers.includes("kind")
        ? "opportunities"
        : table.headers.includes("title") ||
            table.headers.includes("direction")
          ? "contacts"
          : "accounts";
  const sampleValues = collectColumnSamples(table.headers, table.rows, 3);
  const samples: Record<string, string> = {};
  for (const h of table.headers) {
    samples[h] = sampleValues[h]?.[0] ?? "";
  }
  return [
    {
      kind,
      sheetName: file.name,
      headers: table.headers,
      rows: table.rows,
      sampleValues,
      samples,
    },
  ];
}

function parseExcelWorkbookBuffer(buffer: ArrayBuffer): {
  sheets: RawImportSheet[];
  ignoredSheetNames: string[];
} {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets: RawImportSheet[] = [];
  const ignoredSheetNames: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const kind = sheetKind(sheetName);
    if (!kind) {
      ignoredSheetNames.push(sheetName);
      continue;
    }
    const table = sheetToRawTable(wb.Sheets[sheetName], kind, sheetName);
    if (table.rows.length === 0 && table.headers.length === 0) continue;
    sheets.push(table);
  }

  if (sheets.length === 0 && wb.SheetNames[0]) {
    sheets.push(
      sheetToRawTable(wb.Sheets[wb.SheetNames[0]], "accounts", wb.SheetNames[0]),
    );
  }

  return { sheets, ignoredSheetNames };
}

/** @deprecated préférer parseImportWorkbookRaw + mapping. */
export async function parseImportWorkbook(
  file: File,
): Promise<ExcelImportTables> {
  const sheets = await parseImportWorkbookRaw(file);
  const out: ExcelImportTables = {};
  for (const s of sheets) {
    out[s.kind] = { headers: s.headers, rows: s.rows };
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
    ["1. Remplir les onglets Entreprises, Contacts, Opportunites, Solutions_vendues."],
    ["2. Ne pas renommer les onglets ni la ligne d’en-têtes."],
    ["3. Relier les lignes avec la colonne Cle (ou le Nom d’entreprise)."],
    ["4. Enregistrer en .xlsx puis importer dans Settings → Import."],
    ["5. Dans l’UI, vérifier / ajuster le mapping colonnes (proposition IA possible)."],
    [""],
    ["Correspondances de clés"],
    ["Entreprises.Cle → Contacts.Compte, Opportunites.Compte, Solutions_vendues.Compte"],
    ["Entreprises.Cle_groupe → Cle d’un groupe (Type = Holding ou Groupe)"],
    ["Entreprises.Owner_email → e-mail d’un user DBR déjà invité (sinon rattachement manuel)"],
    ["Solutions_vendues.Modules → libellés du catalogue, séparés par ;"],
    ["Solutions_vendues.Personae → libellés, séparés par ; (vide = niveau entreprise)"],
    [""],
    ["Owner (gestionnaire)"],
    ["Colonne Owner_email = e-mail exact du commercial dans Settings → Équipe."],
    ["Le user doit exister avant l’import. Sinon : warning + choix manuel sur la fiche."],
    [""],
    ["Type (Entreprises)"],
    ["Holding ou Groupe | Entreprise"],
    [""],
    ["Statut"],
    ["Client | Prospect | Concurrent | Partner / Partenaire"],
    [""],
    ["Phase"],
    [
      "Whitespace | Discovery | Qualification | Proposal | Negotiation | Closed Won | Closed Lost",
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
  for (const v of refs.personae ?? refs.directions ?? []) refRows.push(["Persona", v]);
  for (const v of refs.sectors) refRows.push(["Secteur", v]);
  for (const v of refs.solutions) refRows.push(["Solution", v]);
  for (const v of refs.modules) refRows.push(["Module", v]);
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
  "Owner_email",
];
const CONTACT_HEADERS_FR = ["Cle", "Nom", "Titre", "Compte", "Persona"];
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
const SOLD_HEADERS_FR = [
  "Cle",
  "Compte",
  "Solution",
  "Modules",
  "Personae",
  "CA_facture",
];

/** Template Excel multi-onglets prêt à remplir (exemples inclus). */
export function downloadExcelTemplate(refs?: ExcelTemplateRefs) {
  const wb = XLSX.utils.book_new();
  appendGuide(wb);

  appendDataSheet(wb, "Entreprises", ACCOUNT_HEADERS_FR, [
    ["G1", "Groupe Exemple", "Holding", "Client", "", "", "", "admin@exemple.com"],
    [
      "E1",
      "Exemple France",
      "Entreprise",
      "Prospect",
      "G1",
      "",
      "1001-2500",
      "commercial@exemple.com",
    ],
    [
      "E2",
      "Exemple Belgique",
      "Entreprise",
      "Client",
      "G1",
      "",
      "2501-5000",
      "commercial@exemple.com",
    ],
  ]);

  appendDataSheet(wb, "Contacts", CONTACT_HEADERS_FR, [
    ["C1", "Alice Martin", "CEO", "E1", refs?.personae?.[0] ?? refs?.directions?.[0] ?? ""],
    ["C2", "Bruno Leroy", "CFO", "E1", refs?.personae?.[0] ?? refs?.directions?.[0] ?? ""],
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
      "Proposal",
      "up",
      refs?.solutions[0] ?? "",
    ],
  ]);

  const sampleModules = (refs?.modules ?? [])
    .filter((m) => m.includes(" > "))
    .slice(0, 2)
    .map((m) => m.split(" > ").slice(1).join(" > "))
    .join("; ");

  appendDataSheet(wb, "Solutions_vendues", SOLD_HEADERS_FR, [
    [
      "S1",
      "E2",
      refs?.solutions[0] ?? "",
      sampleModules,
      "",
      120000,
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
  appendDataSheet(
    wb,
    "Solutions_vendues",
    SOLD_HEADERS_FR,
    data.soldSolutions,
  );
  appendReferentiel(wb, data.refs);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(filename, out);
}

export {
  ACCOUNT_HEADERS_FR,
  CONTACT_HEADERS_FR,
  OPP_HEADERS_FR,
  SOLD_HEADERS_FR,
};
