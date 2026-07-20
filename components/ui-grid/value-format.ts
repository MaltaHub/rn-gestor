// Timestamp ISO 8601 (ex.: timestamptz do Postgres: "2026-05-28T19:05:21.433+00:00").
// Exige a estrutura completa data+hora; NAO basta conter a letra "T".
export const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// So e datetime se casar a estrutura ISO completa E for uma data valida. Usar
// isto (e nunca "value.includes('T') + Date.parse") antes de construir Date():
// Date.parse e lenient e "CRETA 1.6T" / "AGILE LTZ" viram Invalid Date, o que
// faz new Date(...).toISOString() estourar RangeError.
export function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && ISO_DATETIME.test(value) && !Number.isNaN(Date.parse(value));
}

export function toDisplay(value: unknown, column: string) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Nao";

  if (typeof value === "number") {
    if (column.includes("preco") || column.includes("valor")) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    }

    return new Intl.NumberFormat("pt-BR").format(value);
  }

  if (typeof value === "string") {
    // O check antigo (Date.parse(value) && value.includes("T")) disparava em
    // qualquer texto com "T" (ex.: "CRETA 1.6"), e Date.parse e lenient o
    // bastante pra inventar uma data -> virava "06/01/2001". Agora so formata
    // strings que realmente sao timestamp ISO.
    if (isIsoDateTime(value)) {
      return new Date(Date.parse(value)).toLocaleString("pt-BR");
    }

    return value;
  }

  return JSON.stringify(value);
}

export function toEditable(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function comparePrintableValues(left: unknown, right: unknown, column: string) {
  const leftText = toDisplay(left, column).trim();
  const rightText = toDisplay(right, column).trim();

  if (!leftText && !rightText) return 0;
  if (!leftText) return 1;
  if (!rightText) return -1;

  return leftText.localeCompare(rightText, "pt-BR", {
    numeric: true,
    sensitivity: "base"
  });
}

export function normalizeBulkToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
