/**
 * Parser CSV simples e robusto o suficiente para colagem manual:
 * - detecta delimitador (',' ';' ou TAB) pela 1a linha;
 * - respeita campos entre aspas duplas ("..."), com "" como aspa escapada;
 * - aceita quebras de linha dentro de campos entre aspas;
 * - normaliza CRLF/CR -> LF.
 */
export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  delimiter: "," | ";" | "\t";
};

function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  let best: "," | ";" | "\t" = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

export function parseCsv(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const firstLineEnd = normalized.indexOf("\n");
  const headerLine = firstLineEnd === -1 ? normalized : normalized.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(headerLine);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Ultimo campo/linha (se o texto nao terminar em \n).
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  // Remove linhas totalmente vazias.
  const nonEmpty = records.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const headers = nonEmpty[0].map((header) => header.trim());
  const rows = nonEmpty.slice(1);
  return { headers, rows, delimiter };
}

/** Normaliza um nome de coluna/header para auto-mapeamento tolerante. */
export function normalizeHeaderKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
