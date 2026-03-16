import type { SheetKey } from "@/components/ui-grid/types";
import { normalizeBulkToken, toEditable } from "@/components/ui-grid/value-format";

export type BulkSeparator = ";" | "," | "|" | "\t";
export type FormFieldKind = "text" | "relation" | "lookup" | "boolean" | "number" | "datetime";
export type FormPickerOption = {
  value: string;
  label: string;
};

export type FormFieldContext = {
  activeSheetKey: SheetKey;
  relationByColumn: Record<string, unknown>;
  lookupOptionsByColumn: Record<string, FormPickerOption[]>;
  sampleValueByColumn: Record<string, unknown>;
};

export const BULK_SEPARATOR_OPTIONS: Array<{ value: BulkSeparator; label: string }> = [
  { value: ";", label: "Ponto e virgula (;)" },
  { value: ",", label: "Virgula (,)" },
  { value: "|", label: "Pipe (|)" },
  { value: "\t", label: "Tabulacao (TAB)" }
];

export function toDatetimeLocal(value: Date) {
  const tzOffset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - tzOffset).toISOString().slice(0, 16);
}

export function csvEscape(value: string) {
  if (!value.includes(",") && !value.includes('"') && !value.includes("\n") && !value.includes("\r")) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function isCarModelTextInput(activeSheetKey: SheetKey, column: string) {
  return activeSheetKey === "carros" && column === "modelo_id";
}

export function getFormFieldKind(context: FormFieldContext, column: string): FormFieldKind {
  if (isCarModelTextInput(context.activeSheetKey, column)) return "text";
  if (context.relationByColumn[column]) return "relation";
  if ((context.lookupOptionsByColumn[column] ?? []).length > 0) return "lookup";

  const sampleValue = context.sampleValueByColumn[column];
  if (typeof sampleValue === "boolean" || column.startsWith("em_")) return "boolean";
  if (typeof sampleValue === "number" || /(^ano_|preco|valor|hodometro|qtde)/.test(column)) return "number";
  if (
    (typeof sampleValue === "string" && sampleValue.includes("T") && !Number.isNaN(Date.parse(sampleValue))) ||
    column.includes("data_")
  ) {
    return "datetime";
  }

  return "text";
}

export function buildFormValuesFromRow(params: {
  row: Record<string, unknown>;
  formEditableColumns: string[];
  modeloLabelByValue: Record<string, string>;
  fieldContext: FormFieldContext;
}) {
  const initialValues: Record<string, string> = {};

  for (const column of params.formEditableColumns) {
    const rawValue = params.row[column];
    if (rawValue == null) {
      initialValues[column] = "";
      continue;
    }

    if (isCarModelTextInput(params.fieldContext.activeSheetKey, column)) {
      initialValues[column] = params.modeloLabelByValue[String(rawValue)] ?? toEditable(rawValue);
      continue;
    }

    if (
      getFormFieldKind(params.fieldContext, column) === "datetime" &&
      typeof rawValue === "string" &&
      rawValue.includes("T")
    ) {
      initialValues[column] = toDatetimeLocal(new Date(rawValue));
      continue;
    }

    initialValues[column] = toEditable(rawValue);
  }

  return initialValues;
}

export function buildInsertFormValues(params: {
  formEditableColumns: string[];
  relationDefaults: Record<string, string>;
  relationPickerOptionsByColumn: Record<string, FormPickerOption[]>;
  lookupOptionsByColumn: Record<string, FormPickerOption[]>;
  fieldContext: FormFieldContext;
  now?: Date;
}) {
  const initialValues: Record<string, string> = {};
  const now = params.now ?? new Date();

  for (const column of params.formEditableColumns) {
    const fieldKind = getFormFieldKind(params.fieldContext, column);
    if (fieldKind === "relation") {
      initialValues[column] = params.relationDefaults[column] ?? params.relationPickerOptionsByColumn[column]?.[0]?.value ?? "";
      continue;
    }
    if (fieldKind === "lookup") {
      initialValues[column] = params.lookupOptionsByColumn[column]?.[0]?.value ?? "";
      continue;
    }
    if (fieldKind === "boolean") {
      initialValues[column] = "true";
      continue;
    }
    if (fieldKind === "datetime") {
      initialValues[column] = toDatetimeLocal(now);
      continue;
    }
    initialValues[column] = "";
  }

  return initialValues;
}

export function parseBooleanLikeValue(value: string): boolean | null {
  const normalized = normalizeBulkToken(value);
  if (!normalized) return null;
  if (["true", "1", "sim", "s", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "nao", "n", "no"].includes(normalized)) return false;
  return null;
}

export function splitBulkLine(line: string, separator: BulkSeparator): string[] {
  if (!line) return [""];
  if (separator === "\t") return line.split("\t");
  if (!line.includes('"')) return line.split(separator);

  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

export function splitBulkLineWithFallback(line: string, separator: BulkSeparator, expectedColumns: number) {
  const preferred = splitBulkLine(line, separator);
  if (expectedColumns <= 1 || preferred.length > 1) return preferred;

  let bestCandidate = preferred;

  for (const option of BULK_SEPARATOR_OPTIONS) {
    if (option.value === separator) continue;
    if (option.value === "\t" ? !line.includes("\t") : !line.includes(option.value)) continue;

    const candidate = splitBulkLine(line, option.value);
    if (candidate.length === expectedColumns) return candidate;
    if (candidate.length > bestCandidate.length) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

export function coerceEditableValue(oldValue: unknown, rawValue: string): unknown {
  if (oldValue == null) {
    if (!rawValue.trim()) return null;
    return rawValue;
  }

  if (typeof oldValue === "number") {
    if (!rawValue.trim()) return null;
    const parsed = Number(rawValue.replace(",", "."));
    if (Number.isNaN(parsed)) return oldValue;
    return parsed;
  }

  if (typeof oldValue === "boolean") {
    const value = rawValue.trim().toLowerCase();
    return ["true", "1", "sim", "yes", "y", "s"].includes(value);
  }

  return rawValue;
}

export function coerceFormValue(params: {
  column: string;
  rawValue: string;
  normalizedOptionValueByColumn: Record<string, Record<string, string>>;
  fieldContext: FormFieldContext;
}): unknown {
  const inputValue = params.rawValue.trim();
  const value = params.normalizedOptionValueByColumn[params.column]?.[normalizeBulkToken(inputValue)] ?? inputValue;
  if (!value) return null;

  const fieldKind = getFormFieldKind(params.fieldContext, params.column);
  if (fieldKind === "number") {
    const parsed = Number(value.replace(",", "."));
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (fieldKind === "boolean") {
    return parseBooleanLikeValue(value) ?? false;
  }
  if (fieldKind === "datetime") {
    const parsedDate = Date.parse(value);
    if (!Number.isNaN(parsedDate)) return new Date(parsedDate).toISOString();
    return value;
  }

  return value;
}
