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
    const date = Date.parse(value);
    if (!Number.isNaN(date) && value.includes("T")) {
      return new Date(date).toLocaleString("pt-BR");
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
