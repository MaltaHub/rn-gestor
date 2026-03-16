export type PrintHighlightOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "not_empty";

export type PrintHighlightRule = {
  id: string;
  column: string;
  columnLabel?: string;
  operator: PrintHighlightOperator;
  valuesInput: string;
  values?: string[];
  label: string;
  color: string;
};

export type ResolvedPrintHighlight = PrintHighlightRule & {
  values: string[];
};

export const PRINT_HIGHLIGHT_COLORS = ["#f59e0b", "#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#0891b2"];
export const DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT = 30;
export const PRINT_HIGHLIGHT_OPERATOR_OPTIONS: Array<{ value: PrintHighlightOperator; label: string }> = [
  { value: "eq", label: "Igual a" },
  { value: "neq", label: "Diferente de" },
  { value: "contains", label: "Contem" },
  { value: "not_contains", label: "Nao contem" },
  { value: "gt", label: "Maior que" },
  { value: "gte", label: "Maior ou igual" },
  { value: "lt", label: "Menor que" },
  { value: "lte", label: "Menor ou igual" },
  { value: "empty", label: "Esta vazio" },
  { value: "not_empty", label: "Esta preenchido" }
];

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeColorHex(value: string, fallback: string) {
  const normalized = value.trim();

  if (/^#[\da-f]{6}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (/^#[\da-f]{3}$/i.test(normalized)) {
    const compact = normalized.slice(1).toLowerCase();
    return `#${compact
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }

  return fallback.toLowerCase();
}

function hexColorToRgb(value: string) {
  const sanitized = sanitizeColorHex(value, "#94a3b8");
  const hex = sanitized.slice(1);

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

export function normalizePrintHighlightOpacityPercent(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT;
  }

  return Math.min(Math.max(Math.round(value), 0), 100);
}

export function mixHexColorWithWhite(value: string, strength: number) {
  const clampedStrength = Math.min(Math.max(strength, 0), 1);
  const { r, g, b } = hexColorToRgb(value);
  const mixChannel = (channel: number) => Math.round(255 - (255 - channel) * clampedStrength);

  return `#${[mixChannel(r), mixChannel(g), mixChannel(b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function createPrintHighlightRule(index: number): PrintHighlightRule {
  return {
    id: createLocalId("print-highlight"),
    column: "",
    operator: "eq",
    valuesInput: "",
    label: "",
    color: PRINT_HIGHLIGHT_COLORS[index % PRINT_HIGHLIGHT_COLORS.length]
  };
}

export function isPrintHighlightRuleEmpty(rule: PrintHighlightRule) {
  return !rule.column.trim() && !rule.valuesInput.trim() && !rule.label.trim();
}

export function normalizePrintHighlightRule(rule: PrintHighlightRule, index: number) {
  const fallbackColor = PRINT_HIGHLIGHT_COLORS[index % PRINT_HIGHLIGHT_COLORS.length];
  const values = Array.from(
    new Set(
      rule.valuesInput
        .split(/\r?\n|\|/g)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  return {
    ...rule,
    column: rule.column.trim(),
    columnLabel: rule.columnLabel?.trim(),
    operator: rule.operator,
    valuesInput: rule.valuesInput,
    values,
    label: rule.label.trim(),
    color: sanitizeColorHex(rule.color, fallbackColor)
  };
}

export function operatorNeedsValues(operator: PrintHighlightOperator) {
  return operator !== "empty" && operator !== "not_empty";
}
