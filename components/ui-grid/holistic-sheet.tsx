"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_SHEET, SHEETS } from "@/components/ui-grid/config";
import {
  deleteSheetRow,
  fetchLookups,
  fetchSheetRows,
  lookupCarByPlate,
  runFinalize,
  runRebuild,
  upsertSheetRow
} from "@/components/ui-grid/api";
import type {
  CurrentActor,
  GridFilters,
  GridListPayload,
  LookupsPayload,
  RequestAuth,
  SheetConfig,
  SheetKey,
  SortRule
} from "@/components/ui-grid/types";
import { hasRequiredRole } from "@/lib/domain/access";

type CellAnchor = {
  rIdx: number;
  cIdx: number;
};

type EditingCell = {
  rowId: string;
  rowIndex: number;
  column: string;
  value: string;
};

type ResizeState = {
  column: string;
  startX: number;
  startWidth: number;
};

type SplitResizeState = {
  startX: number;
  startRatio: number;
};

type FilterOption = {
  literal: string;
  label: string;
  count: number;
};

type RelationRef = {
  table: SheetKey;
  keyColumn: string;
};

type BulkSeparator = ";" | "," | "|" | "\t";

type IconName =
  | "refresh"
  | "select-cycle"
  | "hide"
  | "show"
  | "add"
  | "bulk"
  | "trash"
  | "finalize"
  | "rebuild"
  | "left"
  | "right";

type HolisticSheetProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: CurrentActor["role"] | null;
  onSignOut: () => void | Promise<void>;
};

const RESIZE_MIN_PX = 20;
const RESIZE_CHAR_PX = 8;
const RESIZE_CELL_PADDING_PX = 24;
const RESIZE_HANDLE_PX = 12;
const HEADER_FILTER_BUTTON_PX = 22;
const HEADER_CONTROL_GAP_PX = 6;
const HEADER_LABEL_MIN_PX = 24;
const HEADER_RELATION_PILL_MAX_PX = 84;
const SPLIT_MIN_RATIO = 32;
const SPLIT_MAX_RATIO = 74;
const MOBILE_LAYOUT_QUERY = "(max-width: 1180px)";
const BULK_SEPARATOR_OPTIONS: Array<{ value: BulkSeparator; label: string }> = [
  { value: ";", label: "Ponto e virgula (;)" },
  { value: ",", label: "Virgula (,)" },
  { value: "|", label: "Pipe (|)" },
  { value: "\t", label: "Tabulacao (TAB)" }
];

const defaultPayload: GridListPayload = {
  table: DEFAULT_SHEET.key,
  label: DEFAULT_SHEET.label,
  header: [],
  rows: [],
  totalRows: 0,
  page: 1,
  pageSize: 25,
  sort: [],
  filters: {}
};

const RELATION_BY_SHEET_COLUMN: Partial<Record<SheetKey, Record<string, RelationRef>>> = {
  carros: {
    modelo_id: { table: "modelos", keyColumn: "id" },
    local: { table: "lookup_locations", keyColumn: "code" },
    estado_venda: { table: "lookup_sale_statuses", keyColumn: "code" },
    estado_anuncio: { table: "lookup_announcement_statuses", keyColumn: "code" },
    estado_veiculo: { table: "lookup_vehicle_states", keyColumn: "code" }
  },
  anuncios: {
    carro_id: { table: "carros", keyColumn: "id" },
    estado_anuncio: { table: "lookup_announcement_statuses", keyColumn: "code" }
  },
  log_alteracoes: {
    acao: { table: "lookup_audit_actions", keyColumn: "code" }
  },
  grupos_repetidos: {
    modelo_id: { table: "modelos", keyColumn: "id" }
  },
  repetidos: {
    carro_id: { table: "carros", keyColumn: "id" },
    grupo_id: { table: "grupos_repetidos", keyColumn: "grupo_id" }
  },
  usuarios_acesso: {
    cargo: { table: "lookup_user_roles", keyColumn: "code" },
    status: { table: "lookup_user_statuses", keyColumn: "code" }
  },
  carro_caracteristicas_tecnicas: {
    carro_id: { table: "carros", keyColumn: "id" },
    caracteristica_id: { table: "caracteristicas_tecnicas", keyColumn: "id" }
  },
  carro_caracteristicas_visuais: {
    carro_id: { table: "carros", keyColumn: "id" },
    caracteristica_id: { table: "caracteristicas_visuais", keyColumn: "id" }
  }
};

function toTestIdFragment(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

function isMobileSheetLayout() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function storageKey(sheet: SheetKey, kind: "filters" | "widths" | "hidden" | "sort" | "display") {
  return `grid:v1:${sheet}:${kind}`;
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function cellKey(rIdx: number, cIdx: number) {
  return `${rIdx}::${cIdx}`;
}

function parseCellKey(value: string): CellAnchor {
  const [r, c] = value.split("::");
  return { rIdx: Number(r), cIdx: Number(c) };
}

function toDisplay(value: unknown, column: string) {
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

function toEditable(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toDatetimeLocal(value: Date) {
  const tzOffset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - tzOffset).toISOString().slice(0, 16);
}

function normalizeBulkToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseBooleanLikeValue(value: string): boolean | null {
  const normalized = normalizeBulkToken(value);
  if (!normalized) return null;
  if (["true", "1", "sim", "s", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "nao", "n", "no"].includes(normalized)) return false;
  return null;
}

function splitBulkLine(line: string, separator: BulkSeparator): string[] {
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

function splitBulkLineWithFallback(line: string, separator: BulkSeparator, expectedColumns: number) {
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

function coerceValue(oldValue: unknown, rawValue: string): unknown {
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

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

function ActionIcon({ name }: { name: IconName }) {
  if (name === "refresh") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v6h-6" />
      </svg>
    );
  }

  if (name === "select-cycle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  }

  if (name === "hide") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3 3 18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.2A10.3 10.3 0 0 1 12 5c6 0 9.8 7 9.8 7a16.7 16.7 0 0 1-3 3.8" />
        <path d="M6.6 6.7A16.5 16.5 0 0 0 2.2 12S6 19 12 19c1 0 2-.2 2.9-.6" />
      </svg>
    );
  }

  if (name === "show") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.2 12S6 5 12 5s9.8 7 9.8 7-3.8 7-9.8 7-9.8-7-9.8-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === "add") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "bulk") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 4v16" />
      </svg>
    );
  }

  if (name === "trash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 14h10l1-14" />
      </svg>
    );
  }

  if (name === "finalize") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.2 2.2 4.8-4.8" />
      </svg>
    );
  }

  if (name === "rebuild") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v6h6" />
      </svg>
    );
  }

  if (name === "left") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconButton(props: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  tone?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      className={`sheet-icon-btn ${props.tone === "accent" ? "is-accent" : ""}`}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props.testId}
    >
      <ActionIcon name={props.icon} />
      <span className="sr-only">{props.label}</span>
    </button>
  );
}

export function HolisticSheet({ actor, accessToken, devRole = null, onSignOut }: HolisticSheetProps) {
  const [activeSheetKey, setActiveSheetKey] = useState<SheetKey>(DEFAULT_SHEET.key);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = actor.role;
  const requestAuth = useMemo<RequestAuth>(
    () => ({
      accessToken,
      devRole
    }),
    [accessToken, devRole]
  );

  const [payload, setPayload] = useState<GridListPayload>(defaultPayload);
  const [lookups, setLookups] = useState<LookupsPayload | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "starts" | "ends">("contains");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<GridFilters>({});
  const [sortChain, setSortChain] = useState<SortRule[]>([]);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastCellAnchor, setLastCellAnchor] = useState<CellAnchor | null>(null);
  const [currentCell, setCurrentCell] = useState<CellAnchor | null>(null);
  const [lastRowAnchor, setLastRowAnchor] = useState<number | null>(null);
  const [selectCycleMode, setSelectCycleMode] = useState<"default" | "inverted">("default");

  const [hiddenRowsByTable, setHiddenRowsByTable] = useState<Record<string, string[]>>({});

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const blockSortClickRef = useRef(false);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [repetidosByGroup, setRepetidosByGroup] = useState<Record<string, Array<Record<string, unknown>>>>({});

  const [queueDepth, setQueueDepth] = useState(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const gridRef = useRef<HTMLDivElement>(null);
  const lastCellAnchorRef = useRef<CellAnchor | null>(null);
  const currentCellRef = useRef<CellAnchor | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [filterPopoverColumn, setFilterPopoverColumn] = useState<string | null>(null);
  const [filterPopoverSearch, setFilterPopoverSearch] = useState("");
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const [displayColumnBySheet, setDisplayColumnBySheet] = useState<Partial<Record<SheetKey, Record<string, string>>>>({});
  const [relationCache, setRelationCache] = useState<Partial<Record<SheetKey, GridListPayload>>>({});
  const [relationDialog, setRelationDialog] = useState<{
    sourceColumn: string;
    targetTable: SheetKey;
    keyColumn: string;
  } | null>(null);
  const [relationDialogLoading, setRelationDialogLoading] = useState(false);
  const [showGridPanel, setShowGridPanel] = useState(true);
  const [showFormPanel, setShowFormPanel] = useState(false);
  const [formMode, setFormMode] = useState<"single" | "bulk">("single");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const [formBooting, setFormBooting] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [plateLookupSubmitting, setPlateLookupSubmitting] = useState(false);
  const [modeloQuickCreateOpen, setModeloQuickCreateOpen] = useState(false);
  const [modeloQuickCreateValue, setModeloQuickCreateValue] = useState("");
  const [modeloQuickCreateError, setModeloQuickCreateError] = useState<string | null>(null);
  const [modeloQuickCreateSubmitting, setModeloQuickCreateSubmitting] = useState(false);
  const [bulkSeparator, setBulkSeparator] = useState<BulkSeparator>(";");
  const [bulkRawText, setBulkRawText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [splitRatio, setSplitRatio] = useState(64);
  const [splitResizeState, setSplitResizeState] = useState<SplitResizeState | null>(null);
  const splitResizeRef = useRef<SplitResizeState | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const bulkTextareaRef = useRef<HTMLTextAreaElement>(null);
  const modeloQuickCreateInputRef = useRef<HTMLInputElement>(null);

  const visibleSheets = useMemo(
    () => SHEETS.filter((sheet) => hasRequiredRole(role, sheet.minReadRole)),
    [role]
  );
  const fallbackSheet = visibleSheets[0] ?? DEFAULT_SHEET;
  const activeSheet = useMemo<SheetConfig>(
    () => visibleSheets.find((sheet) => sheet.key === activeSheetKey) ?? fallbackSheet,
    [activeSheetKey, fallbackSheet, visibleSheets]
  );
  const groupedSheets = useMemo(() => {
    const groups = new Map<string, SheetConfig[]>();

    for (const sheet of visibleSheets) {
      const bucket = groups.get(sheet.group) ?? [];
      bucket.push(sheet);
      groups.set(sheet.group, bucket);
    }

    return Array.from(groups.entries());
  }, [visibleSheets]);
  const canWriteActiveSheet = !activeSheet.readOnly && hasRequiredRole(role, activeSheet.minWriteRole);
  const canDeleteActiveSheet = !activeSheet.readOnly && hasRequiredRole(role, activeSheet.minDeleteRole);
  const canFinalizeSelected = activeSheet.key === "carros" && hasRequiredRole(role, "GERENTE");
  const canRebuildRepetidos = hasRequiredRole(role, "GERENTE");

  useEffect(() => {
    if (visibleSheets.some((sheet) => sheet.key === activeSheetKey)) return;
    setActiveSheetKey(fallbackSheet.key);
  }, [activeSheetKey, fallbackSheet.key, visibleSheets]);

  useEffect(() => {
    if (!modeloQuickCreateOpen) return;

    const timeout = window.setTimeout(() => {
      modeloQuickCreateInputRef.current?.focus();
      modeloQuickCreateInputRef.current?.select();
    }, 30);

    return () => window.clearTimeout(timeout);
  }, [modeloQuickCreateOpen]);

  const hiddenRows = useMemo(() => new Set(hiddenRowsByTable[activeSheetKey] ?? []), [activeSheetKey, hiddenRowsByTable]);

  const columns = useMemo(() => payload.header, [payload.header]);

  const viewRows = useMemo(() => {
    return payload.rows.filter((row) => {
      const rowId = String(row[activeSheet.primaryKey] ?? "");
      return !hiddenRows.has(rowId);
    });
  }, [activeSheet.primaryKey, hiddenRows, payload.rows]);
  const relationForActiveSheet = useMemo(() => RELATION_BY_SHEET_COLUMN[activeSheet.key] ?? {}, [activeSheet.key]);
  const displayColumnOverrides = useMemo(() => displayColumnBySheet[activeSheet.key] ?? {}, [activeSheet.key, displayColumnBySheet]);
  const columnResizeBounds = useMemo(() => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const context = canvas?.getContext("2d");
    if (context) {
      context.font = '500 13px "__nextjs-Geist", sans-serif';
    }

    const measureTextWidth = (text: string) => {
      if (!context) return text.length * RESIZE_CHAR_PX;
      return Math.ceil(context.measureText(text).width);
    };

    const minWidth = RESIZE_MIN_PX;
    const bounds: Record<string, { min: number; max: number }> = {};
    const sortMetaByColumn = new Map<string, { index: number; dir: "asc" | "desc" }>();
    sortChain.forEach((rule, index) => {
      sortMetaByColumn.set(rule.column, { index: index + 1, dir: rule.dir });
    });

    for (const column of columns) {
      let longestText = column;

      for (const row of viewRows) {
        const value = toDisplay(row[column], column);
        if (value.length > longestText.length) {
          longestText = value;
        }
      }

      const sortMeta = sortMetaByColumn.get(column);
      const displayOverride = displayColumnOverrides[column];

      const controlWidths: number[] = [HEADER_FILTER_BUTTON_PX];
      if (sortMeta) {
        controlWidths.push(measureTextWidth(`${sortMeta.index}:${sortMeta.dir === "asc" ? "▲" : "▼"}`) + 14);
      }
      if (displayOverride) {
        controlWidths.push(Math.min(HEADER_RELATION_PILL_MAX_PX, measureTextWidth(displayOverride) + 12));
      }

      const controlsWidth =
        controlWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, controlWidths.length - 1) * HEADER_CONTROL_GAP_PX;
      const labelMinWidth = Math.max(HEADER_LABEL_MIN_PX, Math.min(64, measureTextWidth(column)));
      const headerDrivenMin =
        8 + labelMinWidth + HEADER_CONTROL_GAP_PX + controlsWidth + RESIZE_CELL_PADDING_PX + RESIZE_HANDLE_PX;

      const minBound = Math.max(minWidth, headerDrivenMin);
      const maxWidth = Math.max(minBound, measureTextWidth(longestText) + RESIZE_CELL_PADDING_PX + RESIZE_HANDLE_PX);
      bounds[column] = { min: minBound, max: maxWidth };
    }

    return bounds;
  }, [columns, displayColumnOverrides, sortChain, viewRows]);
  const relationDisplayLookup = useMemo(() => {
    const lookup: Record<string, Record<string, unknown>> = {};

    for (const [column, relation] of Object.entries(relationForActiveSheet)) {
      const selectedDisplayColumn = displayColumnOverrides[column];
      if (!selectedDisplayColumn) continue;

      const tablePayload = relationCache[relation.table];
      if (!tablePayload) continue;

      const bucket: Record<string, unknown> = {};
      for (const row of tablePayload.rows) {
        const keyValue = row[relation.keyColumn];
        if (keyValue == null) continue;
        const key = String(keyValue);
        bucket[key] = row[selectedDisplayColumn];
      }

      lookup[column] = bucket;
    }

    return lookup;
  }, [displayColumnOverrides, relationCache, relationForActiveSheet]);
  const lookupOptionsByColumn = useMemo(() => {
    if (!lookups) return {} as Record<string, Array<{ value: string; label: string }>>;

    return {
      local: lookups.locations.map((item) => ({ value: item.code, label: item.name })),
      estado_venda: lookups.sale_statuses.map((item) => ({ value: item.code, label: item.name })),
      estado_anuncio: lookups.announcement_statuses.map((item) => ({ value: item.code, label: item.name })),
      estado_veiculo: lookups.vehicle_states.map((item) => ({ value: item.code, label: item.name })),
      cargo: lookups.user_roles.map((item) => ({ value: item.code, label: item.name })),
      status: lookups.user_statuses.map((item) => ({ value: item.code, label: item.name }))
    };
  }, [lookups]);
  const relationPickerOptionsByColumn = useMemo(() => {
    const options: Record<string, Array<{ value: string; label: string }>> = {};

    for (const [column, relation] of Object.entries(relationForActiveSheet)) {
      const targetPayload = relationCache[relation.table];
      if (!targetPayload) {
        options[column] = [];
        continue;
      }

      const displayColumn = targetPayload.header.find((headerCol) => {
        if (headerCol === relation.keyColumn) return false;
        if (headerCol === "created_at" || headerCol === "updated_at") return false;
        if (headerCol.endsWith("_id")) return false;
        return true;
      }) ?? relation.keyColumn;

      options[column] = targetPayload.rows
        .filter((row) => row[relation.keyColumn] != null)
        .map((row) => ({
          value: String(row[relation.keyColumn]),
          label: toDisplay(row[displayColumn], displayColumn)
        }));
    }

    return options;
  }, [relationCache, relationForActiveSheet]);
  const normalizedOptionValueByColumn = useMemo(() => {
    const maps: Record<string, Record<string, string>> = {};

    const appendOptions = (column: string, options: Array<{ value: string; label: string }>) => {
      if (options.length === 0) return;

      const bucket = maps[column] ?? {};
      for (const option of options) {
        for (const candidate of [option.value, option.label, `${option.label} (${option.value})`]) {
          const normalized = normalizeBulkToken(candidate);
          if (!normalized) continue;
          bucket[normalized] = option.value;
        }
      }

      maps[column] = bucket;
    };

    for (const [column, options] of Object.entries(lookupOptionsByColumn)) {
      appendOptions(column, options);
    }

    for (const [column, options] of Object.entries(relationPickerOptionsByColumn)) {
      appendOptions(column, options);
    }

    return maps;
  }, [lookupOptionsByColumn, relationPickerOptionsByColumn]);
  const sampleValueByColumn = useMemo(() => {
    const sample: Record<string, unknown> = {};
    for (const column of columns) {
      const rowWithValue = payload.rows.find((row) => row[column] != null);
      if (rowWithValue) {
        sample[column] = rowWithValue[column];
      }
    }
    return sample;
  }, [columns, payload.rows]);
  const formEditableColumns = useMemo(() => {
    return columns.filter((column) => {
      if (activeSheet.lockedColumns.includes(column)) return false;
      if (column === activeSheet.primaryKey) return false;
      if (column === "created_at" || column === "updated_at") return false;
      return true;
    });
  }, [activeSheet.lockedColumns, activeSheet.primaryKey, columns]);
  const isCarSingleForm = activeSheet.key === "carros" && formMode === "single";
  const modeloRelationOptions = relationPickerOptionsByColumn.modelo_id ?? [];
  const modeloDatalistId = "carros-modelo-id-options";
  const columnFilterOptions = useMemo(() => {
    const options: Record<string, FilterOption[]> = {};

    for (const column of columns) {
      const bucket = new Map<string, { label: string; count: number }>();
      const relationMap = relationDisplayLookup[column];

      for (const row of viewRows) {
        const raw = row[column];
        if (raw == null || raw === "") continue;

        const literal = toEditable(raw);
        const resolvedValue = relationMap ? (relationMap[String(raw)] ?? raw) : raw;
        const label = toDisplay(resolvedValue, column);
        const existing = bucket.get(literal);
        if (existing) {
          existing.count += 1;
        } else {
          bucket.set(literal, { label, count: 1 });
        }
      }

      options[column] = Array.from(bucket.entries())
        .map(([literal, meta]) => ({ literal, label: meta.label, count: meta.count }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    }

    return options;
  }, [columns, relationDisplayLookup, viewRows]);
  const resolvedColumnWidths = useMemo(() => {
    const widths: Record<string, number> = {};

    for (const column of columns) {
      const bounds = columnResizeBounds[column];
      const rawWidth = columnWidths[column] ?? 180;
      widths[column] = bounds ? Math.min(bounds.max, Math.max(bounds.min, rawWidth)) : rawWidth;
    }

    return widths;
  }, [columnResizeBounds, columnWidths, columns]);
  const tablePixelWidth = useMemo(() => {
    return 48 + columns.reduce((sum, column) => sum + (resolvedColumnWidths[column] ?? 180), 0);
  }, [columns, resolvedColumnWidths]);

  function parseFilterSelection(expressionRaw: string): string[] {
    const expression = expressionRaw.trim();
    if (!expression) return [];
    if (expression.startsWith("=")) {
      const value = expression.slice(1).trim();
      return value ? [value] : [];
    }
    if (expression.includes("|")) {
      return expression
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function writeFilterSelection(column: string, values: string[]) {
    const normalized = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

    setFilters((prev) => {
      const next = { ...prev };
      if (normalized.length === 0) {
        delete next[column];
      } else if (normalized.length === 1) {
        next[column] = `=${normalized[0]}`;
      } else {
        next[column] = normalized.join("|");
      }
      return next;
    });

    setPage(1);
    clearSelection();
  }

  function toggleFilterSelectionValue(column: string, value: string) {
    const selected = new Set(parseFilterSelection(filters[column] ?? ""));
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    writeFilterSelection(column, Array.from(selected));
  }

  const ensureRelationLoaded = useCallback(
    async (table: SheetKey) => {
      if (relationCache[table]) return relationCache[table] as GridListPayload;

      setRelationDialogLoading(true);
      try {
        const data = await fetchSheetRows({
          table,
          requestAuth,
          page: 1,
          pageSize: 200,
          query: "",
          matchMode: "contains",
          filters: {},
          sort: []
        });
        setRelationCache((prev) => ({ ...prev, [table]: data }));
        return data;
      } finally {
        setRelationDialogLoading(false);
      }
    },
    [relationCache, requestAuth]
  );

  const refreshRelationTable = useCallback(
    async (table: SheetKey) => {
      setRelationDialogLoading(true);
      try {
        const data = await fetchSheetRows({
          table,
          requestAuth,
          page: 1,
          pageSize: 200,
          query: "",
          matchMode: "contains",
          filters: {},
          sort: []
        });
        setRelationCache((prev) => ({ ...prev, [table]: data }));
        return data;
      } finally {
        setRelationDialogLoading(false);
      }
    },
    [requestAuth]
  );

  function openRelationDialogForColumn(column: string) {
    const relation = relationForActiveSheet[column];
    if (!relation) return;

    setFilterPopoverColumn(null);
    setFilterPopoverPosition(null);
    setRelationDialog({
      sourceColumn: column,
      targetTable: relation.table,
      keyColumn: relation.keyColumn
    });

    void ensureRelationLoaded(relation.table);
  }

  function selectDisplayColumnForRelation(displayColumn: string) {
    if (!relationDialog) return;

    setDisplayColumnBySheet((prev) => {
      const sheetCurrent = prev[activeSheet.key] ?? {};
      return {
        ...prev,
        [activeSheet.key]: {
          ...sheetCurrent,
          [relationDialog.sourceColumn]: displayColumn
        }
      };
    });

    setRelationDialog(null);
  }

  function resolveDisplayValue(row: Record<string, unknown>, column: string) {
    const mapForColumn = relationDisplayLookup[column];
    if (!mapForColumn) return row[column];

    const raw = row[column];
    if (raw == null) return raw;
    const key = String(raw);
    if (!(key in mapForColumn)) return raw;

    return mapForColumn[key];
  }

  const updateFilterPopoverPosition = useCallback((column: string) => {
    const trigger = filterTriggerRefs.current[column];
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = 280;
    const viewportWidth = window.innerWidth;
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const top = rect.bottom + 8;
    setFilterPopoverPosition({ top, left });
  }, []);

  const setCellAnchor = useCallback((next: CellAnchor | null) => {
    lastCellAnchorRef.current = next;
    setLastCellAnchor(next);
  }, []);

  const setCurrentCellAnchor = useCallback((next: CellAnchor | null) => {
    currentCellRef.current = next;
    setCurrentCell(next);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
    setSelectedCells(new Set());
    setCellAnchor(null);
    setCurrentCellAnchor(null);
    setLastRowAnchor(null);
    setSelectCycleMode("default");
  }, [setCellAnchor, setCurrentCellAnchor]);

  function persistSheetState(sheet: SheetKey, next: {
    filters: GridFilters;
    widths: Record<string, number>;
    sort: SortRule[];
    display: Record<string, string>;
  }) {
    writeStorage(storageKey(sheet, "filters"), next.filters);
    writeStorage(storageKey(sheet, "widths"), next.widths);
    writeStorage(storageKey(sheet, "sort"), next.sort);
    writeStorage(storageKey(sheet, "display"), next.display);
  }

  const loadLookups = useCallback(async () => {
    try {
      const data = await fetchLookups(requestAuth);
      setLookups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar lookups.");
    }
  }, [requestAuth]);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchSheetRows({
        table: activeSheetKey,
        requestAuth,
        page,
        pageSize,
        query,
        matchMode,
        filters,
        sort: sortChain
      });

      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar planilha.");
    } finally {
      setLoading(false);
    }
  }, [activeSheetKey, filters, matchMode, page, pageSize, query, requestAuth, sortChain]);

  function updateLocalRow(pkValue: string, patch: Record<string, unknown>) {
    setPayload((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        const rowId = String(row[activeSheet.primaryKey] ?? "");
        if (rowId !== pkValue) return row;
        return { ...row, ...patch };
      })
    }));
  }

  function enqueuePersistence(task: () => Promise<void>) {
    setQueueDepth((prev) => prev + 1);

    queueRef.current = queueRef.current
      .then(task)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Falha de persistencia");
      })
      .finally(() => {
        setQueueDepth((prev) => Math.max(0, prev - 1));
      });
  }

  async function commitCellEdit() {
    if (!editingCell) return;
    if (!canWriteActiveSheet) {
      setEditingCell(null);
      return;
    }

    const row = viewRows[editingCell.rowIndex];
    if (!row) {
      setEditingCell(null);
      return;
    }

    const pkValue = String(row[activeSheet.primaryKey] ?? "");
    const oldValue = row[editingCell.column];
    const newValue = coerceValue(oldValue, editingCell.value);

    if (newValue === oldValue) {
      setEditingCell(null);
      return;
    }

    updateLocalRow(pkValue, { [editingCell.column]: newValue });

    enqueuePersistence(async () => {
      await upsertSheetRow({
        table: activeSheet.key,
        requestAuth,
        row: {
          [activeSheet.primaryKey]: pkValue,
          [editingCell.column]: newValue
        }
      });
    });

    setEditingCell(null);
  }

  function handleCellClick(rIdx: number, cIdx: number, event: React.MouseEvent) {
    gridRef.current?.focus();
    const key = cellKey(rIdx, cIdx);
    setCurrentCellAnchor({ rIdx, cIdx });

    if (event.shiftKey && lastCellAnchor) {
      const next = new Set<string>();
      const rMin = Math.min(lastCellAnchor.rIdx, rIdx);
      const rMax = Math.max(lastCellAnchor.rIdx, rIdx);
      const cMin = Math.min(lastCellAnchor.cIdx, cIdx);
      const cMax = Math.max(lastCellAnchor.cIdx, cIdx);

      for (let r = rMin; r <= rMax; r += 1) {
        for (let c = cMin; c <= cMax; c += 1) {
          next.add(cellKey(r, c));
        }
      }

      setSelectedCells(next);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setCellAnchor({ rIdx, cIdx });
      return;
    }

    setSelectedCells(new Set([key]));
    setCellAnchor({ rIdx, cIdx });
  }

  function handleRowToggle(rowIndex: number, rowId: string, event: React.MouseEvent) {
    gridRef.current?.focus();
    setSelectCycleMode("default");

    if (event.shiftKey && lastRowAnchor != null) {
      const min = Math.min(lastRowAnchor, rowIndex);
      const max = Math.max(lastRowAnchor, rowIndex);
      const next = new Set(selectedRows);

      for (let idx = min; idx <= max; idx += 1) {
        const row = viewRows[idx];
        if (!row) continue;
        next.add(String(row[activeSheet.primaryKey] ?? ""));
      }

      setSelectedRows(next);
      return;
    }

    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

    setLastRowAnchor(rowIndex);
  }

  function handleSelectAllCycle() {
    const visibleIds = viewRows.map((row) => String(row[activeSheet.primaryKey] ?? ""));

    if (visibleIds.length === 0) {
      setSelectedRows(new Set());
      setSelectCycleMode("default");
      return;
    }

    if (selectedRows.size === 0) {
      const all = new Set(visibleIds);
      setSelectedRows(all);
      setSelectCycleMode("default");
      return;
    }

    if (selectedRows.size === visibleIds.length) {
      setSelectedRows(new Set());
      setSelectCycleMode("default");
      return;
    }

    if (selectCycleMode === "inverted") {
      setSelectedRows(new Set());
      setSelectCycleMode("default");
      return;
    }

    const inverted = new Set<string>();
    for (const rowId of visibleIds) {
      if (!selectedRows.has(rowId)) {
        inverted.add(rowId);
      }
    }

    setSelectedRows(inverted);
    setSelectCycleMode("inverted");
  }

  function toggleHideSelected() {
    if (selectedRows.size > 0) {
      setHiddenRowsByTable((prev) => {
        const current = new Set(prev[activeSheetKey] ?? []);
        for (const id of selectedRows) current.add(id);
        const next = { ...prev, [activeSheetKey]: Array.from(current) };
        writeStorage(storageKey(activeSheetKey, "hidden"), next[activeSheetKey]);
        return next;
      });
      setSelectedRows(new Set());
      setSelectCycleMode("default");
      return;
    }

    if (hiddenRows.size > 0) {
      setHiddenRowsByTable((prev) => {
        const next = { ...prev, [activeSheetKey]: [] };
        writeStorage(storageKey(activeSheetKey, "hidden"), next[activeSheetKey]);
        return next;
      });
    }
  }

  function toggleSort(column: string, withChain: boolean) {
    setSortChain((prev) => {
      const existingIndex = prev.findIndex((item) => item.column === column);
      let next = [...prev];

      if (!withChain) {
        if (existingIndex === -1) {
          next = [{ column, dir: "asc" }];
        } else if (prev[existingIndex].dir === "asc") {
          next = [{ column, dir: "desc" }];
        } else {
          next = [];
        }
      } else {
        if (existingIndex === -1) {
          next.push({ column, dir: "asc" });
        } else if (prev[existingIndex].dir === "asc") {
          next[existingIndex] = { ...next[existingIndex], dir: "desc" };
        } else {
          next.splice(existingIndex, 1);
        }
      }

      persistSheetState(activeSheetKey, { filters, widths: columnWidths, sort: next, display: displayColumnOverrides });
      return next;
    });

    setPage(1);
    clearSelection();
  }

  async function handleCopySelection() {
    if (selectedCells.size === 0) return;

    const coords = Array.from(selectedCells).map(parseCellKey);
    const rMin = Math.min(...coords.map((c) => c.rIdx));
    const rMax = Math.max(...coords.map((c) => c.rIdx));
    const cMin = Math.min(...coords.map((c) => c.cIdx));
    const cMax = Math.max(...coords.map((c) => c.cIdx));

    const lines: string[] = [];
    const csvEscape = (value: string) => {
      if (!value.includes(",") && !value.includes('"') && !value.includes("\n") && !value.includes("\r")) {
        return value;
      }
      return `"${value.replaceAll('"', '""')}"`;
    };

    for (let r = rMin; r <= rMax; r += 1) {
      const row = viewRows[r];
      const values: string[] = [];

      for (let c = cMin; c <= cMax; c += 1) {
        const col = columns[c];
        if (!row || !col) {
          values.push("");
          continue;
        }

        if (!selectedCells.has(cellKey(r, c))) {
          values.push("");
          continue;
        }

        const visualValue = resolveDisplayValue(row, col);
        values.push(csvEscape(toEditable(visualValue)));
      }

      lines.push(values.join(","));
    }

    await writeClipboard(lines.join("\n"));
  }

  async function handlePasteSelection() {
    const pasteAnchor = currentCellRef.current ?? lastCellAnchor;
    if (!navigator.clipboard?.readText || !pasteAnchor || !canWriteActiveSheet) return;

    const text = await navigator.clipboard.readText();
    if (!text) return;

    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.split("\t"));

    const patchByRow = new Map<string, Record<string, unknown>>();

    for (let r = 0; r < matrix.length; r += 1) {
      const rowIndex = pasteAnchor.rIdx + r;
      const targetRow = viewRows[rowIndex];
      if (!targetRow) continue;

      const rowId = String(targetRow[activeSheet.primaryKey] ?? "");
      if (!rowId) continue;

      const patch = patchByRow.get(rowId) ?? { [activeSheet.primaryKey]: rowId };

      for (let c = 0; c < matrix[r].length; c += 1) {
        const colIndex = pasteAnchor.cIdx + c;
        const column = columns[colIndex];
        if (!column) continue;
        if (activeSheet.lockedColumns.includes(column) || !canWriteActiveSheet) continue;

        const raw = matrix[r][c];
        patch[column] = coerceValue(targetRow[column], raw);
      }

      patchByRow.set(rowId, patch);
    }

    if (patchByRow.size === 0) return;

    setPayload((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        const rowId = String(row[activeSheet.primaryKey] ?? "");
        const patch = patchByRow.get(rowId);
        if (!patch) return row;
        return { ...row, ...patch };
      })
    }));

    for (const [, patch] of patchByRow) {
      enqueuePersistence(async () => {
        await upsertSheetRow({ table: activeSheet.key, requestAuth, row: patch });
      });
    }
  }

  async function handleDeleteSelected() {
    if (!canDeleteActiveSheet || selectedRows.size === 0) return;
    const sure = window.confirm(`Remover ${selectedRows.size} registro(s) da planilha ${activeSheet.label}?`);
    if (!sure) return;

    const ids = Array.from(selectedRows);

    for (const id of ids) {
      enqueuePersistence(async () => {
        await deleteSheetRow({ table: activeSheet.key, id, requestAuth });
      });
    }

    clearSelection();
    await queueRef.current;
    await loadGrid();
  }

  function isCarModelTextInput(column: string) {
    return activeSheet.key === "carros" && column === "modelo_id";
  }

  function getFormFieldKind(column: string) {
    if (isCarModelTextInput(column)) return "text";
    if (relationForActiveSheet[column]) return "relation";
    if ((lookupOptionsByColumn[column] ?? []).length > 0) return "lookup";

    const sampleValue = sampleValueByColumn[column];
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

  async function openInsertForm() {
    if (!canWriteActiveSheet) return;
    if (formEditableColumns.length === 0) {
      setError("Nao ha campos editaveis para esta tabela.");
      return;
    }

    setShowGridPanel(true);
    setShowFormPanel(true);
    setFormMode("single");
    setFormError(null);
    setFormInfo(null);
    setFormBooting(true);
    setFormSubmitting(false);
    setPlateLookupSubmitting(false);
    setModeloQuickCreateOpen(false);
    setModeloQuickCreateValue("");
    setModeloQuickCreateError(null);
    setModeloQuickCreateSubmitting(false);
    setBulkError(null);
    setBulkSuccess(null);
    setBulkRawText("");
    setBulkSubmitting(false);

    const relationColumns = formEditableColumns.filter((column) => Boolean(relationForActiveSheet[column]));
    const relationDefaults: Record<string, string> = {};

    try {
      if (relationColumns.length > 0) {
        await Promise.all(
          relationColumns.map(async (column) => {
            const relation = relationForActiveSheet[column];
            if (!relation) return;
            const data = await ensureRelationLoaded(relation.table);
            const firstKey = data.rows.find((row) => row[relation.keyColumn] != null)?.[relation.keyColumn];
            if (firstKey != null) {
              relationDefaults[column] = String(firstKey);
            }
          })
        );
      }

      const initialValues: Record<string, string> = {};
      for (const column of formEditableColumns) {
        const fieldKind = getFormFieldKind(column);
        if (fieldKind === "relation") {
          initialValues[column] = relationDefaults[column] ?? relationPickerOptionsByColumn[column]?.[0]?.value ?? "";
          continue;
        }
        if (fieldKind === "lookup") {
          initialValues[column] = lookupOptionsByColumn[column]?.[0]?.value ?? "";
          continue;
        }
        if (fieldKind === "boolean") {
          initialValues[column] = "true";
          continue;
        }
        if (fieldKind === "datetime") {
          initialValues[column] = toDatetimeLocal(new Date());
          continue;
        }
        initialValues[column] = "";
      }

      setFormValues(initialValues);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao preparar formulario.");
    } finally {
      setFormBooting(false);
    }
  }

  function openBulkInsertForm() {
    if (!canWriteActiveSheet) return;
    if (formEditableColumns.length === 0) {
      setError("Nao ha campos editaveis para esta tabela.");
      return;
    }

    setShowGridPanel(true);
    setShowFormPanel(true);
    setFormMode("bulk");
    setFormError(null);
    setFormInfo(null);
    setFormBooting(false);
    setFormSubmitting(false);
    setPlateLookupSubmitting(false);
    setModeloQuickCreateOpen(false);
    setModeloQuickCreateValue("");
    setModeloQuickCreateError(null);
    setModeloQuickCreateSubmitting(false);
    setBulkSeparator(";");
    setBulkRawText("");
    setBulkError(null);
    setBulkSuccess(null);
    setBulkSubmitting(false);
  }

  function coerceFormValue(column: string, rawValue: string): unknown {
    const inputValue = rawValue.trim();
    const value = normalizedOptionValueByColumn[column]?.[normalizeBulkToken(inputValue)] ?? inputValue;
    if (!value) return null;

    const fieldKind = getFormFieldKind(column);
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

  async function handlePlateLookupForForm() {
    if (!isCarSingleForm || plateLookupSubmitting) return;

    const rawPlate = (formValues.placa ?? "").trim().toUpperCase();
    if (!rawPlate) {
      setFormError("Informe a placa antes de pesquisar.");
      setFormInfo(null);
      return;
    }

    setPlateLookupSubmitting(true);
    setFormError(null);
    setFormInfo(null);

    try {
      const data = await lookupCarByPlate(rawPlate, requestAuth);
      const nextModelo = data.modelo?.trim() ?? "";
      const nextNome = data.fipe?.texto_modelo?.trim() || nextModelo;

      setFormValues((prev) => ({
        ...prev,
        placa: data.placa ?? rawPlate,
        modelo_id: nextModelo || prev.modelo_id || "",
        nome: prev.nome?.trim() ? prev.nome : nextNome,
        cor: prev.cor?.trim() ? prev.cor : data.cor ?? "",
        ano_fab: prev.ano_fab?.trim() ? prev.ano_fab : data.ano_fabricacao != null ? String(data.ano_fabricacao) : "",
        ano_mod: prev.ano_mod?.trim() ? prev.ano_mod : data.ano_modelo != null ? String(data.ano_modelo) : ""
      }));

      if (!relationCache.modelos) {
        void ensureRelationLoaded("modelos");
      }

      setFormInfo(
        nextModelo
          ? `Consulta concluida. Modelo sugerido: ${nextModelo}${data.fipe_score != null ? ` | FIPE score ${data.fipe_score}` : ""}`
          : "Consulta concluida. Revise os campos antes de salvar."
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao consultar placa.");
      setFormInfo(null);
    } finally {
      setPlateLookupSubmitting(false);
    }
  }

  function openModeloQuickCreate() {
    if (!isCarSingleForm || modeloQuickCreateSubmitting) return;
    setModeloQuickCreateValue((formValues.modelo_id ?? "").trim());
    setModeloQuickCreateError(null);
    setModeloQuickCreateOpen(true);
  }

  async function handleModeloQuickCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCarSingleForm || modeloQuickCreateSubmitting) return;

    const modelo = modeloQuickCreateValue.trim();
    if (!modelo) {
      setModeloQuickCreateError("Informe o nome do modelo.");
      return;
    }

    setModeloQuickCreateSubmitting(true);
    setModeloQuickCreateError(null);

    try {
      await upsertSheetRow({
        table: "modelos",
        requestAuth,
        row: { modelo }
      });

      await refreshRelationTable("modelos");
      setFormValues((prev) => ({ ...prev, modelo_id: modelo }));
      setFormInfo(`Modelo cadastrado: ${modelo}`);
      setModeloQuickCreateOpen(false);
    } catch (err) {
      setModeloQuickCreateError(err instanceof Error ? err.message : "Falha ao cadastrar modelo.");
    } finally {
      setModeloQuickCreateSubmitting(false);
    }
  }

  async function submitInsertForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteActiveSheet || formSubmitting) return;

    const row: Record<string, unknown> = {};
    for (const column of formEditableColumns) {
      row[column] = coerceFormValue(column, formValues[column] ?? "");
    }

    setFormSubmitting(true);
    setFormError(null);
    setFormInfo(null);
    try {
      await upsertSheetRow({ table: activeSheet.key, requestAuth, row });
      await loadGrid();
      setShowFormPanel(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao inserir linha.");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function submitBulkInsertForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteActiveSheet || bulkSubmitting) return;

    const lines = bulkRawText
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkError("Cole ao menos uma linha para inserir.");
      setBulkSuccess(null);
      return;
    }

    setBulkSubmitting(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const rawValues = splitBulkLineWithFallback(line, bulkSeparator, formEditableColumns.length).map((value) =>
          value.trim()
        );

        if (rawValues.length > formEditableColumns.length) {
          throw new Error(
            `Linha ${lineIndex + 1} possui ${rawValues.length} valores, mas a tabela aceita ${formEditableColumns.length}.`
          );
        }

        const row: Record<string, unknown> = {};
        for (let colIndex = 0; colIndex < formEditableColumns.length; colIndex += 1) {
          const column = formEditableColumns[colIndex];
          row[column] = coerceFormValue(column, rawValues[colIndex] ?? "");
        }

        await upsertSheetRow({ table: activeSheet.key, requestAuth, row });
      }

      setBulkSuccess(`${lines.length} linha(s) inserida(s) com sucesso.`);
      setBulkRawText("");
      await loadGrid();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Falha ao inserir em massa.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function handleFinalizeSelected() {
    if (!canFinalizeSelected || selectedRows.size === 0) return;

    const ids = Array.from(selectedRows);
    for (const id of ids) {
      enqueuePersistence(async () => {
        await runFinalize(id, requestAuth);
      });
    }

    clearSelection();
    await queueRef.current;
    await loadGrid();
  }

  async function handleRebuild() {
    if (!canRebuildRepetidos) return;

    await runRebuild(requestAuth);

    if (activeSheet.key === "grupos_repetidos" || activeSheet.key === "repetidos") {
      await loadGrid();
      return;
    }

    setActiveSheetKey("grupos_repetidos");
    setPage(1);
  }

  async function toggleGroup(groupId: string) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

    if (repetidosByGroup[groupId]) return;

    const response = await fetchSheetRows({
      table: "repetidos",
      requestAuth,
      page: 1,
      pageSize: 200,
      query: "",
      matchMode: "contains",
      filters: { grupo_id: `=${groupId}` },
      sort: []
    });

    setRepetidosByGroup((prev) => ({ ...prev, [groupId]: response.rows }));
  }

  const handleSheetSelection = useCallback((sheetKey: SheetKey) => {
    setActiveSheetKey(sheetKey);
    if (isMobileSheetLayout()) {
      setSidebarOpen(false);
    }
  }, []);

  function closeGridPanel() {
    if (!showFormPanel) return;
    setShowGridPanel(false);
  }

  function closeFormPanel() {
    if (!showGridPanel) {
      setShowGridPanel(true);
    }
    setShowFormPanel(false);
    setFormMode("single");
    setFormError(null);
    setFormInfo(null);
    setPlateLookupSubmitting(false);
    setModeloQuickCreateOpen(false);
    setModeloQuickCreateValue("");
    setModeloQuickCreateError(null);
    setModeloQuickCreateSubmitting(false);
    setBulkError(null);
    setBulkSuccess(null);
    setBulkRawText("");
    setBulkSubmitting(false);
  }

  function startSplitResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!showGridPanel || !showFormPanel) return;
    event.preventDefault();
    event.stopPropagation();

    const nextState: SplitResizeState = {
      startX: event.clientX,
      startRatio: splitRatio
    };
    splitResizeRef.current = nextState;
    setSplitResizeState(nextState);
  }

  function startResize(column: string, startX: number, event?: { preventDefault?: () => void; stopPropagation?: () => void }) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const bounds = columnResizeBounds[column] ?? { min: 80, max: 600 };
    const baseWidth = resolvedColumnWidths[column] ?? 180;
    const startWidth = Math.min(bounds.max, Math.max(bounds.min, baseWidth));

    blockSortClickRef.current = true;
    const nextResize: ResizeState = {
      column,
      startX,
      startWidth
    };
    resizeStateRef.current = nextResize;
    setResizeState(nextResize);
  }

  function maybeStartResizeFromHeader(column: string, event: React.PointerEvent<HTMLTableCellElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const distanceToRight = rect.right - event.clientX;
    const nearRightEdge = distanceToRight <= 16;

    if (!nearRightEdge) return;

    startResize(column, event.clientX, event);
  }

  function maybeStartResizeFromHeaderMouse(column: string, event: React.MouseEvent<HTMLTableCellElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const distanceToRight = rect.right - event.clientX;
    const nearRightEdge = distanceToRight <= 16;

    if (!nearRightEdge) return;

    startResize(column, event.clientX, event);
  }

  function moveCellSelectionBy(dr: number, dc: number, withRange: boolean) {
    if (viewRows.length === 0 || columns.length === 0) return;

    const source = currentCellRef.current ?? lastCellAnchorRef.current ?? { rIdx: 0, cIdx: 0 };
    const maxRow = Math.max(0, viewRows.length - 1);
    const maxCol = Math.max(0, columns.length - 1);
    const nextRow = Math.max(0, Math.min(maxRow, source.rIdx + dr));
    const nextCol = Math.max(0, Math.min(maxCol, source.cIdx + dc));
    const anchor = lastCellAnchorRef.current;

    if (withRange) {
      const rangeAnchor = anchor ?? source;
      if (!anchor) {
        setCellAnchor(rangeAnchor);
      }

      const next = new Set<string>();
      const rMin = Math.min(rangeAnchor.rIdx, nextRow);
      const rMax = Math.max(rangeAnchor.rIdx, nextRow);
      const cMin = Math.min(rangeAnchor.cIdx, nextCol);
      const cMax = Math.max(rangeAnchor.cIdx, nextCol);

      for (let r = rMin; r <= rMax; r += 1) {
        for (let c = cMin; c <= cMax; c += 1) {
          next.add(cellKey(r, c));
        }
      }
      setSelectedCells(next);
      setCurrentCellAnchor({ rIdx: nextRow, cIdx: nextCol });
    } else {
      setSelectedCells(new Set([cellKey(nextRow, nextCol)]));
      setCellAnchor({ rIdx: nextRow, cIdx: nextCol });
      setCurrentCellAnchor({ rIdx: nextRow, cIdx: nextCol });
    }

    const cell = document.getElementById(`grid-cell-${activeSheet.key}-${nextRow}-${nextCol}`);
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    gridRef.current?.focus();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    if (!sidebarOpen || !isMobileSheetLayout()) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(min-width: 1181px)");
    const resetSidebar = () => {
      if (media.matches) {
        setSidebarOpen(false);
      }
    };

    resetSidebar();
    media.addEventListener("change", resetSidebar);
    return () => media.removeEventListener("change", resetSidebar);
  }, []);

  useEffect(() => {
    if (!showFormPanel || formMode !== "bulk") return;
    bulkTextareaRef.current?.focus();
  }, [formMode, showFormPanel]);

  useEffect(() => {
    if (!filterPopoverColumn) return;
    const openColumn = filterPopoverColumn;
    updateFilterPopoverPosition(openColumn);

    function onPointerDown(event: PointerEvent) {
      if (filterPopoverRef.current?.contains(event.target as Node)) return;
      const trigger = filterTriggerRefs.current[openColumn];
      if (trigger?.contains(event.target as Node)) return;
      setFilterPopoverColumn(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFilterPopoverColumn(null);
      }
    }

    function onReposition() {
      updateFilterPopoverPosition(openColumn);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [filterPopoverColumn, updateFilterPopoverPosition]);

  useEffect(() => {
    const storedFilters = readStorage<GridFilters>(storageKey(activeSheetKey, "filters"), {});
    const storedWidths = readStorage<Record<string, number>>(storageKey(activeSheetKey, "widths"), {});
    const storedHidden = readStorage<string[]>(storageKey(activeSheetKey, "hidden"), []);
    const storedDisplay = readStorage<Record<string, string>>(storageKey(activeSheetKey, "display"), {});
    const storedSort = readStorage<SortRule[]>(storageKey(activeSheetKey, "sort"), []);

    setFilters(storedFilters);
    setColumnWidths(storedWidths);
    setSortChain(storedSort);
    setDisplayColumnBySheet((prev) => ({ ...prev, [activeSheetKey]: storedDisplay }));
    setHiddenRowsByTable((prev) => ({ ...prev, [activeSheetKey]: storedHidden }));

    setPage(1);
    setExpandedGroupIds(new Set());
    setRepetidosByGroup({});
    setFilterPopoverColumn(null);
    setFilterPopoverPosition(null);
    setFilterPopoverSearch("");
    setRelationDialog(null);
    clearSelection();
    setShowFormPanel(false);
    setShowGridPanel(true);
    setFormMode("single");
    setFormValues({});
    setFormError(null);
    setBulkError(null);
    setBulkSuccess(null);
    setBulkRawText("");
    setBulkSubmitting(false);
  }, [activeSheetKey, clearSelection]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const currentResize = resizeStateRef.current;
      if (!currentResize) return;
      const bounds = columnResizeBounds[currentResize.column] ?? { min: 80, max: 600 };

      setColumnWidths((prev) => {
        const rawWidth = currentResize.startWidth + (event.clientX - currentResize.startX);
        const width = Math.min(bounds.max, Math.max(bounds.min, rawWidth));
        if (prev[currentResize.column] === width) return prev;
        return { ...prev, [currentResize.column]: width };
      });
    }

    function onMouseMove(event: MouseEvent) {
      const currentResize = resizeStateRef.current;
      if (!currentResize) return;
      const bounds = columnResizeBounds[currentResize.column] ?? { min: 80, max: 600 };

      setColumnWidths((prev) => {
        const rawWidth = currentResize.startWidth + (event.clientX - currentResize.startX);
        const width = Math.min(bounds.max, Math.max(bounds.min, rawWidth));
        if (prev[currentResize.column] === width) return prev;
        return { ...prev, [currentResize.column]: width };
      });
    }

    function onPointerUp() {
      if (!resizeStateRef.current) return;

      resizeStateRef.current = null;
      setResizeState(null);
      setColumnWidths((prev) => {
        writeStorage(storageKey(activeSheetKey, "widths"), prev);
        return prev;
      });

      window.setTimeout(() => {
        blockSortClickRef.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onPointerUp);
    };
  }, [activeSheetKey, columnResizeBounds]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const currentResize = splitResizeRef.current;
      if (!currentResize) return;
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const deltaPct = ((event.clientX - currentResize.startX) / rect.width) * 100;
      const nextRatio = Math.max(SPLIT_MIN_RATIO, Math.min(SPLIT_MAX_RATIO, currentResize.startRatio + deltaPct));
      setSplitRatio(nextRatio);
    }

    function onMouseMove(event: MouseEvent) {
      const currentResize = splitResizeRef.current;
      if (!currentResize) return;
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const deltaPct = ((event.clientX - currentResize.startX) / rect.width) * 100;
      const nextRatio = Math.max(SPLIT_MIN_RATIO, Math.min(SPLIT_MAX_RATIO, currentResize.startRatio + deltaPct));
      setSplitRatio(nextRatio);
    }

    function stopResize() {
      if (!splitResizeRef.current) return;
      splitResizeRef.current = null;
      setSplitResizeState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);

  useEffect(() => {
    persistSheetState(activeSheetKey, {
      filters,
      widths: columnWidths,
      sort: sortChain,
      display: displayColumnOverrides
    });
  }, [activeSheetKey, columnWidths, displayColumnOverrides, filters, sortChain]);

  const activeFilterColumn = filterPopoverColumn;
  const activeFilterRelation = activeFilterColumn ? relationForActiveSheet[activeFilterColumn] : null;
  const activeFilterValues = activeFilterColumn ? parseFilterSelection(filters[activeFilterColumn] ?? "") : [];
  const activeFilterSearch = filterPopoverSearch.trim().toLowerCase();
  const activeFilterOptions = activeFilterColumn
    ? (columnFilterOptions[activeFilterColumn] ?? []).filter((option) => {
        if (!activeFilterSearch) return true;
        return option.label.toLowerCase().includes(activeFilterSearch) || option.literal.toLowerCase().includes(activeFilterSearch);
      })
    : [];
  const relationDialogPayload = relationDialog ? relationCache[relationDialog.targetTable] ?? null : null;
  const hasSplitPanels = showGridPanel && showFormPanel;
  const canCloseGridPanel = showFormPanel;
  const canCloseFormPanel = true;
  const totalPages = Math.max(1, Math.ceil(payload.totalRows / pageSize));
  const workspaceStyle = hasSplitPanels
    ? { gridTemplateColumns: `minmax(0, ${splitRatio}%) 10px minmax(0, ${Math.max(10, 100 - splitRatio)}%)` }
    : undefined;

  return (
    <main className="sheet-shell" data-testid="holistic-sheet">
      <div className="sheet-layout">
        <button
          type="button"
          className={`sheet-sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
          aria-label="Fechar navegacao de tabelas"
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={() => setSidebarOpen(false)}
          data-testid="sheet-sidebar-backdrop"
        />

        <aside className={`sheet-sidebar ${sidebarOpen ? "is-open" : ""}`} id="sheet-sidebar" data-testid="sheet-sidebar">
          <header className="sheet-sidebar-head">
            <div className="sheet-sidebar-head-row">
              <span className="sheet-badge">RN Gestor</span>
              <button
                type="button"
                className="sheet-sidebar-close"
                onClick={() => setSidebarOpen(false)}
                data-testid="sidebar-close"
              >
                Fechar
              </button>
            </div>
            <strong>Tabelas</strong>
            <p>Navegacao completa por modulos do sistema.</p>
          </header>
          <nav className="sheet-sidebar-nav" aria-label="Planilhas">
            {groupedSheets.map(([groupName, sheets]) => (
              <section key={groupName} className="sheet-sidebar-group">
                <h2>{groupName}</h2>
                <div className="sheet-sidebar-list" role="tablist" aria-label={groupName}>
                  {sheets.map((sheet) => (
                    <button
                      key={sheet.key}
                      type="button"
                      className={`sheet-side-tab ${sheet.key === activeSheet.key ? "is-active" : ""}`}
                      onClick={() => handleSheetSelection(sheet.key)}
                      data-testid={`sheet-tab-${sheet.key}`}
                    >
                      <span className="sheet-side-tab-head">
                        <span>{sheet.label}</span>
                        <span
                          className={`sheet-side-tag ${
                            sheet.readOnly || !hasRequiredRole(role, sheet.minWriteRole) ? "is-readonly" : "is-writable"
                          }`}
                        >
                          {sheet.readOnly || !hasRequiredRole(role, sheet.minWriteRole) ? "RO" : "RW"}
                        </span>
                      </span>
                      {sheet.description ? <small>{sheet.description}</small> : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </aside>

        <section className="sheet-main">
          <section className="sheet-topbar">
            <div className="sheet-topbar-head">
              <div className="sheet-topbar-title-row">
                <button
                  type="button"
                  className="sheet-sidebar-toggle"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  aria-expanded={sidebarOpen}
                  aria-controls="sheet-sidebar"
                  data-testid="sidebar-toggle"
                >
                  <span className="sheet-sidebar-toggle-icon" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Tabelas
                </button>

                <div className="sheet-title-wrap">
                  <h1>Painel Operacional de Tabelas</h1>
                  <p>
                    Tabela ativa: <strong>{activeSheet.label}</strong>. Interacoes de planilha em tempo real com API versionada.
                  </p>
                </div>
              </div>

              <div className="sheet-pager sheet-pager-top" data-testid="sheet-pager">
                <IconButton
                  icon="left"
                  label="Pagina anterior"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  testId="pager-prev"
                />
                <span className="sheet-pager-status">
                  Pagina {page} de {totalPages}
                </span>
                <IconButton
                  icon="right"
                  label="Proxima pagina"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={page >= totalPages}
                  testId="pager-next"
                />
                <label className="sheet-inline-field">
                  pageSize
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="sheet-actions-row">
              <div className="sheet-toolbar-controls">
                <label className="sheet-inline-field">
                  Sessao
                  <div className="sheet-inline-static">
                    <strong>{actor.userName}</strong>
                    <span>{role}</span>
                    {actor.userEmail ? <small>{actor.userEmail}</small> : null}
                  </div>
                </label>
                <label className="sheet-inline-field">
                  Busca
                  <input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder="Buscar..." />
                </label>
                <label className="sheet-inline-field">
                  Match
                  <select value={matchMode} onChange={(e) => setMatchMode(e.target.value as typeof matchMode)}>
                    <option value="contains">contains</option>
                    <option value="exact">exact</option>
                    <option value="starts">starts</option>
                    <option value="ends">ends</option>
                  </select>
                </label>
                <IconButton icon="refresh" label="Recarregar grid" onClick={() => void loadGrid()} testId="action-reload" />
                <Link href="/arquivos" className="btn sheet-nav-btn">
                  Arquivos
                </Link>
                <button type="button" className="btn sheet-signout-btn" onClick={() => void onSignOut()}>
                  Sair
                </button>
              </div>

              <div className="sheet-toolbar-controls">
                <IconButton
                  icon="select-cycle"
                  label="Ciclo de selecao"
                  onClick={handleSelectAllCycle}
                  testId="action-select-cycle"
                />
                <IconButton
                  icon={selectedRows.size > 0 ? "hide" : hiddenRows.size > 0 ? "show" : "hide"}
                  label={selectedRows.size > 0 ? "Ocultar selecionadas" : hiddenRows.size > 0 ? "Mostrar ocultas" : "Ocultar linhas"}
                  onClick={toggleHideSelected}
                  testId="action-hide-toggle"
                />
                <IconButton
                  icon="add"
                  label="Inserir linha"
                  onClick={() => void openInsertForm()}
                  disabled={!canWriteActiveSheet}
                  testId="action-insert-row"
                />
                <IconButton
                  icon="bulk"
                  label="Insert em massa"
                  onClick={openBulkInsertForm}
                  disabled={!canWriteActiveSheet}
                  testId="action-insert-bulk"
                />
                <IconButton
                  icon="trash"
                  label="Excluir selecionadas"
                  onClick={() => void handleDeleteSelected()}
                  disabled={!canDeleteActiveSheet}
                  testId="action-delete-rows"
                />
                {activeSheet.key === "carros" ? (
                  <IconButton
                    icon="finalize"
                    label="Finalizar selecionado"
                    onClick={() => void handleFinalizeSelected()}
                    disabled={!canFinalizeSelected}
                    testId="action-finalize-rows"
                  />
                ) : null}
                <IconButton
                  icon="rebuild"
                  label="Rebuild repetidos"
                  onClick={() => void handleRebuild()}
                  disabled={!canRebuildRepetidos}
                  testId="action-rebuild-repetidos"
                  tone="accent"
                />
              </div>
            </div>

            <div className="sheet-status-row">
              <span>Rows visiveis: {viewRows.length}</span>
              <span>Total: {payload.totalRows}</span>
              <span>Selecionadas (rows): {selectedRows.size}</span>
              <span>Selecionadas (cells): {selectedCells.size}</span>
              <span>Fila persistencia: {queueDepth}</span>
              {loading ? <span>Carregando...</span> : null}
              {error ? <span className="sheet-error">Erro: {error}</span> : null}
            </div>
          </section>

          <div
            className={`sheet-workspace ${splitResizeState ? "is-resizing" : ""}`}
            ref={workspaceRef}
            style={workspaceStyle}
            data-testid="sheet-workspace"
          >
            {showGridPanel ? (
              <section className="sheet-panel sheet-grid-panel" data-testid="sheet-grid-panel">
                <header className="sheet-panel-head">
                  <strong>{activeSheet.label}</strong>
                  <button
                    type="button"
                    className="sheet-panel-close"
                    data-testid="panel-close-grid"
                    onClick={closeGridPanel}
                    disabled={!canCloseGridPanel}
                    title={canCloseGridPanel ? "Fechar planilha principal" : "Mantenha ao menos um modulo aberto"}
                    aria-label="Fechar planilha principal"
                  >
                    ×
                  </button>
                </header>
                <section
                  className={`sheet-grid-container ${resizeState ? "is-resizing" : ""}`}
                  ref={gridRef}
                  tabIndex={0}
                  data-testid="sheet-grid-container"
                  onMouseDown={() => gridRef.current?.focus()}
                  onPointerDown={() => gridRef.current?.focus()}
                  onKeyDown={(event) => {
                    if (editingCell) return;

                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
                      event.preventDefault();
                      void handleCopySelection();
                      return;
                    }

                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
                      event.preventDefault();
                      void handlePasteSelection();
                      return;
                    }

                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveCellSelectionBy(1, 0, event.shiftKey);
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveCellSelectionBy(-1, 0, event.shiftKey);
                    }

                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      moveCellSelectionBy(0, -1, event.shiftKey);
                    }

                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      moveCellSelectionBy(0, 1, event.shiftKey);
                    }

                    const targetCell = currentCell ?? lastCellAnchor;
                    if (event.key === "Enter" && targetCell) {
                      event.preventDefault();
                      const row = viewRows[targetCell.rIdx];
                      const column = columns[targetCell.cIdx];
                      const rowId = String(row?.[activeSheet.primaryKey] ?? "");
                      if (!row || !column || !canWriteActiveSheet || activeSheet.lockedColumns.includes(column)) return;
                      setEditingCell({
                        rowId,
                        rowIndex: targetCell.rIdx,
                        column,
                        value: toEditable(row[column])
                      });
                    }
                  }}
                >
                  <table className="sheet-grid" data-testid="sheet-grid-table" style={{ width: tablePixelWidth }}>
                    <colgroup>
                      <col style={{ width: 48 }} />
                      {columns.map((column) => (
                        <col key={column} style={{ width: resolvedColumnWidths[column] ?? 180 }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>#</th>
                        {columns.map((column) => {
                          const sortIndex = sortChain.findIndex((item) => item.column === column);
                          const sortDir = sortIndex >= 0 ? sortChain[sortIndex].dir : null;
                          const currentFilterExpression = filters[column] ?? "";
                          const filterActive = currentFilterExpression.trim().length > 0;
                          const displayOverride = displayColumnOverrides[column];

                          return (
                            <th
                              key={column}
                              className={activeSheet.lockedColumns.includes(column) ? "is-locked" : ""}
                              onPointerDown={(event) => maybeStartResizeFromHeader(column, event)}
                              onMouseDown={(event) => maybeStartResizeFromHeaderMouse(column, event)}
                              onClick={(event) => {
                                if (blockSortClickRef.current) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  return;
                                }
                                toggleSort(column, event.shiftKey);
                              }}
                            >
                              <div className="sheet-th-content">
                                <span className="sheet-th-label" title={column}>
                                  {column}
                                </span>
                                <div className="sheet-th-controls">
                                  {displayOverride ? <span className="sheet-relation-pill">{displayOverride}</span> : null}
                                  {sortDir ? (
                                    <span className="sheet-sort-pill">
                                      {sortIndex + 1}:{sortDir === "asc" ? "▲" : "▼"}
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={`sheet-filter-trigger ${filterActive ? "is-active" : ""}`}
                                    title="Filtrar valores"
                                    aria-label={`Filtrar coluna ${column}`}
                                    data-testid={`filter-trigger-${column}`}
                                    ref={(element) => {
                                      filterTriggerRefs.current[column] = element;
                                    }}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setFilterPopoverSearch("");
                                      setFilterPopoverColumn((prev) => {
                                        const nextColumn = prev === column ? null : column;
                                        if (nextColumn) {
                                          updateFilterPopoverPosition(nextColumn);
                                        } else {
                                          setFilterPopoverPosition(null);
                                        }
                                        return nextColumn;
                                      });
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />
                                    </svg>
                                  </button>
                                </div>
                                <span
                                  className="sheet-resize-handle"
                                  onPointerDown={(event) => startResize(column, event.clientX, event)}
                                  onMouseDown={(event) => startResize(column, event.clientX, event)}
                                  onClick={(event) => event.stopPropagation()}
                                  onDoubleClick={(event) => event.stopPropagation()}
                                  data-testid={`resize-handle-${column}`}
                                />
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {viewRows.map((row, rowIndex) => {
                        const rowId = String(row[activeSheet.primaryKey] ?? `row-${rowIndex}`);
                        const isSelectedRow = selectedRows.has(rowId);
                        const domainClass = activeSheet.rowClassName?.(row) ?? "";

                        return (
                          <Fragment key={rowId}>
                            <tr key={rowId} className={`${isSelectedRow ? "is-selected-row" : ""} ${domainClass}`.trim()}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={isSelectedRow}
                                  onClick={(event) => handleRowToggle(rowIndex, rowId, event)}
                                  onChange={() => undefined}
                                  data-testid={`row-check-${rowId}`}
                                />
                                {activeSheet.key === "grupos_repetidos" ? (
                                  <button
                                    className="sheet-expand-btn"
                                    type="button"
                                    onClick={() => void toggleGroup(rowId)}
                                    title="Expandir grupo"
                                  >
                                    {expandedGroupIds.has(rowId) ? "−" : "+"}
                                  </button>
                                ) : null}
                              </td>
                              {columns.map((column, colIndex) => {
                                const isEditing =
                                  editingCell?.rowId === rowId && editingCell?.column === column && editingCell?.rowIndex === rowIndex;
                                const isSelectedCell = selectedCells.has(cellKey(rowIndex, colIndex));
                                const cellValue = row[column];
                                const visibleValue = resolveDisplayValue(row, column);

                                return (
                                  <td
                                    id={`grid-cell-${activeSheet.key}-${rowIndex}-${colIndex}`}
                                    key={`${rowId}-${column}`}
                                    data-testid={`cell-${activeSheet.key}-${rowIndex}-${column}`}
                                    className={`${isSelectedCell ? "is-selected-cell" : ""} ${
                                      activeSheet.lockedColumns.includes(column) ? "is-locked" : ""
                                    }`.trim()}
                                    title={toEditable(visibleValue)}
                                    onClick={(event) => handleCellClick(rowIndex, colIndex, event)}
                                    onDoubleClick={() => {
                                      if (!canWriteActiveSheet || activeSheet.lockedColumns.includes(column)) return;
                                      setEditingCell({
                                        rowId,
                                        rowIndex,
                                        column,
                                        value: toEditable(cellValue)
                                      });
                                    }}
                                  >
                                    {isEditing ? (
                                      <input
                                        className="sheet-inline-editor"
                                        autoFocus
                                        value={editingCell.value}
                                        onChange={(event) =>
                                          setEditingCell((prev) => (prev ? { ...prev, value: event.target.value } : prev))
                                        }
                                        onBlur={() => void commitCellEdit()}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void commitCellEdit();
                                          }
                                          if (event.key === "Escape") {
                                            setEditingCell(null);
                                          }
                                        }}
                                      />
                                    ) : (
                                      <span>{toDisplay(visibleValue, column)}</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                            {activeSheet.key === "grupos_repetidos" && expandedGroupIds.has(rowId) ? (
                              <tr className="sheet-child-row">
                                <td colSpan={columns.length + 1}>
                                  <div className="sheet-child-grid">
                                    {(repetidosByGroup[rowId] ?? []).length === 0 ? (
                                      <p>Sem itens no grupo.</p>
                                    ) : (
                                      <ul>
                                        {(repetidosByGroup[rowId] ?? []).map((child) => (
                                          <li key={String(child.carro_id)}>
                                            carro_id: <strong>{String(child.carro_id)}</strong> | grupo_id: {String(child.grupo_id)}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              </section>
            ) : null}
            {hasSplitPanels ? (
              <div
                className="sheet-splitter"
                role="separator"
                aria-orientation="vertical"
                onPointerDown={startSplitResize}
                data-testid="sheet-splitter"
              />
            ) : null}
            {showFormPanel ? (
              <section className="sheet-panel sheet-form-panel" data-testid="sheet-form-panel">
                {formMode === "single" ? (
                  <form className="sheet-form-panel-shell" onSubmit={submitInsertForm}>
                    <header className="sheet-form-topbar" data-testid="form-topbar">
                      <strong>Novo registro: {activeSheet.label}</strong>
                      <div className="sheet-form-topbar-actions">
                        <button
                          type="submit"
                          className="sheet-form-submit"
                          data-testid="form-submit"
                          disabled={formSubmitting || formBooting}
                        >
                          {formSubmitting ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          className="sheet-panel-close"
                          data-testid="panel-close-form"
                          onClick={closeFormPanel}
                          disabled={!canCloseFormPanel}
                          title={canCloseFormPanel ? "Fechar formulario" : "Mantenha ao menos um modulo aberto"}
                          aria-label="Fechar formulario"
                        >
                          ×
                        </button>
                      </div>
                    </header>
                    <div className="sheet-form-panel-body">
                      {formBooting ? <p>Carregando relacoes...</p> : null}
                      {formEditableColumns.length === 0 ? (
                        <p>Sem campos editaveis para esta tabela.</p>
                      ) : (
                        formEditableColumns.map((column) => {
                          const fieldKind = getFormFieldKind(column);
                          const relation = relationForActiveSheet[column];
                          const relationOptions = relation ? relationPickerOptionsByColumn[column] ?? [] : [];
                          const lookupOptions = lookupOptionsByColumn[column] ?? [];
                          const isPlateField = isCarSingleForm && column === "placa";
                          const isCarModelField = isCarSingleForm && column === "modelo_id";

                          return (
                            <label
                              key={column}
                              className={`sheet-form-field ${isPlateField ? "is-plate-highlight" : ""} ${
                                isCarModelField ? "is-model-field" : ""
                              }`.trim()}
                            >
                              <span>{column}</span>
                              {isPlateField ? (
                                <>
                                  <div className="sheet-form-inline sheet-form-plate-card">
                                    <input
                                      type="text"
                                      value={formValues[column] ?? ""}
                                      onChange={(event) =>
                                        setFormValues((prev) => ({ ...prev, [column]: event.target.value.toUpperCase() }))
                                      }
                                      data-testid={`form-field-${column}`}
                                      placeholder="AAA0X00"
                                    />
                                    <button
                                      type="button"
                                      className="sheet-form-aux-btn is-accent"
                                      onClick={handlePlateLookupForForm}
                                      data-testid="form-plate-lookup"
                                      disabled={plateLookupSubmitting || formBooting}
                                    >
                                      {plateLookupSubmitting ? "Pesquisando..." : "Pesquisar"}
                                    </button>
                                  </div>
                                  <p className="sheet-form-field-hint">
                                    Pesquise a placa para preencher anos, cor e sugerir o modelo no campo abaixo.
                                  </p>
                                </>
                              ) : isCarModelField ? (
                                <>
                                  <div className="sheet-form-inline">
                                    <input
                                      type="text"
                                      value={formValues[column] ?? ""}
                                      onChange={(event) => setFormValues((prev) => ({ ...prev, [column]: event.target.value }))}
                                      data-testid={`form-field-${column}`}
                                      placeholder="Digite o nome do modelo"
                                      list={modeloDatalistId}
                                    />
                                    <button
                                      type="button"
                                      className="sheet-form-aux-btn"
                                      onClick={openModeloQuickCreate}
                                      data-testid="form-modelo-quick-add"
                                      disabled={modeloQuickCreateSubmitting || formBooting}
                                      aria-label="Cadastrar modelo"
                                      title="Cadastrar modelo"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <datalist id={modeloDatalistId}>
                                    {modeloRelationOptions.map((option) => (
                                      <option key={`modelo-suggest-${option.value}`} value={option.label} />
                                    ))}
                                  </datalist>
                                  <p className="sheet-form-field-hint">
                                    Digite o nome do modelo existente ou use + para cadastrar um novo sem sair do formulario.
                                  </p>
                                </>
                              ) : fieldKind === "relation" ? (
                                <select
                                  value={formValues[column] ?? ""}
                                  onChange={(event) => setFormValues((prev) => ({ ...prev, [column]: event.target.value }))}
                                  data-testid={`form-field-${column}`}
                                >
                                  {relationOptions.length === 0 ? <option value="">Sem opcoes</option> : null}
                                  {relationOptions.map((option) => (
                                    <option key={`${column}-${option.value}`} value={option.value}>
                                      {option.label} ({option.value})
                                    </option>
                                  ))}
                                </select>
                              ) : fieldKind === "lookup" ? (
                                <select
                                  value={formValues[column] ?? ""}
                                  onChange={(event) => setFormValues((prev) => ({ ...prev, [column]: event.target.value }))}
                                  data-testid={`form-field-${column}`}
                                >
                                  {lookupOptions.length === 0 ? <option value="">Sem opcoes</option> : null}
                                  {lookupOptions.map((option) => (
                                    <option key={`${column}-${option.value}`} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : fieldKind === "boolean" ? (
                                <select
                                  value={formValues[column] ?? "true"}
                                  onChange={(event) => setFormValues((prev) => ({ ...prev, [column]: event.target.value }))}
                                  data-testid={`form-field-${column}`}
                                >
                                  <option value="true">Sim</option>
                                  <option value="false">Nao</option>
                                </select>
                              ) : (
                                <input
                                  type={fieldKind === "number" ? "number" : fieldKind === "datetime" ? "datetime-local" : "text"}
                                  value={formValues[column] ?? ""}
                                  onChange={(event) => setFormValues((prev) => ({ ...prev, [column]: event.target.value }))}
                                  data-testid={`form-field-${column}`}
                                />
                              )}
                            </label>
                          );
                        })
                      )}
                      {formInfo ? (
                        <p className="sheet-form-success" data-testid="form-info">
                          {formInfo}
                        </p>
                      ) : null}
                      {formError ? <p className="sheet-error">{formError}</p> : null}
                    </div>
                  </form>
                ) : (
                  <form className="sheet-form-panel-shell" onSubmit={submitBulkInsertForm}>
                    <header className="sheet-form-topbar" data-testid="bulk-topbar">
                      <strong>Insert em massa: {activeSheet.label}</strong>
                      <div className="sheet-form-topbar-actions">
                        <button
                          type="submit"
                          className="sheet-form-submit"
                          data-testid="bulk-submit"
                          disabled={bulkSubmitting}
                        >
                          {bulkSubmitting ? "Inserindo..." : "Inserir em massa"}
                        </button>
                        <button
                          type="button"
                          className="sheet-panel-close"
                          data-testid="panel-close-form"
                          onClick={closeFormPanel}
                          disabled={!canCloseFormPanel}
                          title={canCloseFormPanel ? "Fechar formulario" : "Mantenha ao menos um modulo aberto"}
                          aria-label="Fechar formulario"
                        >
                          ×
                        </button>
                      </div>
                    </header>
                    <div className="sheet-form-panel-body sheet-bulk-panel-body">
                      <p>Insira uma linha por registro seguindo a ordem das colunas abaixo.</p>
                      <label className="sheet-form-field">
                        <span>Separador</span>
                        <select
                          value={bulkSeparator}
                          onChange={(event) => setBulkSeparator(event.target.value as BulkSeparator)}
                          data-testid="bulk-separator"
                        >
                          {BULK_SEPARATOR_OPTIONS.map((option) => (
                            <option key={option.label} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sheet-form-field">
                        <span>Texto para insert em massa</span>
                        <textarea
                          ref={bulkTextareaRef}
                          className="sheet-bulk-textarea"
                          value={bulkRawText}
                          onChange={(event) => setBulkRawText(event.target.value)}
                          data-testid="bulk-input"
                          placeholder="Cole aqui as linhas para inserir..."
                        />
                      </label>
                      <p className="sheet-form-hint">
                        Ordem das colunas:{" "}
                        <code data-testid="bulk-column-order">{formEditableColumns.join(" | ") || "Sem colunas editaveis"}</code>
                      </p>
                      {bulkSuccess ? (
                        <p className="sheet-form-success" data-testid="bulk-success">
                          {bulkSuccess}
                        </p>
                      ) : null}
                      {bulkError ? (
                        <p className="sheet-error" data-testid="bulk-error">
                          {bulkError}
                        </p>
                      ) : null}
                    </div>
                  </form>
                )}
              </section>
            ) : null}
          </div>
        </section>
      </div>

      {activeFilterColumn && filterPopoverPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="sheet-filter-popover"
              ref={filterPopoverRef}
              data-testid={`filter-popover-${activeFilterColumn}`}
              style={{
                position: "fixed",
                top: filterPopoverPosition.top,
                left: filterPopoverPosition.left
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-filter-popover-head">
                <strong>{activeFilterColumn}</strong>
                <div className="sheet-filter-popover-actions">
                  {activeFilterRelation ? (
                    <button
                      type="button"
                      className="sheet-filter-clear-btn"
                      data-testid={`relation-expand-${activeFilterColumn}`}
                      onClick={() => openRelationDialogForColumn(activeFilterColumn)}
                    >
                      Expandir PK
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    data-testid={`filter-clear-${activeFilterColumn}`}
                    onClick={() => {
                      writeFilterSelection(activeFilterColumn, []);
                    }}
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <input
                className="sheet-filter-search"
                placeholder="Buscar valor..."
                value={filterPopoverSearch}
                data-testid={`filter-search-${activeFilterColumn}`}
                onChange={(event) => setFilterPopoverSearch(event.target.value)}
              />
              <div className="sheet-filter-options">
                {activeFilterOptions.length === 0 ? (
                  <p>Sem valores nesta pagina.</p>
                ) : (
                  activeFilterOptions.map((option) => {
                    const checked = activeFilterValues.includes(option.literal);

                    return (
                      <label key={option.literal} className="sheet-filter-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          data-testid={`filter-option-${activeFilterColumn}-${toTestIdFragment(option.literal)}`}
                          onChange={() => toggleFilterSelectionValue(activeFilterColumn, option.literal)}
                        />
                        <span title={option.label}>
                          {option.label} <em>({option.count})</em>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
      {modeloQuickCreateOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="modelo-create-overlay">
              <div className="sheet-focus-dialog is-compact" role="dialog" aria-modal="true" data-testid="modelo-create-dialog">
                <form className="sheet-form-panel-shell" onSubmit={handleModeloQuickCreate}>
                  <header className="sheet-focus-dialog-head">
                    <div>
                      <strong>Novo modelo</strong>
                      <p>Cadastre o modelo e continue no formulario do carro.</p>
                    </div>
                    <button
                      type="button"
                      className="sheet-filter-clear-btn"
                      onClick={() => {
                        if (modeloQuickCreateSubmitting) return;
                        setModeloQuickCreateOpen(false);
                        setModeloQuickCreateError(null);
                      }}
                      data-testid="modelo-create-close"
                    >
                      Fechar
                    </button>
                  </header>
                  <div className="sheet-focus-dialog-body">
                    <label className="sheet-form-field">
                      <span>modelo</span>
                      <input
                        ref={modeloQuickCreateInputRef}
                        type="text"
                        value={modeloQuickCreateValue}
                        onChange={(event) => setModeloQuickCreateValue(event.target.value)}
                        data-testid="modelo-create-input"
                        placeholder="Ex.: CROSSFOX"
                      />
                    </label>
                    {modeloQuickCreateError ? (
                      <p className="sheet-error" data-testid="modelo-create-error">
                        {modeloQuickCreateError}
                      </p>
                    ) : null}
                    <div className="sheet-form-topbar-actions">
                      <button
                        type="submit"
                        className="sheet-form-submit"
                        data-testid="modelo-create-submit"
                        disabled={modeloQuickCreateSubmitting}
                      >
                        {modeloQuickCreateSubmitting ? "Salvando..." : "Salvar modelo"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
      {relationDialog && typeof document !== "undefined"
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="relation-dialog-overlay">
              <div className="sheet-focus-dialog" role="dialog" aria-modal="true" data-testid="relation-dialog">
                <header className="sheet-focus-dialog-head">
                  <div>
                    <strong>Expandir PK/FK: {relationDialog.sourceColumn}</strong>
                    <p>Tabela de origem: {relationDialog.targetTable}</p>
                  </div>
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    onClick={() => setRelationDialog(null)}
                    data-testid="relation-dialog-close"
                  >
                    Fechar
                  </button>
                </header>
                <div className="sheet-focus-dialog-body">
                  {relationDialogLoading && !relationDialogPayload ? (
                    <p>Carregando colunas...</p>
                  ) : relationDialogPayload ? (
                    relationDialogPayload.header.map((columnName) => (
                      <button
                        key={columnName}
                        type="button"
                        className="sheet-focus-option"
                        data-testid={`relation-option-${relationDialog.sourceColumn}-${columnName}`}
                        onClick={() => selectDisplayColumnForRelation(columnName)}
                      >
                        {columnName}
                      </button>
                    ))
                  ) : (
                    <p>Sem dados para expandir.</p>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </main>
  );
}
