"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SHEET, SHEETS } from "@/components/ui-grid/config";
import {
  deleteSheetRow,
  fetchLookups,
  fetchSheetRows,
  runFinalize,
  runRebuild,
  upsertSheetRow
} from "@/components/ui-grid/api";
import type {
  GridFilters,
  GridListPayload,
  LookupsPayload,
  Role,
  SheetConfig,
  SheetKey,
  SortRule
} from "@/components/ui-grid/types";

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

type EventLog = {
  id: string;
  name: string;
  at: number;
  payload?: unknown;
};

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

function storageKey(sheet: SheetKey, kind: "filters" | "widths" | "hidden" | "sort") {
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

export function HolisticSheet() {
  const [activeSheetKey, setActiveSheetKey] = useState<SheetKey>(DEFAULT_SHEET.key);
  const [role, setRole] = useState<Role>("ADMINISTRADOR");

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
  const [lastRowAnchor, setLastRowAnchor] = useState<number | null>(null);

  const [hiddenRowsByTable, setHiddenRowsByTable] = useState<Record<string, string[]>>({});

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [repetidosByGroup, setRepetidosByGroup] = useState<Record<string, Array<Record<string, unknown>>>>({});

  const [eventLog, setEventLog] = useState<EventLog[]>([]);

  const [queueDepth, setQueueDepth] = useState(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const gridRef = useRef<HTMLDivElement>(null);

  const activeSheet = useMemo<SheetConfig>(() => SHEETS.find((sheet) => sheet.key === activeSheetKey) ?? DEFAULT_SHEET, [activeSheetKey]);

  const hiddenRows = useMemo(() => new Set(hiddenRowsByTable[activeSheetKey] ?? []), [activeSheetKey, hiddenRowsByTable]);

  const columns = useMemo(() => payload.header, [payload.header]);

  const viewRows = useMemo(() => {
    return payload.rows.filter((row) => {
      const rowId = String(row[activeSheet.primaryKey] ?? "");
      return !hiddenRows.has(rowId);
    });
  }, [activeSheet.primaryKey, hiddenRows, payload.rows]);

  const emitEvent = useCallback((name: string, payloadEvent?: unknown) => {
    setEventLog((prev) => [{ id: crypto.randomUUID(), name, at: Date.now(), payload: payloadEvent }, ...prev].slice(0, 24));
  }, []);

  function clearSelection() {
    setSelectedRows(new Set());
    setSelectedCells(new Set());
    setLastCellAnchor(null);
    setLastRowAnchor(null);
  }

  function persistSheetState(sheet: SheetKey, next: { filters: GridFilters; widths: Record<string, number>; sort: SortRule[] }) {
    writeStorage(storageKey(sheet, "filters"), next.filters);
    writeStorage(storageKey(sheet, "widths"), next.widths);
    writeStorage(storageKey(sheet, "sort"), next.sort);
  }

  const loadLookups = useCallback(async (currentRole: Role) => {
    try {
      const data = await fetchLookups(currentRole);
      setLookups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar lookups.");
    }
  }, []);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    setError(null);
    emitEvent("data:loading", { table: activeSheetKey, page, pageSize });

    try {
      const data = await fetchSheetRows({
        table: activeSheetKey,
        role,
        page,
        pageSize,
        query,
        matchMode,
        filters,
        sort: sortChain
      });

      setPayload(data);
      emitEvent("data:loaded", { table: activeSheetKey, count: data.rows.length, totalRows: data.totalRows });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar planilha.");
    } finally {
      setLoading(false);
    }
  }, [activeSheetKey, emitEvent, filters, matchMode, page, pageSize, query, role, sortChain]);

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
        role,
        row: {
          [activeSheet.primaryKey]: pkValue,
          [editingCell.column]: newValue
        }
      });
      emitEvent("grid:cell-edit-end", { table: activeSheet.key, pk: pkValue, column: editingCell.column });
    });

    setEditingCell(null);
  }

  function handleCellClick(rIdx: number, cIdx: number, event: React.MouseEvent) {
    const key = cellKey(rIdx, cIdx);

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
      emitEvent("selection:changed", { source: "range", cells: next.size });
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        emitEvent("selection:changed", { source: "toggle", cells: next.size });
        return next;
      });
      setLastCellAnchor({ rIdx, cIdx });
      return;
    }

    setSelectedCells(new Set([key]));
    setLastCellAnchor({ rIdx, cIdx });
    emitEvent("selection:changed", { source: "single", cells: 1 });
  }

  function handleRowToggle(rowIndex: number, rowId: string, event: React.MouseEvent) {
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
      emitEvent("selection:changed", { source: "row-range", rows: next.size });
      return;
    }

    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      emitEvent("selection:changed", { source: "row-toggle", rows: next.size });
      return next;
    });

    setLastRowAnchor(rowIndex);
  }

  function handleSelectAllCycle() {
    const visibleIds = viewRows.map((row) => String(row[activeSheet.primaryKey] ?? ""));

    if (visibleIds.length === 0) {
      setSelectedRows(new Set());
      return;
    }

    if (selectedRows.size === 0) {
      const all = new Set(visibleIds);
      setSelectedRows(all);
      emitEvent("selection:changed", { source: "all", rows: all.size });
      return;
    }

    if (selectedRows.size === visibleIds.length) {
      const inverted = new Set<string>();
      for (const rowId of visibleIds) {
        if (!selectedRows.has(rowId)) {
          inverted.add(rowId);
        }
      }
      setSelectedRows(inverted);
      emitEvent("selection:changed", { source: "invert", rows: inverted.size });
      return;
    }

    setSelectedRows(new Set());
    emitEvent("selection:changed", { source: "clear", rows: 0 });
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

      emitEvent("view:updated", { sort: next });
      persistSheetState(activeSheetKey, { filters, widths: columnWidths, sort: next });
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

        values.push(toEditable(row[col]));
      }

      lines.push(values.join("\t"));
    }

    await writeClipboard(lines.join("\n"));
    emitEvent("grid:copy", { cells: selectedCells.size });
  }

  async function handlePasteSelection() {
    if (!navigator.clipboard?.readText || !lastCellAnchor) return;

    const text = await navigator.clipboard.readText();
    if (!text) return;

    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.split("\t"));

    const patchByRow = new Map<string, Record<string, unknown>>();

    for (let r = 0; r < matrix.length; r += 1) {
      const rowIndex = lastCellAnchor.rIdx + r;
      const targetRow = viewRows[rowIndex];
      if (!targetRow) continue;

      const rowId = String(targetRow[activeSheet.primaryKey] ?? "");
      if (!rowId) continue;

      const patch = patchByRow.get(rowId) ?? { [activeSheet.primaryKey]: rowId };

      for (let c = 0; c < matrix[r].length; c += 1) {
        const colIndex = lastCellAnchor.cIdx + c;
        const column = columns[colIndex];
        if (!column) continue;
        if (activeSheet.lockedColumns.includes(column) || activeSheet.readOnly) continue;

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
        await upsertSheetRow({ table: activeSheet.key, role, row: patch });
      });
    }

    emitEvent("grid:paste", { rows: patchByRow.size });
  }

  async function handleDeleteSelected() {
    if (activeSheet.readOnly || selectedRows.size === 0) return;
    const sure = window.confirm(`Remover ${selectedRows.size} registro(s) da planilha ${activeSheet.label}?`);
    if (!sure) return;

    const ids = Array.from(selectedRows);

    for (const id of ids) {
      enqueuePersistence(async () => {
        await deleteSheetRow({ table: activeSheet.key, id, role });
      });
    }

    clearSelection();
    await queueRef.current;
    await loadGrid();
  }

  async function handleInsertRow() {
    if (activeSheet.readOnly) return;

    if (!lookups) {
      setError("Lookups ainda nao carregadas.");
      return;
    }

    let row: Record<string, unknown> | null = null;

    if (activeSheet.key === "modelos") {
      row = {
        modelo: `NOVO MODELO ${new Date().getTime().toString().slice(-4)}`
      };
    }

    if (activeSheet.key === "carros") {
      const modelSeed = await fetchSheetRows({
        table: "modelos",
        role,
        page: 1,
        pageSize: 1,
        query: "",
        matchMode: "contains",
        filters: {},
        sort: []
      });

      if (!modelSeed.rows[0]?.id) {
        setError("Crie ao menos um modelo antes de inserir carros.");
        return;
      }

      const firstLocation = lookups.locations[0]?.code;
      const firstSaleStatus = lookups.sale_statuses[0]?.code;

      if (!firstLocation || !firstSaleStatus) {
        setError("Lookups de local/status de venda nao disponiveis.");
        return;
      }

      row = {
        placa: `NOV${Date.now().toString().slice(-5)}`,
        modelo_id: modelSeed.rows[0].id,
        local: firstLocation,
        estado_venda: firstSaleStatus,
        em_estoque: true,
        data_entrada: new Date().toISOString(),
        nome: "Novo carro"
      };
    }

    if (activeSheet.key === "anuncios") {
      const carSeed = await fetchSheetRows({
        table: "carros",
        role,
        page: 1,
        pageSize: 1,
        query: "",
        matchMode: "contains",
        filters: {},
        sort: []
      });

      if (!carSeed.rows[0]?.id) {
        setError("Crie ao menos um carro antes de inserir anuncios.");
        return;
      }

      const firstAnnouncementStatus = lookups.announcement_statuses[0]?.code;
      if (!firstAnnouncementStatus) {
        setError("Lookup de status de anuncio nao disponivel.");
        return;
      }

      row = {
        target_id: carSeed.rows[0].id,
        estado_anuncio: firstAnnouncementStatus,
        valor_anuncio: null
      };
    }

    if (!row) {
      setError("Insercao nao suportada para esta planilha.");
      return;
    }

    await upsertSheetRow({ table: activeSheet.key, role, row });
    await loadGrid();
  }

  async function handleFinalizeSelected() {
    if (activeSheet.key !== "carros" || selectedRows.size === 0) return;

    const ids = Array.from(selectedRows);
    for (const id of ids) {
      enqueuePersistence(async () => {
        await runFinalize(id, role);
      });
    }

    clearSelection();
    await queueRef.current;
    await loadGrid();
  }

  async function handleRebuild() {
    await runRebuild(role);
    await loadGrid();
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
      role,
      page: 1,
      pageSize: 200,
      query: "",
      matchMode: "contains",
      filters: { grupo_id: `=${groupId}` },
      sort: []
    });

    setRepetidosByGroup((prev) => ({ ...prev, [groupId]: response.rows }));
  }

  function startResize(column: string, event: React.MouseEvent) {
    event.preventDefault();
    setResizeState({
      column,
      startX: event.clientX,
      startWidth: columnWidths[column] ?? 160
    });
  }

  function moveCellSelectionBy(dr: number, dc: number, withRange: boolean) {
    const source = lastCellAnchor ?? { rIdx: 0, cIdx: 0 };
    const nextRow = Math.max(0, Math.min(viewRows.length - 1, source.rIdx + dr));
    const nextCol = Math.max(0, Math.min(columns.length - 1, source.cIdx + dc));

    if (withRange && lastCellAnchor) {
      const next = new Set<string>();
      const rMin = Math.min(lastCellAnchor.rIdx, nextRow);
      const rMax = Math.max(lastCellAnchor.rIdx, nextRow);
      const cMin = Math.min(lastCellAnchor.cIdx, nextCol);
      const cMax = Math.max(lastCellAnchor.cIdx, nextCol);

      for (let r = rMin; r <= rMax; r += 1) {
        for (let c = cMin; c <= cMax; c += 1) {
          next.add(cellKey(r, c));
        }
      }
      setSelectedCells(next);
    } else {
      setSelectedCells(new Set([cellKey(nextRow, nextCol)]));
      setLastCellAnchor({ rIdx: nextRow, cIdx: nextCol });
    }

    const cell = document.getElementById(`grid-cell-${activeSheet.key}-${nextRow}-${nextCol}`);
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const storedFilters = readStorage<GridFilters>(storageKey(activeSheetKey, "filters"), {});
    const storedWidths = readStorage<Record<string, number>>(storageKey(activeSheetKey, "widths"), {});
    const storedHidden = readStorage<string[]>(storageKey(activeSheetKey, "hidden"), []);
    const storedSort = readStorage<SortRule[]>(storageKey(activeSheetKey, "sort"), []);

    setFilters(storedFilters);
    setColumnWidths(storedWidths);
    setSortChain(storedSort);
    setHiddenRowsByTable((prev) => ({ ...prev, [activeSheetKey]: storedHidden }));

    setPage(1);
    setExpandedGroupIds(new Set());
    setRepetidosByGroup({});
    clearSelection();
  }, [activeSheetKey]);

  useEffect(() => {
    void loadLookups(role);
  }, [loadLookups, role]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  useEffect(() => {
    if (!resizeState) return;
    const currentResize = resizeState;

    function onMouseMove(event: MouseEvent) {
      setColumnWidths((prev) => {
        const width = Math.max(80, currentResize.startWidth + (event.clientX - currentResize.startX));
        const next = { ...prev, [currentResize.column]: width };
        return next;
      });
    }

    function onMouseUp() {
      setResizeState(null);
      setColumnWidths((prev) => {
        writeStorage(storageKey(activeSheetKey, "widths"), prev);
        emitEvent("view:updated", { columnWidths: prev });
        return prev;
      });
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [activeSheetKey, emitEvent, resizeState]);

  useEffect(() => {
    persistSheetState(activeSheetKey, { filters, widths: columnWidths, sort: sortChain });
  }, [activeSheetKey, filters, columnWidths, sortChain]);

  return (
    <main className="sheet-shell">
      <section className="sheet-topbar">
        <div className="sheet-title-wrap">
          <span className="sheet-badge">UI_GRID Framework</span>
          <h1>Emulador de Planilhas Operacionais</h1>
          <p>Interacoes de planilha traduzidas em operacoes reais no back-end serverless.</p>
        </div>

        <div className="sheet-actions-row">
          <div className="sheet-tabs" role="tablist" aria-label="Planilhas">
            {SHEETS.map((sheet) => (
              <button
                key={sheet.key}
                type="button"
                className={`sheet-tab ${sheet.key === activeSheet.key ? "is-active" : ""}`}
                onClick={() => setActiveSheetKey(sheet.key)}
              >
                {sheet.label}
              </button>
            ))}
          </div>

          <div className="sheet-toolbar-controls">
            <label className="sheet-inline-field">
              Perfil
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="VENDEDOR">VENDEDOR</option>
                <option value="SECRETARIO">SECRETARIO</option>
                <option value="GERENTE">GERENTE</option>
                <option value="ADMINISTRADOR">ADMINISTRADOR</option>
              </select>
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
            <button type="button" className="btn" onClick={() => void loadGrid()}>
              Recarregar
            </button>
          </div>

          <div className="sheet-toolbar-controls">
            <button type="button" className="btn" onClick={handleSelectAllCycle}>
              Selecionar ciclo
            </button>
            <button type="button" className="btn" onClick={toggleHideSelected}>
              {selectedRows.size > 0 ? "Ocultar selecionadas" : hiddenRows.size > 0 ? "Mostrar ocultas" : "Ocultar/Mostrar"}
            </button>
            <button type="button" className="btn" onClick={() => void handleInsertRow()} disabled={activeSheet.readOnly}>
              Inserir linha
            </button>
            <button type="button" className="btn" onClick={() => void handleDeleteSelected()} disabled={activeSheet.readOnly}>
              Excluir selecionadas
            </button>
            {activeSheet.key === "carros" ? (
              <button type="button" className="btn" onClick={() => void handleFinalizeSelected()}>
                Finalizar selecionado
              </button>
            ) : null}
            {activeSheet.key === "grupos_repetidos" || activeSheet.key === "repetidos" ? (
              <button type="button" className="btn" onClick={() => void handleRebuild()}>
                Rebuild repetidos
              </button>
            ) : null}
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

      <section
        className="sheet-grid-container"
        ref={gridRef}
        tabIndex={0}
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

          if (event.key === "Enter" && lastCellAnchor) {
            event.preventDefault();
            const row = viewRows[lastCellAnchor.rIdx];
            const column = columns[lastCellAnchor.cIdx];
            const rowId = String(row?.[activeSheet.primaryKey] ?? "");
            if (!row || !column || activeSheet.readOnly || activeSheet.lockedColumns.includes(column)) return;
            setEditingCell({
              rowId,
              rowIndex: lastCellAnchor.rIdx,
              column,
              value: toEditable(row[column])
            });
            emitEvent("grid:cell-edit-start", { table: activeSheet.key, rowId, column });
          }
        }}
      >
        <table className="sheet-grid">
          <colgroup>
            <col style={{ width: 48 }} />
            {columns.map((column) => (
              <col key={column} style={{ width: columnWidths[column] ?? 180 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              {columns.map((column) => {
                const sortIndex = sortChain.findIndex((item) => item.column === column);
                const sortDir = sortIndex >= 0 ? sortChain[sortIndex].dir : null;

                return (
                  <th
                    key={column}
                    className={activeSheet.lockedColumns.includes(column) ? "is-locked" : ""}
                    onClick={(event) => toggleSort(column, event.shiftKey)}
                  >
                    <div className="sheet-th-content">
                      <span>{column}</span>
                      {sortDir ? <span className="sheet-sort-pill">{sortIndex + 1}:{sortDir === "asc" ? "▲" : "▼"}</span> : null}
                      <span className="sheet-resize-handle" onMouseDown={(event) => startResize(column, event)} />
                    </div>
                  </th>
                );
              })}
            </tr>
            <tr>
              <th />
              {columns.map((column) => (
                <th key={`filter-${column}`}>
                  <input
                    className="sheet-filter"
                    value={filters[column] ?? ""}
                    placeholder="filtrar"
                    onChange={(event) => {
                      const value = event.target.value;
                      setFilters((prev) => ({ ...prev, [column]: value }));
                      setPage(1);
                      clearSelection();
                      emitEvent("filters:changed", { col: column, value });
                    }}
                  />
                </th>
              ))}
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

                      return (
                        <td
                          id={`grid-cell-${activeSheet.key}-${rowIndex}-${colIndex}`}
                          key={`${rowId}-${column}`}
                          className={`${isSelectedCell ? "is-selected-cell" : ""} ${
                            activeSheet.lockedColumns.includes(column) ? "is-locked" : ""
                          }`.trim()}
                          title={toEditable(cellValue)}
                          onClick={(event) => handleCellClick(rowIndex, colIndex, event)}
                          onDoubleClick={() => {
                            if (activeSheet.readOnly || activeSheet.lockedColumns.includes(column)) return;
                            setEditingCell({
                              rowId,
                              rowIndex,
                              column,
                              value: toEditable(cellValue)
                            });
                            emitEvent("grid:cell-edit-start", { table: activeSheet.key, rowId, column });
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
                            <span>{toDisplay(cellValue, column)}</span>
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

      <section className="sheet-footer">
        <div className="sheet-pager">
          <button type="button" className="btn" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
            Anterior
          </button>
          <span>
            Pagina {page} de {Math.max(1, Math.ceil(payload.totalRows / pageSize))}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page >= Math.ceil(payload.totalRows / pageSize)}
          >
            Proxima
          </button>
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

        <div className="sheet-events">
          <strong>Event bus</strong>
          <ul>
            {eventLog.slice(0, 8).map((event) => (
              <li key={event.id}>
                [{new Date(event.at).toLocaleTimeString("pt-BR")}] {event.name}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
