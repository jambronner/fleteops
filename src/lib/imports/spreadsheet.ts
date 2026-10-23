import * as XLSX from "xlsx";

import { detectImportFormat, type SupportedImportFormat } from "@/lib/imports/contracts";
import { parseCsv } from "@/lib/imports/csv";

export type ParsedSpreadsheet = {
  rows: string[][];
  sourceFormat: SupportedImportFormat;
  warnings: string[];
  sheetName?: string;
  sheets?: SpreadsheetSheetSummary[];
};

export type SpreadsheetSheetSummary = {
  name: string;
  rowCount: number;
  nonEmptyRowCount: number;
  columnCount: number;
  previewRows: string[][];
};

function normalizeCell(value: unknown) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}

function normalizeRows(rows: unknown[][]) {
  return rows
    .map((row) => row.map((value) => normalizeCell(value)))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
}

function sheetRows(worksheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: "",
  });

  return normalizeRows(rows);
}

function summarizeSheet(name: string, worksheet: XLSX.WorkSheet): SpreadsheetSheetSummary {
  const rows = sheetRows(worksheet);
  const range = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
  const columnCount = range ? range.e.c - range.s.c + 1 : rows.reduce((max, row) => Math.max(max, row.length), 0);

  return {
    name,
    rowCount: rows.length,
    nonEmptyRowCount: rows.length,
    columnCount,
    previewRows: rows.slice(0, 5),
  };
}

function unsupportedFormatError(locale: string) {
  return locale === "en" ? "Unsupported spreadsheet format." : "Formato de hoja de cálculo no compatible.";
}

function emptyWorkbookError(locale: string) {
  return locale === "en" ? "The spreadsheet does not contain any sheets." : "La hoja no contiene pestañas.";
}

function sheetNotFoundError(locale: string, sheetName: string) {
  return locale === "en"
    ? `The spreadsheet does not contain a sheet named ${sheetName}.`
    : `La hoja no contiene una pestaña llamada ${sheetName}.`;
}

export function inspectSpreadsheet(args: {
  body: Uint8Array;
  fileName: string;
  locale: string;
}): {
  sourceFormat: SupportedImportFormat;
  sheets: SpreadsheetSheetSummary[];
  warnings: string[];
} {
  const sourceFormat = detectImportFormat(args.fileName);

  if (!sourceFormat) {
    throw new Error(unsupportedFormatError(args.locale));
  }

  if (sourceFormat === "csv") {
    const rows = normalizeRows(parseCsv(Buffer.from(args.body).toString("utf8")));
    return {
      sourceFormat,
      sheets: [
        {
          name: args.fileName,
          rowCount: rows.length,
          nonEmptyRowCount: rows.length,
          columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
          previewRows: rows.slice(0, 5),
        },
      ],
      warnings: [],
    };
  }

  const workbook = XLSX.read(args.body, { type: "array" });

  if (workbook.SheetNames.length === 0) {
    throw new Error(emptyWorkbookError(args.locale));
  }

  return {
    sourceFormat,
    sheets: workbook.SheetNames.map((sheetName) => summarizeSheet(sheetName, workbook.Sheets[sheetName])),
    warnings: [],
  };
}

export function parseSpreadsheet(args: {
  body: Uint8Array;
  fileName: string;
  locale: string;
  sheetName?: string;
}): ParsedSpreadsheet {
  const sourceFormat = detectImportFormat(args.fileName);
  const english = args.locale === "en";

  if (!sourceFormat) {
    throw new Error(unsupportedFormatError(args.locale));
  }

  if (sourceFormat === "csv") {
    return {
      rows: normalizeRows(parseCsv(Buffer.from(args.body).toString("utf8"))),
      sourceFormat,
      warnings: [],
    };
  }

  const workbook = XLSX.read(args.body, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error(emptyWorkbookError(args.locale));
  }

  const sheetName = args.sheetName ?? firstSheetName;
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(sheetNotFoundError(args.locale, sheetName));
  }

  return {
    rows: sheetRows(worksheet),
    sourceFormat,
    sheetName,
    sheets: workbook.SheetNames.map((name) => summarizeSheet(name, workbook.Sheets[name])),
    warnings:
      workbook.SheetNames.length > 1 && !args.sheetName
        ? [
            english
              ? `The workbook has ${workbook.SheetNames.length} sheets. Only the first sheet (${firstSheetName}) was used.`
              : `El workbook tiene ${workbook.SheetNames.length} pestañas. Solo se usó la primera (${firstSheetName}).`,
          ]
        : [],
  };
}
