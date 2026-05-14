"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AuditLogDashboard } from "@/components/audit/audit-log-dashboard";
import { DEFAULT_SHEET, SHEETS } from "@/components/ui-grid/config";
import { applyFrontFiltersAndSort, filterRowsByQuery } from "@/components/ui-grid/front-grid";
import { PrintHighlightEditor } from "@/components/ui-grid/print-highlight-editor";
import {
  ActionIcon,
  HolisticChooserDialog,
  IconButton,
  type HolisticChooserOption
} from "@/components/ui-grid/sheet-chrome";
import {
  executePreparedPrintJob,
  filterRowsByPrintFilters,
  matchesPrintHighlightRule,
  resolvePrintFilterLiteralsFromLabels
} from "@/components/ui-grid/print-job";
import {
  DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT,
  createPrintHighlightRule,
  isPrintHighlightRuleEmpty,
  normalizePrintHighlightRule,
  operatorNeedsValues,
  type PrintHighlightRule
} from "@/components/ui-grid/print-highlights";
import { CAR_COLOR_OPTIONS, normalizeCarColorValue } from "@/lib/domain/car-colors";
import {
  BULK_SEPARATOR_OPTIONS,
  buildFormValuesFromRow,
  buildInsertFormValues,
  coerceEditableValue,
  coerceFormValue,
  csvEscape,
  getFormFieldKind,
  isCarModelTextInput,
  parseBooleanLikeValue,
  splitBulkLineWithFallback,
  type BulkSeparator
} from "@/components/ui-grid/sheet-form";
import {
  comparePrintableValues,
  normalizeBulkToken,
  toDisplay,
  toEditable
} from "@/components/ui-grid/value-format";
import {
  deleteSheetRow,
  fetchCarroCaracteristicas,
  fetchLatestPriceChangeContext,
  fetchGridInsightsSummary,
  fetchLookups,
  fetchMissingAnuncioRows,
  fetchSheetRows,
  lookupCarByPlate,
  ApiClientError,
  runFinalize,
  runRebuild,
  syncCarroCaracteristicas,
  upsertSheetRow,
  verifyAnuncioInsight
} from "@/components/ui-grid/api";
import type {
  CarFormSectionKey,
  CurrentActor,
  GridFilters,
  GridListPayload,
  MobileBodyScrollLockSnapshot,
  PrintableSectionOption,
  PrintScope,
  PrintSortDirection,
  RelationDialogTarget,
  RequestAuth,
  ResizeState,
  SheetConfig,
  SheetKey,
  SortRule,
  SplitResizeState,
  StoredGridScroll,
  StoredSelectionModes,
  StoredPrintConfig,
  StoredSheetLayout,
  StoredSheetPagination,
  StoredWorkspacePanels
} from "@/components/ui-grid/types";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { hasRequiredRole } from "@/lib/domain/access";
import { installMojibakeSanitizer } from "@/lib/ux/mojibake";
import { useGridDataSource } from "@/components/ui-grid/hooks/useGridDataSource";
import { useGridMutations } from "@/components/ui-grid/hooks/useGridMutations";
import { useGridFiltersAndSort } from "@/components/ui-grid/hooks/useGridFiltersAndSort";
import { useGridSelection } from "@/components/ui-grid/hooks/useGridSelection";
import { useGridPrintExport } from "@/components/ui-grid/hooks/useGridPrintExport";
import { useGridNavigationLayout } from "@/components/ui-grid/hooks/useGridNavigationLayout";
import { readCarFormSectionsStorage, useGridCarFormState } from "@/components/ui-grid/hooks/useGridCarFormState";
import { useGridPriceContextDialogs } from "@/components/ui-grid/hooks/useGridPriceContextDialogs";
import { useGridAnuncioInsights } from "@/components/ui-grid/hooks/useGridAnuncioInsights";
import { useGridScrollSync } from "@/components/ui-grid/hooks/useGridScrollSync";
import { cellKey, parseCellKey, useGridKeyboardSelection } from "@/components/ui-grid/hooks/useGridKeyboardSelection";
import { useGridDrawerState } from "@/components/ui-grid/hooks/useGridDrawerState";
import {
  normalizeWorkspacePanels,
  persistPaginationState,
  persistSelectionModes,
  persistSheetState,
  persistWorkspacePanels,
  readStorage,
  storageKey,
  writeStorage
} from "@/components/ui-grid/hooks/useGridStoredState";
import { ToolbarSection } from "@/components/ui-grid/sections/toolbar-section";
import { GridTableBodySection } from "@/components/ui-grid/sections/table-body";
import { GridSidePanelsSection } from "@/components/ui-grid/sections/sidepanels";
import { GridDrawersSection } from "@/components/ui-grid/sections/drawers";
import styles from "@/components/ui-grid/ui-grid.module.css";
import {
  EMPTY_FILTER_LITERAL,
  buildRepeatedPriceBucketKey,
  buildRepeatedPriceBucketLabel,
  buildRelationDisplayLookup,
  buildColumnFilterOptions,
  compareRepeatedVehicleReferencePriority,
  getDateSelectionBounds,
  RELATION_BY_SHEET_COLUMN,
  resolveDisplayValueFromLookup,
  selectDateFilterRange,
  toFilterSelectionLabel
} from "@/components/ui-grid/core/grid-rules";

// Ensure any accidental mojibake in labels/glyphs is sanitized on the client
if (typeof window !== "undefined") {
  installMojibakeSanitizer();
}


export type AuditDashboardFilterDefaults = {
  acao?: string;
  autor?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  searchMode?: "search" | "contains" | "exact" | "starts" | "ends";
  tabela?: string;
};

type HolisticSheetProps = {
  actor: CurrentActor;
  accessToken: string | null;
  initialAuditFilters?: AuditDashboardFilterDefaults;
  initialSheetKey?: SheetKey;
  devRole?: CurrentActor["role"] | null;
  onSignOut: () => void | Promise<void>;
};

const CAR_FORM_PRIORITY_COLUMNS = ["placa", "local", "preco_original", "chassi", "modelo_id"] as const;

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
const GRID_FETCH_BATCH_SIZE = 200;

const PRINT_SCOPE_OPTIONS: Array<{ value: PrintScope; label: string }> = [
  { value: "table", label: "Tabela completa" },
  { value: "filtered", label: "Tabela filtrada" },
  { value: "selected", label: "Somente linhas selecionadas" }
];

const PRINT_SORT_DIRECTION_OPTIONS: Array<{ value: PrintSortDirection; label: string }> = [
  { value: "asc", label: "Crescente" },
  { value: "desc", label: "Decrescente" }
];


function buildOptionLabelMap(options: Array<{ value?: unknown; label?: unknown }>) {
  const map: Record<string, string> = {};

  for (const option of options) {
    if (option?.value == null) continue;
    map[String(option.value)] = String(option.label ?? option.value);
  }

  return map;
}

function compareNullableNumbersAsc(left: number | null | undefined, right: number | null | undefined) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function isDateFilterLiteral(literal: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(literal);
}

function toTestIdFragment(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

function isMobileSheetLayout() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

type PopoverViewportPosition = {
  top: number;
  left: number;
  maxHeight: number;
};

function resolvePopoverViewportPosition(rect: DOMRect, width = 280, estimatedHeight = 360): PopoverViewportPosition {
  const margin = 8;
  const gap = 8;
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const availableWidth = Math.max(120, viewportWidth - margin * 2);
  const popoverWidth = Math.min(width, availableWidth);
  const left = Math.max(margin, Math.min(rect.left, viewportWidth - popoverWidth - margin));
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - margin);
  const spaceAbove = Math.max(0, rect.top - gap - margin);
  const desiredHeight = Math.min(estimatedHeight, Math.max(96, viewportHeight - margin * 2));
  const placeAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
  const availableHeight = Math.max(96, Math.min(placeAbove ? spaceAbove : spaceBelow, viewportHeight - margin * 2));
  const maxHeight = Math.min(desiredHeight, availableHeight);
  const preferredTop = placeAbove ? rect.top - gap - maxHeight : rect.bottom + gap;
  const top = Math.max(margin, Math.min(preferredTop, viewportHeight - maxHeight - margin));

  return { top, left, maxHeight };
}

function joinCompactLabels(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" • ");
}

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  area.focus({ preventScroll: true });
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

function focusWithoutScroll(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
}

function focusAndSelectWithoutScroll(element: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  if (typeof element.setSelectionRange === "function") {
    element.setSelectionRange(0, element.value.length);
  }
}

function buildMobileBodyScrollLockSnapshot(): MobileBodyScrollLockSnapshot {
  return {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
    scrollLeft: window.scrollX,
    scrollTop: window.scrollY
  };
}

export function HolisticSheet({
  actor,
  accessToken,
  initialAuditFilters,
  initialSheetKey,
  devRole = null,
  onSignOut
}: HolisticSheetProps) {
  const router = useRouter();
  const [activeSheetKey, setActiveSheetKey] = useState<SheetKey>(initialSheetKey ?? DEFAULT_SHEET.key);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = actor.role;
  const requestAuth = useMemo<RequestAuth>(
    () => ({
      accessToken,
      devRole
    }),
    [accessToken, devRole]
  );

  // TEMP(domínio: carregamento/refresh)
  const { payload, setPayload, lookups, setLookups, tableInsightsBySheet, setTableInsightsBySheet, loading, setLoading, error, setError } = useGridDataSource();

  // TEMP(domínio: filtros/sort)
  const { queryInput, setQueryInput, query, setQuery, matchMode, setMatchMode, filters, setFilters, sortChain, setSortChain } = useGridFiltersAndSort();

  const { page, setPage, pageSize, setPageSize, showGridPanel, setShowGridPanel, showFormPanel, setShowFormPanel, secondaryGrid, setSecondaryGrid, secondaryGridChooserOpen, setSecondaryGridChooserOpen, activeRightTab, setActiveRightTab, splitRatio, setSplitRatio, splitResizeState, setSplitResizeState } =
    useGridNavigationLayout();

  // TEMP(domínio: seleção)
  const gridSelection = useGridSelection();
  const {
    selectionModes,
    setSelectionModes,
    selectedRows,
    setSelectedRows,
    selectedCells,
    lastClickedRowId,
    selectCycleMode,
    setSelectCycleMode
  } = gridSelection;

  const [hiddenRowsByTable, setHiddenRowsByTable] = useState<Record<string, string[]>>({});
  const [conferenceRowsByTable, setConferenceRowsByTable] = useState<Partial<Record<SheetKey, string[]>>>({});
  const [sheetLayoutByTable, setSheetLayoutByTable] = useState<Partial<Record<SheetKey, StoredSheetLayout>>>({});
  const [hydratedSheetStateKey, setHydratedSheetStateKey] = useState<SheetKey | null>(null);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const blockSortClickRef = useRef(false);

  // TEMP(domínio: edição de célula)
  const { editingCell, setEditingCell, massUpdateDialogOpen, setMassUpdateDialogOpen, massUpdateColumn, setMassUpdateColumn, massUpdateValue, setMassUpdateValue, massUpdateClearValue, setMassUpdateClearValue, massUpdateSubmitting, setMassUpdateSubmitting, massUpdateError, setMassUpdateError } = useGridMutations();

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [repetidosByGroup, setRepetidosByGroup] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [loadingRepeatedGroupIds, setLoadingRepeatedGroupIds] = useState<Set<string>>(new Set());

  const [queueDepth, setQueueDepth] = useState(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const plateFieldRef = useRef<HTMLInputElement | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [filterPopoverColumn, setFilterPopoverColumn] = useState<string | null>(null);
  const [filterPopoverSearch, setFilterPopoverSearch] = useState("");
  const [filterDraftValues, setFilterDraftValues] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<PopoverViewportPosition | null>(null);
  const printFilterPopoverRef = useRef<HTMLDivElement>(null);
  const printFilterTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [relationCache, setRelationCache] = useState<Partial<Record<SheetKey, GridListPayload>>>({});
  const {
    activeFiltersDialogOpen,
    closeGridDrawers,
    hiddenColumnsDialogOpen,
    relationDialog,
    relationDialogLoading,
    selectionDialogOpen,
    setActiveFiltersDialogOpen,
    setHiddenColumnsDialogOpen,
    setRelationDialog,
    setRelationDialogLoading,
    setSelectionDialogOpen
  } = useGridDrawerState();
  // TEMP(domínio: ações de impressão)
  const {
    printDialogOpen,
    setPrintDialogOpen,
    printTitle,
    setPrintTitle,
    printScope,
    setPrintScope,
    printColumns,
    setPrintColumns,
    printColumnLabels,
    setPrintColumnLabels,
    printFilters,
    setPrintFilters,
    printDisplayColumnOverrides,
    setPrintDisplayColumnOverrides,
    printSortColumn,
    setPrintSortColumn,
    printSortDirection,
    setPrintSortDirection,
    printSectionColumn,
    setPrintSectionColumn,
    printSectionValues,
    setPrintSectionValues,
    printIncludeOthers,
    setPrintIncludeOthers,
    printHighlightOpacityPercent,
    setPrintHighlightOpacityPercent,
    printHighlightRules,
    setPrintHighlightRules,
    printSubmitting,
    setPrintSubmitting,
    quickPrintSubmitting,
    setQuickPrintSubmitting,
    printError,
    setPrintError,
    printFilterPopoverColumn,
    setPrintFilterPopoverColumn,
    printFilterPopoverSearch,
    setPrintFilterPopoverSearch,
    printFilterDraftValues,
    setPrintFilterDraftValues,
    printFilterDateFrom,
    setPrintFilterDateFrom,
    printFilterDateTo,
    setPrintFilterDateTo,
    printFilterPopoverPosition,
    setPrintFilterPopoverPosition,
    displayColumnBySheet,
    setDisplayColumnBySheet
  } = useGridPrintExport();
  const {
    formMode,
    setFormMode,
    editingRowId,
    setEditingRowId,
    formValues,
    setFormValues,
    pricePreviewColumn,
    setPricePreviewColumn,
    pricePreviewText,
    setPricePreviewText,
    pricePreviewLoading,
    setPricePreviewLoading,
    pricePreviewError,
    setPricePreviewError,
    formError,
    setFormError,
    formInfo,
    setFormInfo,
    formBooting,
    setFormBooting,
    formSubmitting,
    setFormSubmitting,
    carFeatureSearch,
    setCarFeatureSearch,
    carFeatureError,
    setCarFeatureError,
    carFeatureLoading,
    setCarFeatureLoading,
    carFeatureOptionsReady,
    setCarFeatureOptionsReady,
    carFeatureSelectionsReady,
    setCarFeatureSelectionsReady,
    selectedVisualFeatureIds,
    setSelectedVisualFeatureIds,
    selectedTechnicalFeatureIds,
    setSelectedTechnicalFeatureIds,
    featureQuickCreateOpen,
    setFeatureQuickCreateOpen,
    featureQuickCreateKind,
    setFeatureQuickCreateKind,
    featureQuickCreateValue,
    setFeatureQuickCreateValue,
    featureQuickCreateError,
    setFeatureQuickCreateError,
    featureQuickCreateSubmitting,
    setFeatureQuickCreateSubmitting,
    carFormSectionsOpen,
    setCarFormSectionsOpen,
    plateLookupSubmitting,
    setPlateLookupSubmitting,
    modeloQuickCreateOpen,
    setModeloQuickCreateOpen,
    modeloQuickCreateValue,
    setModeloQuickCreateValue,
    modeloQuickCreateError,
    setModeloQuickCreateError,
    modeloQuickCreateSubmitting,
    setModeloQuickCreateSubmitting,
    bulkSeparator,
    setBulkSeparator,
    bulkRawText,
    setBulkRawText,
    bulkError,
    setBulkError,
    bulkSuccess,
    setBulkSuccess,
    bulkSubmitting,
    setBulkSubmitting
  } = useGridCarFormState();
  const splitResizeRef = useRef<SplitResizeState | null>(null);
  const formOpenRequestRef = useRef(0);
  const secondaryGridRequestRef = useRef(0);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const bulkTextareaRef = useRef<HTMLTextAreaElement>(null);
  const modeloQuickCreateInputRef = useRef<HTMLInputElement>(null);
  const featureQuickCreateInputRef = useRef<HTMLInputElement>(null);
  const mobileBodyScrollLockRef = useRef<MobileBodyScrollLockSnapshot | null>(null);
  const mobileBodyScrollRestoreRef = useRef<StoredGridScroll | null>(null);
  const mobileBodyScrollRestoreFrameRef = useRef<number | null>(null);

  const captureMobileBodyScrollPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isMobileSheetLayout()) return;
    if (showFormPanel && !showGridPanel) return;

    const snapshot = buildMobileBodyScrollLockSnapshot();
    mobileBodyScrollLockRef.current = snapshot;
    mobileBodyScrollRestoreRef.current = {
      left: snapshot.scrollLeft,
      top: snapshot.scrollTop
    };
  }, [showFormPanel, showGridPanel]);

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
  const canVerifyAnuncioInsight = activeSheet.key === "anuncios" && hasRequiredRole(role, "VENDEDOR");
  const canRebuildRepetidos = hasRequiredRole(role, "GERENTE");
  const isAuditDashboardSheet = activeSheet.key === "log_alteracoes";

  useEffect(() => {
    if (visibleSheets.some((sheet) => sheet.key === activeSheetKey)) return;
    setActiveSheetKey(fallbackSheet.key);
  }, [activeSheetKey, fallbackSheet.key, visibleSheets]);

  useEffect(() => {
    if (!isAuditDashboardSheet) return;
    setShowGridPanel(true);
    setShowFormPanel(false);
  }, [isAuditDashboardSheet, setShowFormPanel, setShowGridPanel]);

  useEffect(() => {
    if (!modeloQuickCreateOpen) return;

    const timeout = window.setTimeout(() => {
      focusAndSelectWithoutScroll(modeloQuickCreateInputRef.current);
    }, 30);

    return () => window.clearTimeout(timeout);
  }, [modeloQuickCreateOpen]);

  useEffect(() => {
    if (!featureQuickCreateOpen) return;

    const timeout = window.setTimeout(() => {
      focusAndSelectWithoutScroll(featureQuickCreateInputRef.current);
    }, 30);

    return () => window.clearTimeout(timeout);
  }, [featureQuickCreateOpen]);

  const hiddenRows = useMemo(() => new Set(hiddenRowsByTable[activeSheetKey] ?? []), [activeSheetKey, hiddenRowsByTable]);
  const activeSheetLayout = useMemo<StoredSheetLayout>(
    () => sheetLayoutByTable[activeSheet.key] ?? { hiddenColumns: [], pinnedColumn: null },
    [activeSheet.key, sheetLayoutByTable]
  );
  const hiddenColumnSet = useMemo(() => new Set(activeSheetLayout.hiddenColumns), [activeSheetLayout.hiddenColumns]);
  const pinnedColumn = activeSheetLayout.pinnedColumn;
  const payloadMatchesActiveSheet = payload.table === activeSheet.key;
  const allColumns = useMemo(() => (payloadMatchesActiveSheet ? payload.header : []), [payload.header, payloadMatchesActiveSheet]);
  const formColumnCandidates = useMemo(() => {
    if (!payloadMatchesActiveSheet) return [];
    return payload.formColumns && payload.formColumns.length > 0 ? payload.formColumns : allColumns;
  }, [allColumns, payload.formColumns, payloadMatchesActiveSheet]);
  const columns = useMemo(() => {
    const visibleColumns = allColumns.filter((column) => !hiddenColumnSet.has(column));
    if (!pinnedColumn || !visibleColumns.includes(pinnedColumn)) {
      return visibleColumns;
    }

    return [pinnedColumn, ...visibleColumns.filter((column) => column !== pinnedColumn)];
  }, [allColumns, hiddenColumnSet, pinnedColumn]);
  const printColumnReferenceOrder = useMemo(
    () => [...columns, ...allColumns.filter((column) => !columns.includes(column))],
    [allColumns, columns]
  );
  const isActiveSheetStateHydrated = hydratedSheetStateKey === activeSheetKey;
  const conferenceMarkedRows = useMemo(
    () => new Set(conferenceRowsByTable[activeSheetKey] ?? []),
    [activeSheetKey, conferenceRowsByTable]
  );
  const isConferenceMode = selectionModes.conference;
  const isEditorMode = selectionModes.editor;

  const rawGridRows = useMemo(() => {
    if (!payloadMatchesActiveSheet) return [];
    return payload.rows.filter((row) => {
      const rowId = String(row[activeSheet.primaryKey] ?? "");
      return !hiddenRows.has(rowId);
    });
  }, [activeSheet.primaryKey, hiddenRows, payload.rows, payloadMatchesActiveSheet]);
  const relationForActiveSheet = useMemo(() => RELATION_BY_SHEET_COLUMN[activeSheet.key] ?? {}, [activeSheet.key]);
  const displayColumnOverrides = useMemo(() => displayColumnBySheet[activeSheet.key] ?? {}, [activeSheet.key, displayColumnBySheet]);
  const relationDisplayLookup = useMemo(
    () => buildRelationDisplayLookup(activeSheet.key, displayColumnOverrides, relationCache),
    [activeSheet.key, displayColumnOverrides, relationCache]
  );
  const printRelationDisplayLookup = useMemo(
    () => buildRelationDisplayLookup(activeSheet.key, printDisplayColumnOverrides, relationCache),
    [activeSheet.key, printDisplayColumnOverrides, relationCache]
  );
  const resolveDisplayValue = useCallback(
    (row: Record<string, unknown>, column: string) => resolveDisplayValueFromLookup(row, column, relationDisplayLookup),
    [relationDisplayLookup]
  );
  const resolvePrintDisplayValue = useCallback(
    (row: Record<string, unknown>, column: string) => resolveDisplayValueFromLookup(row, column, printRelationDisplayLookup),
    [printRelationDisplayLookup]
  );
  const normalizeNum = useCallback((value: unknown) => {
    if (value == null || value === "") return null as number | null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const n = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }, []);
  const fmtCurrency = useMemo(() => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }), []);

  const {
    priceContextOpen,
    priceContextHint,
    priceContextOld,
    priceContextNew,
    priceContextText,
    setPriceContextText,
    priceContextTextareaRef,
    askPriceChangeContext,
    submitPriceContext,
    cancelPriceContext,
    priceContextsOpen,
    setPriceContextsOpen,
    priceContextsLoading,
    priceContextsError,
    priceContextsRows,
    priceContextsPage,
    setPriceContextsPage,
    priceContextsPageSize,
    setPriceContextsPageSize,
    priceContextsColumn,
    priceContextsRowId,
    openPriceContextsPanel,
    loadPriceContexts
  } = useGridPriceContextDialogs({
    activeSheetKey: activeSheet.key,
    editingRowId,
    formMode,
    requestAuth
  });

  // TEMP(domínio: insights)
  // Anuncio insights panel
  const {
    activeAnuncioInsight,
    anuncioInsightHeaderTargetRowId,
    anuncioInsights,
    anuncioInsightsError,
    anuncioInsightsLoading,
    anuncioInsightsOpen,
    anuncioInsightsRowId,
    insightDialogRowId,
    openAnuncioInsightsPanel,
    setAnuncioInsightsError,
    setAnuncioInsightsOpen
  } = useGridAnuncioInsights({
    activeSheetKey: activeSheet.key,
    activeSheetPrimaryKey: activeSheet.primaryKey,
    currencyFormatter: fmtCurrency,
    editingRowId,
    lastClickedRowId,
    normalizeNum,
    payloadMatchesActiveSheet,
    payloadRows: payload.rows,
    requestAuth,
    selectedRows
  });

  useEffect(() => {
    if (activeRightTab === "grid" && !secondaryGrid) {
      setActiveRightTab(showFormPanel ? "form" : null);
      return;
    }
    if (activeRightTab === "form" && !showFormPanel) {
      setActiveRightTab(secondaryGrid ? "grid" : null);
      return;
    }
    if (!activeRightTab) {
      if (secondaryGrid) {
        setActiveRightTab("grid");
      } else if (showFormPanel) {
        setActiveRightTab("form");
      }
    }
  }, [activeRightTab, secondaryGrid, setActiveRightTab, showFormPanel]);
    // Atualiza o resumo quando há exatamente 1 linha selecionada em ANUNCIOS (grid header)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function upsertRowWithPriceContext(params: { table: string; row: Record<string, unknown> }) {
    let priceChangeContext: string | null = null;
    const hasCarPrice = params.table === "carros" && Object.prototype.hasOwnProperty.call(params.row, "preco_original");
    const hasAdPrice = params.table === "anuncios" && Object.prototype.hasOwnProperty.call(params.row, "valor_anuncio");
    if (hasCarPrice || hasAdPrice) {
      const hint = hasCarPrice ? "Explique a alteração de preço do carro" : "Explique a alteração de preço do anúncio";
      const input = typeof window !== "undefined" ? window.prompt(`${hint}:`) : null;
      if (!input || !input.trim()) {
        throw new Error("Contexto de alteração de preço é obrigatório.");
      }
      priceChangeContext = input.trim();
    }
    return upsertSheetRow({ table: params.table as SheetKey, requestAuth, row: params.row, priceChangeContext });
  }

  // Versão segura: solicita contexto somente quando a API exigir e via formulário focado
  async function upsertRowWithPriceContextSafe(params: { table: string; row: Record<string, unknown> }) {
    try {
      return await upsertSheetRow({
        table: params.table as SheetKey,
        requestAuth,
        row: params.row,
        priceChangeContext: null
      });
    } catch (err) {
      const isApiErr = err instanceof ApiClientError;
      const code = isApiErr ? err.code : undefined;
      if (code !== "PRICE_CHANGE_CONTEXT_REQUIRED") throw err;

      const hasCarPrice = params.table === "carros" && Object.prototype.hasOwnProperty.call(params.row, "preco_original");
      const hasAdPrice = params.table === "anuncios" && Object.prototype.hasOwnProperty.call(params.row, "valor_anuncio");
      const hint = hasCarPrice
        ? "Explique a alteração de preço do carro"
        : hasAdPrice
          ? "Explique a alteração de preço do anúncio"
          : "Explique a alteração de preço";

      // Best-effort: exibir valores (antigo → novo) quando possível
      let oldValue: number | null = null;
      let newValue: number | null = null;
      const pk = String(params.row[activeSheet.primaryKey as keyof typeof params.row] ?? "").trim();
      if (pk) {
        const oldRow = payload.rows.find((r) => String(r[activeSheet.primaryKey] ?? "") === pk) as
          | Record<string, unknown>
          | undefined;
        if (hasCarPrice) {
          oldValue = normalizeNum(oldRow?.["preco_original"]);
          newValue = normalizeNum(params.row["preco_original"]);
        } else if (hasAdPrice) {
          oldValue = normalizeNum(oldRow?.["valor_anuncio"]);
          newValue = normalizeNum(params.row["valor_anuncio"]);
        }
      }

      const context = await askPriceChangeContext({ hint, oldValue, newValue });
      if (!context) {
        throw new Error("Contexto de alteração de preço é obrigatório.");
      }

      return await upsertSheetRow({
        table: params.table as SheetKey,
        requestAuth,
        row: params.row,
        priceChangeContext: context
      });
    }
  }
  const isPrintTableScope = printScope === "table";
  const resolveEffectivePrintValue = useCallback(
    (row: Record<string, unknown>, column: string) =>
      isPrintTableScope ? resolvePrintDisplayValue(row, column) : resolveDisplayValue(row, column),
    [isPrintTableScope, resolveDisplayValue, resolvePrintDisplayValue]
  );
  const queryFilteredRows = useMemo(() => {
    return filterRowsByQuery({
      columns: allColumns,
      matchMode,
      query,
      rows: rawGridRows,
      resolveDisplayValue
    });
  }, [allColumns, matchMode, query, rawGridRows, resolveDisplayValue]);
  const locallyFilteredRows = useMemo(
    () =>
      applyFrontFiltersAndSort({
        filters,
        resolveDisplayValue,
        rows: queryFilteredRows,
        sortChain
      }),
    [filters, queryFilteredRows, resolveDisplayValue, sortChain]
  );
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return locallyFilteredRows.slice(start, start + pageSize);
  }, [locallyFilteredRows, page, pageSize]);
  const viewRows = paginatedRows;
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
        const value = toDisplay(resolveDisplayValue(row, column), column);
        if (value.length > longestText.length) {
          longestText = value;
        }
      }

      const sortMeta = sortMetaByColumn.get(column);
      const displayOverride = displayColumnOverrides[column];

      const controlWidths: number[] = [HEADER_FILTER_BUTTON_PX];
      if (sortMeta) {
        controlWidths.push(measureTextWidth(`${sortMeta.index}:${sortMeta.dir === "asc" ? "↑" : "↓"}`) + 14);
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
  }, [columns, displayColumnOverrides, resolveDisplayValue, sortChain, viewRows]);
  const lookupOptionsByColumn = useMemo(() => {
    if (!lookups) return {} as Record<string, Array<{ value: string; label: string }>>;

    return {
      local: lookups.locations.map((item) => ({ value: item.code, label: item.name })),
      estado_venda: lookups.sale_statuses.map((item) => ({ value: item.code, label: item.name })),
      estado_anuncio: lookups.announcement_statuses.map((item) => ({ value: item.code, label: item.name })),
      estado_veiculo: lookups.vehicle_states.map((item) => ({ value: item.code, label: item.name })),
      // Parametriza as opções de cores como select-box
      cor: CAR_COLOR_OPTIONS,
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
    for (const column of Array.from(new Set([...allColumns, ...formColumnCandidates]))) {
      const rowWithValue = payload.rows.find((row) => row[column] != null);
      if (rowWithValue) {
        sample[column] = rowWithValue[column];
      }
    }
    return sample;
  }, [allColumns, formColumnCandidates, payload.rows]);
  const formFieldContext = useMemo(
    () => ({
      activeSheetKey: activeSheet.key,
      relationByColumn: relationForActiveSheet,
      lookupOptionsByColumn,
      sampleValueByColumn
    }),
    [activeSheet.key, lookupOptionsByColumn, relationForActiveSheet, sampleValueByColumn]
  );
  const formEditableColumns = useMemo(() => {
    // INSERT/BULK keep the primary key so the user can set it for tables whose
    // PK is user-provided (lookup codes, documentos.carro_id, etc.). UPDATE
    // hides the PK because it identifies the row being edited.
    const isInsertMode = formMode === "insert" || formMode === "bulk";
    return formColumnCandidates.filter((column) => {
      if (column.startsWith("__")) return false;
      if (column === activeSheet.primaryKey) {
        return isInsertMode;
      }
      if (activeSheet.lockedColumns.includes(column)) return false;
      if (column === "created_at" || column === "updated_at") return false;
      return true;
    });
  }, [activeSheet.lockedColumns, activeSheet.primaryKey, formColumnCandidates, formMode]);
  const canUseActiveSheetWriteActions =
    canWriteActiveSheet && isActiveSheetStateHydrated && payloadMatchesActiveSheet && formEditableColumns.length > 0;
  const isCarSingleForm = activeSheet.key === "carros" && formMode !== "bulk";
  const carPriorityColumns = useMemo(
    () => CAR_FORM_PRIORITY_COLUMNS.filter((priorityColumn) => formEditableColumns.includes(priorityColumn)),
    [formEditableColumns]
  );
  const carPriorityColumnsBeforeChassi = useMemo(
    () => carPriorityColumns.filter((column) => column !== "modelo_id"),
    [carPriorityColumns]
  );
  const carBooleanColumns = useMemo(
    () =>
      formEditableColumns.filter(
        (column) =>
          !CAR_FORM_PRIORITY_COLUMNS.some((priorityColumn) => priorityColumn === column) &&
          getFormFieldKind(formFieldContext, column) === "boolean"
      ),
    [formEditableColumns, formFieldContext]
  );
  const carSectionColumns = useMemo(
    () =>
      formEditableColumns.filter(
        (column) =>
          !CAR_FORM_PRIORITY_COLUMNS.some((priorityColumn) => priorityColumn === column) &&
          getFormFieldKind(formFieldContext, column) !== "boolean"
      ),
    [formEditableColumns, formFieldContext]
  );
  const modeloRelationOptions = useMemo(
    () => relationPickerOptionsByColumn.modelo_id ?? [],
    [relationPickerOptionsByColumn]
  );
  const modeloLabelByValue = useMemo(() => {
    const next: Record<string, string> = {};

    for (const option of modeloRelationOptions) {
      next[option.value] = option.label;
    }

    return next;
  }, [modeloRelationOptions]);
  const locationLabelByValue = useMemo(() => buildOptionLabelMap(lookupOptionsByColumn.local ?? []), [lookupOptionsByColumn]);
  const saleStatusLabelByValue = useMemo(() => buildOptionLabelMap(lookupOptionsByColumn.estado_venda ?? []), [lookupOptionsByColumn]);
  const announcementStatusLabelByValue = useMemo(
    () => buildOptionLabelMap(lookupOptionsByColumn.estado_anuncio ?? []),
    [lookupOptionsByColumn]
  );
  const colorLabelByValue = useMemo(() => buildOptionLabelMap(lookupOptionsByColumn.cor ?? CAR_COLOR_OPTIONS), [lookupOptionsByColumn]);
  const visualFeatureOptions = useMemo(
    () =>
      (relationCache.caracteristicas_visuais?.rows ?? [])
        .filter((row) => row.id != null)
        .map((row) => ({
          id: String(row.id),
          label: String(row.caracteristica ?? row.id)
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" })),
    [relationCache.caracteristicas_visuais]
  );
  const technicalFeatureOptions = useMemo(
    () =>
      (relationCache.caracteristicas_tecnicas?.rows ?? [])
        .filter((row) => row.id != null)
        .map((row) => ({
          id: String(row.id),
          label: String(row.caracteristica ?? row.id)
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" })),
    [relationCache.caracteristicas_tecnicas]
  );
  const filteredVisualFeatureOptions = useMemo(() => {
    const search = normalizeBulkToken(carFeatureSearch);
    if (!search) return visualFeatureOptions;
    return visualFeatureOptions.filter(
      (option) => normalizeBulkToken(option.label).includes(search) || normalizeBulkToken(option.id).includes(search)
    );
  }, [carFeatureSearch, visualFeatureOptions]);
  const filteredTechnicalFeatureOptions = useMemo(() => {
    const search = normalizeBulkToken(carFeatureSearch);
    if (!search) return technicalFeatureOptions;
    return technicalFeatureOptions.filter(
      (option) => normalizeBulkToken(option.label).includes(search) || normalizeBulkToken(option.id).includes(search)
    );
  }, [carFeatureSearch, technicalFeatureOptions]);
  const isCarFeatureDataReady = useMemo(
    () =>
      !isCarSingleForm ||
      (carFeatureOptionsReady && carFeatureSelectionsReady && !carFeatureLoading && !carFeatureError),
    [carFeatureError, carFeatureLoading, carFeatureOptionsReady, carFeatureSelectionsReady, isCarSingleForm]
  );
  const isFormSaveDisabled = formSubmitting || formBooting || !isCarFeatureDataReady;
  const carHandlerHeader = useMemo(() => {
    if (activeSheet.key !== "carros") return activeSheet.label;

    const rawModelo = (formValues.modelo_id ?? "").trim();
    const modelo = (modeloLabelByValue[rawModelo] ?? rawModelo).trim();
    const ano = (formValues.ano_mod ?? formValues.ano_fab ?? "").trim();
    const rawKm = (formValues.hodometro ?? "").trim();
    const parsedKm = rawKm ? Number(rawKm.replace(/\./g, "").replace(",", ".")) : Number.NaN;
    const km = rawKm
      ? `${Number.isFinite(parsedKm) ? new Intl.NumberFormat("pt-BR").format(parsedKm) : rawKm} KM`
      : "";
    const rawPlaca = (formValues.placa ?? "").trim().toUpperCase();
    const rawColor = (formValues.cor ?? "").trim();
    const cor = (colorLabelByValue[rawColor] ?? rawColor).trim();
    const parts: string[] = [];
    if (rawPlaca) parts.push(rawPlaca);
    const base = [modelo, ano, km].filter(Boolean).join(" ").trim();
    if (base) parts.push(base);
    if (cor) parts.push(cor);
    const summary = parts.join(" — ");

    return summary || activeSheet.label;
  }, [
    activeSheet.key,
    activeSheet.label,
    formValues.ano_fab,
    formValues.ano_mod,
    formValues.placa,
    formValues.cor,
    formValues.hodometro,
    formValues.modelo_id,
    modeloLabelByValue,
    colorLabelByValue
  ]);
  const getFieldKind = useCallback((column: string) => getFormFieldKind(formFieldContext, column), [formFieldContext]);
  const isModelTextColumn = useCallback((column: string) => isCarModelTextInput(activeSheet.key, column), [activeSheet.key]);
  const buildInitialFormValuesFromRow = useCallback(
    (row: Record<string, unknown>) =>
      buildFormValuesFromRow({
        row,
        formEditableColumns,
        modeloLabelByValue,
        fieldContext: formFieldContext
      }),
    [formEditableColumns, formFieldContext, modeloLabelByValue]
  );
  const buildInitialInsertValues = useCallback(
    (relationDefaults: Record<string, string>) =>
      buildInsertFormValues({
        formEditableColumns,
        relationDefaults,
        relationPickerOptionsByColumn,
        lookupOptionsByColumn,
        fieldContext: formFieldContext
      }),
    [formEditableColumns, formFieldContext, lookupOptionsByColumn, relationPickerOptionsByColumn]
  );
  function isMissingAnuncioReferenceRow(row: Record<string, unknown>) {
    return activeSheet.key === "anuncios" && row.__missing_data === true;
  }

  function buildMissingAnuncioInsertPrefill(row: Record<string, unknown>) {
    const next: Record<string, string> = {};
    const carroId = String(row.carro_id ?? "").trim();
    if (carroId) {
      next.carro_id = carroId;
    }

    const suggestedPrice = row.__valor_anuncio_sugerido ?? row.preco_carro_atual;
    if (suggestedPrice != null && String(suggestedPrice).trim() !== "") {
      next.valor_anuncio = String(suggestedPrice);
    }

    return next;
  }

  function resolveRepeatedVehicleDisplayValue(row: Record<string, unknown>, column: string) {
    const rawValue = row[column];

    if (column === "modelo_id") {
      return modeloLabelByValue[String(rawValue ?? "")] ?? rawValue;
    }

    if (column === "local") {
      return locationLabelByValue[String(rawValue ?? "")] ?? rawValue;
    }

    if (column === "estado_venda") {
      return saleStatusLabelByValue[String(rawValue ?? "")] ?? rawValue;
    }

    if (column === "estado_anuncio") {
      return announcementStatusLabelByValue[String(rawValue ?? "")] ?? rawValue;
    }

    return rawValue;
  }

  function renderRepeatedGroupChildCell(
    groupRow: Record<string, unknown>,
    childRow: Record<string, unknown>,
    column: string,
    childIndex: number,
    groupChildCount: number,
    isBucketStart: boolean
  ) {
    const plateLabel = String(childRow.placa ?? childRow.carro_id ?? "Sem placa");
    const carIdLabel = String(childRow.carro_id ?? childRow.id ?? "").trim();
    const vehicleName = String(resolveRepeatedVehicleDisplayValue(childRow, "nome") ?? "Sem nome");
    const modelLabel = String(resolveRepeatedVehicleDisplayValue(childRow, "modelo_id") ?? childRow.modelo_id ?? "Sem modelo");
    const localLabel = String(resolveRepeatedVehicleDisplayValue(childRow, "local") ?? "").trim();
    const saleStatusLabel = String(resolveRepeatedVehicleDisplayValue(childRow, "estado_venda") ?? "").trim();
    const visualSummary = String(childRow.caracteristicas_visuais_resumo ?? groupRow.caracteristicas_visuais_resumo ?? "").trim();
    const hasPrice = childRow.preco_original != null && String(childRow.preco_original).trim() !== "";
    const priceLabel = hasPrice ? toDisplay(childRow.preco_original, "preco_original") : "Sem preco";
    const kmLabel =
      childRow.hodometro != null && String(childRow.hodometro).trim() !== ""
        ? `${toDisplay(resolveRepeatedVehicleDisplayValue(childRow, "hodometro"), "hodometro")} km`
        : "Sem KM";

    switch (column) {
      case "grupo_id":
        return (
          <div className="sheet-child-cell-stack">
            <strong>{plateLabel}</strong>
            {carIdLabel && carIdLabel !== plateLabel ? <span>{carIdLabel}</span> : null}
          </div>
        );
      case "modelo_id":
        return (
          <div className="sheet-child-cell-stack">
            <strong>{vehicleName}</strong>
            <span>{joinCompactLabels(modelLabel, localLabel, saleStatusLabel)}</span>
          </div>
        );
      case "cor":
        return String(resolveRepeatedVehicleDisplayValue(childRow, "cor") ?? groupRow.cor ?? "").trim() || null;
      case "ano_fab":
        return toDisplay(resolveRepeatedVehicleDisplayValue(childRow, "ano_fab"), "ano_fab");
      case "ano_mod":
        return toDisplay(resolveRepeatedVehicleDisplayValue(childRow, "ano_mod"), "ano_mod");
      case "caracteristicas_visuais_resumo":
        return visualSummary ? (
          <span className="sheet-child-truncate" title={visualSummary}>
            {visualSummary}
          </span>
        ) : (
          <span className="sheet-child-empty">Sem sinais</span>
        );
      case "preco_original":
        return (
          <div className="sheet-child-cell-stack">
            <strong>{priceLabel}</strong>
            <span>
              {joinCompactLabels(
                isBucketStart ? buildRepeatedPriceBucketLabel(childRow.preco_original) : null,
                childRow.__is_reference_choice === true ? "Referencia" : null
              )}
            </span>
          </div>
        );
      case "hodometro_min":
        return kmLabel;
      case "qtde":
        return (
          <div className="sheet-child-cell-stack">
            <strong>{`${childIndex + 1}/${Math.max(groupChildCount, 1)}`}</strong>
            <span>{childRow.__has_anuncio === true ? "Ja anunciado" : "Sem anuncio"}</span>
          </div>
        );
      case "atualizado_em":
        return toDisplay(childRow.updated_at ?? childRow.created_at, "updated_at");
      case "created_at":
        return toDisplay(childRow.created_at, "created_at");
      case "updated_at":
        return toDisplay(childRow.updated_at, "updated_at");
      default: {
        const rawValue = childRow[column];
        return rawValue == null || String(rawValue).trim() === "" ? null : toDisplay(rawValue, column);
      }
    }
  }

  function getSelectableRowIds(rows: Array<Record<string, unknown>>) {
    return rows
      .filter((row) => !isMissingAnuncioReferenceRow(row))
      .map((row) => String(row[activeSheet.primaryKey] ?? ""));
  }
  const coerceSheetFormValue = useCallback(
    (column: string, rawValue: string) =>
      coerceFormValue({
        column,
        rawValue,
        normalizedOptionValueByColumn,
        fieldContext: formFieldContext
      }),
    [formFieldContext, normalizedOptionValueByColumn]
  );
  const modeloDatalistId = "carros-modelo-id-options";
  const printBaseRows = useMemo(() => {
    if (printScope === "selected") {
      return selectedRows.size > 0
        ? locallyFilteredRows.filter((row) => selectedRows.has(String(row[activeSheet.primaryKey] ?? "")))
        : [];
    }

    if (printScope === "filtered") {
      return locallyFilteredRows;
    }

    return payload.rows;
  }, [activeSheet.primaryKey, locallyFilteredRows, payload.rows, printScope, selectedRows]);
  const printableRows = useMemo(() => {
    if (!isPrintTableScope) {
      return printBaseRows;
    }

    return filterRowsByPrintFilters(printBaseRows, printFilters);
  }, [isPrintTableScope, printBaseRows, printFilters]);
  const printSectionOptions = useMemo<PrintableSectionOption[]>(() => {
    if (!printSectionColumn) return [];

    const bucket = new Map<string, { label: string; count: number }>();

    for (const row of printableRows) {
      const rawValue = row[printSectionColumn];
      const literal = rawValue == null || rawValue === "" ? "__empty__" : String(rawValue);
      const label =
        rawValue == null || rawValue === ""
          ? "(vazio)"
          : toDisplay(resolveEffectivePrintValue(row, printSectionColumn), printSectionColumn);
      const current = bucket.get(literal);
      if (current) {
        current.count += 1;
      } else {
        bucket.set(literal, { label, count: 1 });
      }
    }

    return Array.from(bucket.entries()).map(([literal, meta]) => ({
      literal,
      label: meta.label,
      count: meta.count
    }));
  }, [printSectionColumn, printableRows, resolveEffectivePrintValue]);
  const columnFilterOptions = useMemo(
    () =>
      buildColumnFilterOptions({
        columns,
        rows: locallyFilteredRows,
        relationDisplayLookup
      }),
    [columns, locallyFilteredRows, relationDisplayLookup]
  );
  const printColumnFilterOptions = useMemo(() => {
    if (!isPrintTableScope) {
      return {};
    }

    return buildColumnFilterOptions({
      columns: allColumns,
      rows: printableRows,
      relationDisplayLookup: printRelationDisplayLookup
    });
  }, [allColumns, isPrintTableScope, printableRows, printRelationDisplayLookup]);
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
    return 48 + (isConferenceMode ? 92 : 0) + columns.reduce((sum, column) => sum + (resolvedColumnWidths[column] ?? 180), 0);
  }, [columns, isConferenceMode, resolvedColumnWidths]);
  const { gridRef, handleGridScroll, prepareGridScrollRestore } = useGridScrollSync({
    activeSheetKey,
    isActiveSheetStateHydrated,
    rowCount: viewRows.length,
    showGridPanel,
    tablePixelWidth
  });
  const {
    clearSelectedRows,
    clearSelection,
    getCellSelectionAnchor,
    handleCellClick,
    handleRowToggle,
    handleSelectAllCycle,
    invertVisibleSelection,
    moveCellSelectionBy,
    selectVisibleRows
  } = useGridKeyboardSelection({
    activeSheetKey,
    activeSheetPrimaryKey: activeSheet.primaryKey,
    columns,
    getSelectableRowIds,
    gridRef,
    isConferenceMode,
    isEditorMode,
    onOpenUpdateForm: openUpdateForm,
    selection: gridSelection,
    toggleConferenceRow,
    viewRows
  });

  function parseFilterSelection(expressionRaw: string): string[] {
    const expression = expressionRaw.trim();
    if (!expression) return [];
    if (expression.toUpperCase() === EMPTY_FILTER_LITERAL || expression.toUpperCase() === "!VAZIO") {
      return [expression.toUpperCase()];
    }
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

  function describeFilterExpression(expressionRaw: string) {
    const expression = expressionRaw.trim();
    if (!expression) return "Sem filtro ativo.";
    if (expression.toUpperCase() === EMPTY_FILTER_LITERAL) return "Somente valores vazios.";
    if (expression.toUpperCase() === "!VAZIO") return "Somente valores preenchidos.";
    if (expression.startsWith("=")) {
      return `Igual a ${toFilterSelectionLabel(expression.slice(1).trim()) || "(vazio)"}.`;
    }
    if (expression.includes("|")) {
      return `Um dos valores: ${expression
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => toFilterSelectionLabel(item))
        .join(", ")}.`;
    }
    return `Expressao atual: ${expression}.`;
  }

  const closeFilterPopover = useCallback(() => {
    setFilterPopoverColumn(null);
    setFilterPopoverPosition(null);
    setFilterPopoverSearch("");
    setFilterDraftValues([]);
    setFilterDateFrom("");
    setFilterDateTo("");
  }, []);

  function openFilterPopover(column: string) {
    const selection = parseFilterSelection(filters[column] ?? "");
    const dateBounds = getDateSelectionBounds(selection);

    setFilterPopoverSearch("");
    setFilterDraftValues(selection);
    setFilterDateFrom(dateBounds.from);
    setFilterDateTo(dateBounds.to);
    setFilterPopoverColumn((prev) => {
      const nextColumn = prev === column ? null : column;
      if (nextColumn) {
        updateFilterPopoverPosition(nextColumn);
      } else {
        setFilterPopoverPosition(null);
        setFilterDraftValues([]);
        setFilterDateFrom("");
        setFilterDateTo("");
      }
      return nextColumn;
    });
  }

  const toggleFilterDraftValue = useCallback((value: string) => {
    setFilterDraftValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return Array.from(next);
    });
  }, []);

  function writeFilterSelection(column: string, values: string[]) {
    const normalized = Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));

    setFilters((prev) => {
      const next = { ...prev };
      if (normalized.length === 0) {
        delete next[column];
      } else if (normalized.length === 1) {
        next[column] =
          normalized[0].toUpperCase() === EMPTY_FILTER_LITERAL || normalized[0].toUpperCase() === "!VAZIO"
            ? normalized[0].toUpperCase()
            : `=${normalized[0]}`;
      } else {
        next[column] = normalized.join("|");
      }
      return next;
    });

    setPage(1);
    clearSelection();
  }

  function applyActiveFilter() {
    if (!filterPopoverColumn) return;
    writeFilterSelection(filterPopoverColumn, filterDraftValues);
    closeFilterPopover();
  }

  function clearActiveFilter() {
    if (!filterPopoverColumn) return;
    setFilterDraftValues([]);
    writeFilterSelection(filterPopoverColumn, []);
    closeFilterPopover();
  }

  const getPrintColumnLabel = useCallback(
    (column: string) => {
      const candidate = printColumnLabels[column]?.trim();
      return candidate ? candidate : column;
    },
    [printColumnLabels]
  );

  const printHighlightPreview = useMemo(() => {
    return printHighlightRules.map((rule, index) => {
      const normalizedRule = normalizePrintHighlightRule(
        {
          ...rule,
          columnLabel: rule.column ? getPrintColumnLabel(rule.column) : ""
        },
        index
      );

      let matchCount = 0;
      if (normalizedRule.column && (!operatorNeedsValues(normalizedRule.operator) || (normalizedRule.values?.length ?? 0) > 0)) {
        for (const row of printableRows) {
          if (matchesPrintHighlightRule(row, normalizedRule, resolveEffectivePrintValue)) {
            matchCount += 1;
          }
        }
      }

      return {
        rule: normalizedRule,
        matchCount
      };
    });
  }, [getPrintColumnLabel, printHighlightRules, printableRows, resolveEffectivePrintValue]);

  const printPreviewColumns = useMemo(
    () =>
      printColumns
        .filter((column) => allColumns.includes(column))
        .map((column) => ({
          key: column,
          label: getPrintColumnLabel(column)
        })),
    [allColumns, getPrintColumnLabel, printColumns]
  );
  const printPreviewRows = useMemo(() => {
    const rows = [...printableRows];

    if (isPrintTableScope && printSortColumn) {
      rows.sort((left, right) => {
        const order = comparePrintableValues(
          resolveEffectivePrintValue(left, printSortColumn),
          resolveEffectivePrintValue(right, printSortColumn),
          printSortColumn
        );
        return printSortDirection === "desc" ? order * -1 : order;
      });
    }

    return rows.slice(0, 12);
  }, [isPrintTableScope, printSortColumn, printSortDirection, printableRows, resolveEffectivePrintValue]);

  function addPrintHighlightRule() {
    setPrintHighlightRules((prev) => [...prev, createPrintHighlightRule(prev.length)]);
  }

  function updatePrintHighlightRule(ruleId: string, patch: Partial<PrintHighlightRule>) {
    setPrintHighlightRules((prev) => prev.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  }

  function removePrintHighlightRule(ruleId: string) {
    setPrintHighlightRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  }

  const closePrintFilterPopover = useCallback(() => {
    setPrintFilterPopoverColumn(null);
    setPrintFilterPopoverPosition(null);
    setPrintFilterPopoverSearch("");
    setPrintFilterDraftValues([]);
    setPrintFilterDateFrom("");
    setPrintFilterDateTo("");
  }, [
    setPrintFilterDateFrom,
    setPrintFilterDateTo,
    setPrintFilterDraftValues,
    setPrintFilterPopoverColumn,
    setPrintFilterPopoverPosition,
    setPrintFilterPopoverSearch
  ]);

  const updatePrintFilterPopoverPosition = useCallback((column: string) => {
    const trigger = printFilterTriggerRefs.current[column];
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    setPrintFilterPopoverPosition(resolvePopoverViewportPosition(rect));
  }, [setPrintFilterPopoverPosition]);

  function openPrintFilterPopover(column: string) {
    if (!isPrintTableScope) return;

    const selection = printFilters[column] ?? [];
    const dateBounds = getDateSelectionBounds(selection);

    setPrintFilterPopoverSearch("");
    setPrintFilterDraftValues(selection);
    setPrintFilterDateFrom(dateBounds.from);
    setPrintFilterDateTo(dateBounds.to);
    setPrintFilterPopoverColumn((prev) => {
      const nextColumn = prev === column ? null : column;
      if (nextColumn) {
        updatePrintFilterPopoverPosition(nextColumn);
      } else {
        setPrintFilterPopoverPosition(null);
        setPrintFilterDraftValues([]);
        setPrintFilterDateFrom("");
        setPrintFilterDateTo("");
      }
      return nextColumn;
    });
  }

  const togglePrintFilterDraftValue = useCallback((value: string) => {
    setPrintFilterDraftValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return Array.from(next);
    });
  }, [setPrintFilterDraftValues]);

  function writePrintFilterSelection(column: string, values: string[]) {
    if (!isPrintTableScope) return;

    const normalized = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

    setPrintFilters((prev) => {
      if (normalized.length === 0) {
        const next = { ...prev };
        delete next[column];
        return next;
      }

      return {
        ...prev,
        [column]: normalized
      };
    });
  }

  function applyPrintFilter() {
    if (!isPrintTableScope) return;
    if (!printFilterPopoverColumn) return;
    writePrintFilterSelection(printFilterPopoverColumn, printFilterDraftValues);
    closePrintFilterPopover();
  }

  function clearPrintFilter() {
    if (!isPrintTableScope) return;
    if (!printFilterPopoverColumn) return;
    setPrintFilterDraftValues([]);
    writePrintFilterSelection(printFilterPopoverColumn, []);
    closePrintFilterPopover();
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
          pageSize: 1000,
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
    [relationCache, requestAuth, setRelationDialogLoading]
  );

  const refreshRelationTable = useCallback(
    async (table: SheetKey) => {
      setRelationDialogLoading(true);
      try {
        const data = await fetchSheetRows({
          table,
          requestAuth,
          page: 1,
          pageSize: 1000,
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
    [requestAuth, setRelationDialogLoading]
  );

  function openRelationDialogForColumn(column: string, target: RelationDialogTarget = "grid") {
    const relation = relationForActiveSheet[column];
    if (!relation) return;

    if (target === "print") {
      closePrintFilterPopover();
    } else {
      closeFilterPopover();
    }

    setRelationDialog({
      sourceColumn: column,
      targetTable: relation.table,
      keyColumn: relation.keyColumn,
      target
    });

    void ensureRelationLoaded(relation.table);
  }

  function selectDisplayColumnForRelation(displayColumn: string) {
    if (!relationDialog) return;

    if (relationDialog.target === "print") {
      setPrintDisplayColumnOverrides((prev) => ({
        ...prev,
        [relationDialog.sourceColumn]: displayColumn
      }));
    } else {
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
    }

    setRelationDialog(null);
  }

  function resetCarFeatureFormState() {
    setCarFeatureSearch("");
    setCarFeatureError(null);
    setCarFeatureLoading(false);
    setCarFeatureOptionsReady(false);
    setCarFeatureSelectionsReady(false);
    setSelectedVisualFeatureIds([]);
    setSelectedTechnicalFeatureIds([]);
    setFeatureQuickCreateOpen(false);
    setFeatureQuickCreateKind("visual");
    setFeatureQuickCreateValue("");
    setFeatureQuickCreateError(null);
    setFeatureQuickCreateSubmitting(false);
    setCarFormSectionsOpen(readCarFormSectionsStorage());
  }

  async function loadCarFeatureFormState(carroId: string | null, requestId: number) {
    if (activeSheet.key !== "carros") {
      resetCarFeatureFormState();
      return;
    }

    setCarFeatureSearch("");
    setCarFeatureError(null);
    setCarFeatureLoading(true);
    setCarFeatureOptionsReady(false);
    setCarFeatureSelectionsReady(false);
    setSelectedVisualFeatureIds([]);
    setSelectedTechnicalFeatureIds([]);

    try {
      await Promise.all([ensureRelationLoaded("caracteristicas_visuais"), ensureRelationLoaded("caracteristicas_tecnicas")]);
      if (requestId !== formOpenRequestRef.current) return;

      setCarFeatureOptionsReady(true);

      if (!carroId) {
        setSelectedVisualFeatureIds([]);
        setSelectedTechnicalFeatureIds([]);
      } else {
        const data = await fetchCarroCaracteristicas(carroId, requestAuth);
        if (requestId !== formOpenRequestRef.current) return;
        setSelectedVisualFeatureIds(data.caracteristicas_visuais_ids);
        setSelectedTechnicalFeatureIds(data.caracteristicas_tecnicas_ids);
      }

      if (requestId !== formOpenRequestRef.current) return;
      setCarFeatureSelectionsReady(true);
    } catch (err) {
      if (requestId !== formOpenRequestRef.current) return;
      setCarFeatureError(err instanceof Error ? err.message : "Falha ao carregar caracteristicas do veiculo.");
      throw err;
    } finally {
      if (requestId !== formOpenRequestRef.current) return;
      setCarFeatureLoading(false);
    }
  }

  function toggleCarFormSection(section: CarFormSectionKey) {
    setCarFormSectionsOpen((prev) => {
      const next = {
        ...prev,
        [section]: !prev[section]
      };
      writeStorage(storageKey("carros", "form-sections"), next);
      return next;
    });
  }

  function toggleFeatureSelection(kind: "visual" | "technical", featureId: string) {
    const setter = kind === "visual" ? setSelectedVisualFeatureIds : setSelectedTechnicalFeatureIds;
    setter((prev) => (prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId]));
  }

  function openFeatureQuickCreateDialog(kind: "visual" | "technical") {
    if (!isCarSingleForm || formSubmitting || formBooting || carFeatureLoading) return;

    setFeatureQuickCreateKind(kind);
    setFeatureQuickCreateValue("");
    setFeatureQuickCreateError(null);
    setFeatureQuickCreateOpen(true);
  }

  async function handleFeatureQuickCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCarSingleForm || featureQuickCreateSubmitting) return;

    const kind = featureQuickCreateKind;
    const table = kind === "visual" ? "caracteristicas_visuais" : "caracteristicas_tecnicas";
    const label = kind === "visual" ? "caracteristica visual" : "caracteristica tecnica";
    const caracteristica = featureQuickCreateValue.trim();
    if (!caracteristica) {
      setFeatureQuickCreateError(`Informe a ${label}.`);
      return;
    }

    setCarFeatureLoading(true);
    setCarFeatureError(null);
    setFeatureQuickCreateError(null);
    setFeatureQuickCreateSubmitting(true);
    setFormInfo(null);

    try {
      await upsertRowWithPriceContextSafe({
        table,
        row: { caracteristica }
      });

      const payload = await refreshRelationTable(table);
      const createdRow = payload.rows.find(
        (row) => normalizeBulkToken(String(row.caracteristica ?? "")) === normalizeBulkToken(caracteristica)
      );
      const createdId = createdRow?.id != null ? String(createdRow.id) : null;

      if (createdId) {
        toggleFeatureSelection(kind, createdId);
      }

      setCarFeatureOptionsReady(true);
      setCarFeatureSelectionsReady(true);
      setFormInfo(`${label} adicionada.`);
      setFeatureQuickCreateOpen(false);
      setFeatureQuickCreateValue("");
    } catch (err) {
      const message = err instanceof Error ? err.message : `Falha ao adicionar ${label}.`;
      setCarFeatureError(message);
      setFeatureQuickCreateError(message);
    } finally {
      setCarFeatureLoading(false);
      setFeatureQuickCreateSubmitting(false);
    }
  }

  function renderEditableFormField(column: string, options?: { fullWidth?: boolean }) {
    const fieldKind = getFieldKind(column);
    const relation = relationForActiveSheet[column];
    const relationOptions = relation ? relationPickerOptionsByColumn[column] ?? [] : [];
    const lookupOptions = lookupOptionsByColumn[column] ?? [];
    const isPlateField = isCarSingleForm && column === "placa";
    const isCarModelField = isCarSingleForm && isModelTextColumn(column);
    const isPriceColumn = column === "preco_original" || column === "valor_anuncio";
    const fieldClassName = [
      "sheet-form-field",
      `is-kind-${fieldKind}`,
      isPlateField ? "is-plate-highlight" : "",
      isCarModelField ? "is-model-field" : "",
      isPriceColumn ? "is-price-field" : "",
      options?.fullWidth ? "is-form-span-full" : ""
    ]
      .filter(Boolean)
      .join(" ");

    async function openPriceContextPreview() {
      if (!isPriceColumn || formMode !== "update" || !editingRowId) return;
      try {
        setPricePreviewColumn(column);
        setPricePreviewLoading(true);
        setPricePreviewError(null);
        setPricePreviewText(null);
        const { entry } = await fetchLatestPriceChangeContext({
          table: activeSheet.key,
          rowId: editingRowId,
          column,
          requestAuth
        });
        if (!entry) {
          setPricePreviewText("Nenhum contexto registrado para este preço.");
          return;
        }
        const when = new Date(entry.created_at).toLocaleString();
        const oldV = entry.old_value != null ? String(entry.old_value) : "(vazio)";
        const newV = entry.new_value != null ? String(entry.new_value) : "(vazio)";
        setPricePreviewText(`"${entry.context}" — ${when} (de ${oldV} para ${newV})`);
      } catch (err) {
        setPricePreviewError(err instanceof Error ? err.message : "Falha ao carregar contexto.");
      } finally {
        setPricePreviewLoading(false);
      }
    }

    return (
      <label key={column} className={fieldClassName}>
        <span>
          {column}
          {isPriceColumn && formMode === "update" ? (
            <button
              type="button"
              className="sheet-form-aux-btn"
              style={{ marginLeft: 8 }}
              onClick={() => void openPriceContextPreview()}
              data-testid={`form-price-context-${column}`}
              title="Ver último contexto de alteração de preço"
            >
              {pricePreviewLoading && pricePreviewColumn === column ? "Carregando..." : "Contexto"}
            </button>
          ) : null}
          {isPriceColumn && formMode === "update" && editingRowId ? (
            <button
              type="button"
              className="sheet-form-aux-btn"
              style={{ marginLeft: 6 }}
              onClick={() => void openPriceContextsPanel(column)}
              data-testid={`form-price-context-link-${column}`}
              title="Listar contextos de preço"
            >
              Ver todos
            </button>
          ) : null}
          {/* Insights não precisam de botão por campo; acionaremos pelo header/mensagem */}
        </span>
        {isPlateField ? (
          <>
            <div className="sheet-form-inline sheet-form-plate-card">
              <input
                ref={plateFieldRef}
                type="text"
                autoFocus={formMode === "insert" && !showGridPanel && isMobileSheetLayout()}
                value={formValues[column] ?? ""}
                onChange={(event) => setFormValues((prev) => ({ ...prev, [column]: event.target.value.toUpperCase() }))}
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
          <span className="sheet-form-boolean-input">
            <input
              type="checkbox"
              checked={parseBooleanLikeValue(formValues[column] ?? "") === true}
              onChange={(event) =>
                setFormValues((prev) => ({ ...prev, [column]: event.target.checked ? "true" : "false" }))
              }
              data-testid={`form-field-${column}`}
            />
            <span>{parseBooleanLikeValue(formValues[column] ?? "") === true ? "Sim" : "Nao"}</span>
          </span>
        ) : (
          <input
            type={fieldKind === "number" ? "number" : fieldKind === "datetime" ? "datetime-local" : "text"}
            value={formValues[column] ?? ""}
            onChange={(event) => setFormValues((prev) => ({ ...prev, [column]: event.target.value }))}
            data-testid={`form-field-${column}`}
          />
        )}
        {isPriceColumn && pricePreviewColumn === column && (pricePreviewText || pricePreviewError) ? (
          <p className={pricePreviewError ? "sheet-error" : "sheet-form-field-hint"}>
            {pricePreviewError ?? pricePreviewText}
          </p>
        ) : null}
      </label>
    );
  }

  function renderCarFeatureGroup(params: {
    title: string;
    emptyLabel: string;
    options: Array<{ id: string; label: string }>;
    selectedIds: string[];
    kind: "visual" | "technical";
    testIdPrefix: string;
  }) {
    return (
      <section className="sheet-form-feature-group">
        <header className="sheet-form-feature-group-head">
          <div className="sheet-form-feature-group-head-main">
            <strong>{params.title}</strong>
            <span>{params.selectedIds.length} selecionada(s)</span>
          </div>
          <button
            type="button"
            className="sheet-form-feature-add"
            onClick={() => openFeatureQuickCreateDialog(params.kind)}
            disabled={formBooting || formSubmitting || carFeatureLoading}
            data-testid={`${params.testIdPrefix}-quick-add`}
            aria-label={`Adicionar ${params.title}`}
            title={`Adicionar ${params.title}`}
          >
            +
          </button>
        </header>
        {params.options.length === 0 ? (
          <p className="sheet-form-field-hint">{params.emptyLabel}</p>
        ) : (
          <div className="sheet-form-feature-list">
            {params.options.map((option) => {
              const checked = params.selectedIds.includes(option.id);
              return (
                <label key={`${params.kind}-${option.id}`} className="sheet-form-feature-checkbox">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFeatureSelection(params.kind, option.id)}
                    disabled={formBooting || formSubmitting || carFeatureLoading}
                    data-testid={`${params.testIdPrefix}-${option.id}`}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  const updateFilterPopoverPosition = useCallback((column: string) => {
    const trigger = filterTriggerRefs.current[column];
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    setFilterPopoverPosition(resolvePopoverViewportPosition(rect));
  }, []);

  function moveOrderedValue(values: string[], value: string, direction: "up" | "down") {
    const index = values.indexOf(value);
    if (index === -1) return values;
    if (direction === "up" && index === 0) return values;
    if (direction === "down" && index === values.length - 1) return values;

    const next = [...values];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    return next;
  }

  function toggleOrderedValue(values: string[], value: string, enabled: boolean, referenceOrder = values) {
    if (enabled) {
      if (values.includes(value)) return values;
      if (!referenceOrder.includes(value)) return [...values, value];

      const next = values.filter((entry) => referenceOrder.includes(entry));
      const insertIndex = next.findIndex((entry) => referenceOrder.indexOf(entry) > referenceOrder.indexOf(value));
      if (insertIndex === -1) {
        return [...next, value];
      }
      return [...next.slice(0, insertIndex), value, ...next.slice(insertIndex)];
    }

    return values.filter((entry) => entry !== value);
  }

  const fetchAllRowsForSheet = useCallback(
    async (sheet: SheetKey) => {
      let currentPage = 1;
      let mergedRows: Array<Record<string, unknown>> = [];
      let firstPageData: GridListPayload | null = null;

      while (true) {
        const data = await fetchSheetRows({
          table: sheet,
          requestAuth,
          page: currentPage,
          pageSize: GRID_FETCH_BATCH_SIZE,
          query: "",
          matchMode: "contains",
          filters: {},
          sort: []
        });

        if (!firstPageData) {
          firstPageData = data;
        }

        mergedRows = [...mergedRows, ...data.rows];

        if (mergedRows.length >= data.totalRows || data.rows.length < GRID_FETCH_BATCH_SIZE) {
          return {
            ...(firstPageData ?? data),
            rows: mergedRows,
            totalRows: mergedRows.length,
            page: 1,
            pageSize: GRID_FETCH_BATCH_SIZE,
            sort: [],
            filters: {}
          };
        }

        currentPage += 1;
      }
    },
    [requestAuth]
  );

  function openMassUpdateDialog() {
    if (!canWriteActiveSheet || selectedRows.size === 0 || formEditableColumns.length === 0) return;

    const firstColumn = formEditableColumns[0] ?? "";
    setMassUpdateColumn(firstColumn);
    setMassUpdateValue("");
    setMassUpdateClearValue(false);
    setMassUpdateError(null);
    setMassUpdateSubmitting(false);
    setMassUpdateDialogOpen(true);
  }

  function openPrintDialog() {
    const defaultConfig: StoredPrintConfig = {
      title: activeSheet.label,
      scope: "table",
      columns,
      columnLabels: Object.fromEntries(allColumns.map((column) => [column, column])),
      filters: {},
      displayColumnOverrides: { ...displayColumnOverrides },
      sortColumn: "",
      sortDirection: "asc",
      sectionColumn: "",
      sectionValues: [],
      includeOthers: true,
      highlightOpacityPercent: DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT,
      highlightRules: []
    };
    const storedConfig = readStorage<StoredPrintConfig | null>(storageKey(activeSheet.key, "print"), null);
    const validColumns = new Set(allColumns);
    const normalizedColumns = storedConfig?.columns?.filter((column) => validColumns.has(column)) ?? [];
    const normalizedColumnLabels = Object.fromEntries(
      allColumns.map((column) => [column, storedConfig?.columnLabels?.[column] ?? defaultConfig.columnLabels[column] ?? column])
    );
    const normalizedFilters = Object.fromEntries(
      Object.entries(storedConfig?.filters ?? {}).filter(
        ([column, values]) =>
          validColumns.has(column) && Array.isArray(values) && values.every((value) => typeof value === "string")
      )
    ) as Record<string, string[]>;
    const normalizedDisplayOverrides = Object.fromEntries(
      Object.entries(storedConfig?.displayColumnOverrides ?? {}).filter(
        ([column, value]) => validColumns.has(column) && typeof value === "string"
      )
    ) as Record<string, string>;
    const normalizedSectionColumn =
      storedConfig?.sectionColumn && validColumns.has(storedConfig.sectionColumn) ? storedConfig.sectionColumn : "";
    const normalizedConfig: StoredPrintConfig = {
      title: storedConfig?.title?.trim() || defaultConfig.title,
      scope: storedConfig?.scope === "filtered" || storedConfig?.scope === "selected" ? storedConfig.scope : "table",
      columns: normalizedColumns.length > 0 ? normalizedColumns : defaultConfig.columns,
      columnLabels: normalizedColumnLabels,
      filters: normalizedFilters,
      displayColumnOverrides: normalizedDisplayOverrides,
      sortColumn: storedConfig?.sortColumn && validColumns.has(storedConfig.sortColumn) ? storedConfig.sortColumn : "",
      sortDirection: storedConfig?.sortDirection === "desc" ? "desc" : "asc",
      sectionColumn: normalizedSectionColumn,
      sectionValues: normalizedSectionColumn ? (storedConfig?.sectionValues?.filter((value) => typeof value === "string") ?? []) : [],
      includeOthers: storedConfig?.includeOthers ?? defaultConfig.includeOthers,
      highlightOpacityPercent: storedConfig?.highlightOpacityPercent ?? defaultConfig.highlightOpacityPercent,
      highlightRules: Array.isArray(storedConfig?.highlightRules) ? storedConfig.highlightRules : defaultConfig.highlightRules
    };

    setPrintTitle(normalizedConfig.title);
    setPrintScope(normalizedConfig.scope === "selected" && selectedRows.size === 0 ? "table" : normalizedConfig.scope);
    setPrintColumns(normalizedConfig.columns);
    setPrintColumnLabels(normalizedConfig.columnLabels);
    setPrintFilters(normalizedConfig.filters);
    setPrintDisplayColumnOverrides(normalizedConfig.displayColumnOverrides);
    setPrintSortColumn(normalizedConfig.sortColumn);
    setPrintSortDirection(normalizedConfig.sortDirection);
    setPrintSectionColumn(normalizedConfig.sectionColumn);
    setPrintSectionValues(normalizedConfig.sectionValues);
    setPrintIncludeOthers(normalizedConfig.includeOthers);
    setPrintHighlightOpacityPercent(normalizedConfig.highlightOpacityPercent);
    setPrintHighlightRules(normalizedConfig.highlightRules);
    setPrintError(null);
    setPrintSubmitting(false);
    closePrintFilterPopover();
    setPrintDialogOpen(true);
  }

  const updateActiveSheetLayout = useCallback((updater: (current: StoredSheetLayout) => StoredSheetLayout) => {
    setSheetLayoutByTable((prev) => {
      const current = prev[activeSheetKey] ?? { hiddenColumns: [], pinnedColumn: null };
      const nextLayout = updater(current);
      writeStorage(storageKey(activeSheetKey, "layout"), nextLayout);
      return {
        ...prev,
        [activeSheetKey]: nextLayout
      };
    });
  }, [activeSheetKey]);

  const loadLookups = useCallback(async () => {
    try {
      const data = await fetchLookups(requestAuth);
      setLookups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar lookups.");
    }
  }, [requestAuth, setError, setLookups]);

  const loadGridInsightsSummary = useCallback(async () => {
    try {
      const data = await fetchGridInsightsSummary(requestAuth);
      setTableInsightsBySheet(data.byTable);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido.";
      console.warn(`[grid-insights] resumo indisponivel: ${message}`);
    }
  }, [requestAuth, setTableInsightsBySheet]);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (activeSheetKey === "grupos_repetidos") {
      setExpandedGroupIds(new Set());
      setRepetidosByGroup({});
      setLoadingRepeatedGroupIds(new Set());
    }

    try {
      const [data, insightsSummary, missingAnuncioRows] = await Promise.all([
        fetchAllRowsForSheet(activeSheetKey),
        fetchGridInsightsSummary(requestAuth).catch((err) => {
          const message = err instanceof Error ? err.message : "Erro desconhecido.";
          console.warn(`[grid-insights] resumo indisponivel: ${message}`);
          return null;
        }),
        activeSheetKey === "anuncios"
          ? fetchMissingAnuncioRows(requestAuth)
              .then((response) => response.rows)
              .catch((err) => {
                const message = err instanceof Error ? err.message : "Erro desconhecido.";
                console.warn(`[grid-insights] linhas faltantes de anuncios indisponiveis: ${message}`);
                return [] as Array<Record<string, unknown>>;
              })
          : Promise.resolve([] as Array<Record<string, unknown>>)
      ]);
      const mergedRows = activeSheetKey === "anuncios" ? [...missingAnuncioRows, ...data.rows] : data.rows;
      setPayload({
        ...data,
        rows: mergedRows,
        totalRows: mergedRows.length
      });
      if (insightsSummary) {
        setTableInsightsBySheet(insightsSummary.byTable);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar planilha.");
    } finally {
      setLoading(false);
    }
  }, [activeSheetKey, fetchAllRowsForSheet, requestAuth, setError, setLoading, setPayload, setTableInsightsBySheet]);

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
      .then(async () => {
        await task();
        await loadGridInsightsSummary();
      })
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
    const newValue = coerceEditableValue(oldValue, editingCell.value);

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

  function togglePinnedColumn(column: string) {
    updateActiveSheetLayout((current) => ({
      hiddenColumns: current.hiddenColumns.filter((entry) => entry !== column),
      pinnedColumn: current.pinnedColumn === column ? null : column
    }));
    clearSelection();
  }

  function hideColumn(column: string) {
    if (columns.length <= 1) return;

    updateActiveSheetLayout((current) => ({
      hiddenColumns: current.hiddenColumns.includes(column) ? current.hiddenColumns : [...current.hiddenColumns, column],
      pinnedColumn: current.pinnedColumn === column ? null : current.pinnedColumn
    }));

    setFilterPopoverColumn(null);
    setFilterPopoverPosition(null);
    setFilterPopoverSearch("");
    clearSelection();
  }

  function showHiddenColumn(column: string) {
    updateActiveSheetLayout((current) => ({
      hiddenColumns: current.hiddenColumns.filter((entry) => entry !== column),
      pinnedColumn: current.pinnedColumn
    }));
  }

  function showAllHiddenColumns() {
    updateActiveSheetLayout((current) => ({
      hiddenColumns: [],
      pinnedColumn: current.pinnedColumn
    }));
    clearSelection();
  }

  function clearFilterColumn(column: string) {
    writeFilterSelection(column, []);
    setActiveFiltersDialogOpen(false);
  }

  function clearAllFilters() {
    setFilters({});
    setPage(1);
    setFilterPopoverColumn(null);
    setFilterPopoverPosition(null);
    setFilterPopoverSearch("");
    setActiveFiltersDialogOpen(false);
    clearSelection();
  }

  function persistConferenceRows(nextRows: string[]) {
    writeStorage(storageKey(activeSheetKey, "conference"), nextRows);
    setConferenceRowsByTable((prev) => ({
      ...prev,
      [activeSheetKey]: nextRows
    }));
  }

  function toggleSelectionMode(mode: "conference" | "editor") {
    setSelectionModes((prev) => {
      const next = { ...prev, [mode]: !prev[mode] };
      return next;
    });
  }

  function setConferenceRows(rows: string[]) {
    persistConferenceRows(Array.from(new Set(rows)));
  }

  function shouldSkipConferenceConfirmation(action: "mark" | "unmark") {
    return action === "mark" && isConferenceMode && isEditorMode;
  }

  function toggleConferenceRow(rowId: string) {
    const isMarked = conferenceMarkedRows.has(rowId);
    if (!shouldSkipConferenceConfirmation(isMarked ? "unmark" : "mark")) {
      const confirmMessage = isMarked ? "Desmarcar esta linha como conferida?" : "Marcar esta linha como conferida?";
      if (!window.confirm(confirmMessage)) return;
    }

    setConferenceRows(
      isMarked
        ? Array.from(conferenceMarkedRows).filter((entry) => entry !== rowId)
        : [...Array.from(conferenceMarkedRows), rowId]
    );
  }

  function applyConferenceAction(action: "mark" | "unmark") {
    const targetIds =
      selectedRows.size > 0 ? Array.from(selectedRows) : viewRows.map((row) => String(row[activeSheet.primaryKey] ?? ""));
    if (targetIds.length === 0) return;

    const label =
      selectedRows.size > 0
        ? `${action === "mark" ? "Marcar" : "Desmarcar"} ${targetIds.length} linha(s) selecionada(s) como conferidas?`
        : `${action === "mark" ? "Marcar" : "Desmarcar"} todas as linhas visiveis como conferidas?`;
    if (!shouldSkipConferenceConfirmation(action) && !window.confirm(label)) return;

    if (action === "mark") {
      setConferenceRows([...Array.from(conferenceMarkedRows), ...targetIds]);
      return;
    }

    setConferenceRows(Array.from(conferenceMarkedRows).filter((rowId) => !targetIds.includes(rowId)));
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

      persistSheetState(activeSheetKey, {
        filters,
        widths: columnWidths,
        sort: next,
        display: displayColumnOverrides,
        layout: activeSheetLayout
      });
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

        const visualValue = resolveDisplayValue(row, col);
        values.push(csvEscape(toEditable(visualValue)));
      }

      lines.push(values.join(","));
    }

    await writeClipboard(lines.join("\n"));
  }

  async function handlePasteSelection() {
    const pasteAnchor = getCellSelectionAnchor();
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
        patch[column] = coerceEditableValue(targetRow[column], raw);
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

  function renderValueEditor(props: {
    column: string;
    value: string;
    onChange: (value: string) => void;
    testId: string;
    disabled?: boolean;
    allowBlank?: boolean;
  }) {
    const fieldKind = getFieldKind(props.column);
    const relation = relationForActiveSheet[props.column];
    const relationOptions = relation ? relationPickerOptionsByColumn[props.column] ?? [] : [];
    const lookupOptions = lookupOptionsByColumn[props.column] ?? [];

    if (isModelTextColumn(props.column)) {
      return (
        <>
          <input
            type="text"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            data-testid={props.testId}
            placeholder="Digite o nome do modelo"
            list={modeloDatalistId}
            disabled={props.disabled}
          />
          <datalist id={modeloDatalistId}>
            {modeloRelationOptions.map((option) => (
              <option key={`mass-modelo-suggest-${option.value}`} value={option.label} />
            ))}
          </datalist>
        </>
      );
    }

    if (fieldKind === "relation") {
      return (
        <select
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          data-testid={props.testId}
          disabled={props.disabled}
        >
          {props.allowBlank ? <option value="">Limpar valor</option> : null}
          {relationOptions.length === 0 ? <option value="">Sem opcoes</option> : null}
          {relationOptions.map((option) => (
            <option key={`${props.column}-${option.value}-editor`} value={option.value}>
              {option.label} ({option.value})
            </option>
          ))}
        </select>
      );
    }

    if (fieldKind === "lookup") {
      return (
        <select
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          data-testid={props.testId}
          disabled={props.disabled}
        >
          {props.allowBlank ? <option value="">Limpar valor</option> : null}
          {lookupOptions.length === 0 ? <option value="">Sem opcoes</option> : null}
          {lookupOptions.map((option) => (
            <option key={`${props.column}-${option.value}-editor`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (fieldKind === "boolean") {
      return (
        <span className="sheet-form-boolean-input">
          <input
            type="checkbox"
            checked={parseBooleanLikeValue(props.value) === true}
            onChange={(event) => props.onChange(event.target.checked ? "true" : "false")}
            data-testid={props.testId}
            disabled={props.disabled}
          />
          <span>{parseBooleanLikeValue(props.value) === true ? "Sim" : "Nao"}</span>
        </span>
      );
    }

    return (
      <input
        type={fieldKind === "number" ? "number" : fieldKind === "datetime" ? "datetime-local" : "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        data-testid={props.testId}
        disabled={props.disabled}
      />
    );
  }

  async function openUpdateForm(row: Record<string, unknown>) {
    if (!canWriteActiveSheet) return;
    if (!isActiveSheetStateHydrated) return;

    if (isMissingAnuncioReferenceRow(row)) {
      await openInsertForm(buildMissingAnuncioInsertPrefill(row));
      setFormInfo("Referencia sem anuncio. Complete os campos para cadastrar o anuncio.");
      return;
    }

    const rowId = String(row[activeSheet.primaryKey] ?? "");
    if (!rowId) return;
    const requestId = formOpenRequestRef.current + 1;
    const initialValues = buildInitialFormValuesFromRow(row);
    const relationColumns = formEditableColumns.filter((column) => Boolean(relationForActiveSheet[column]));
    const shouldBoot = relationColumns.length > 0 || activeSheet.key === "carros";

    captureMobileBodyScrollPosition();
    setShowGridPanel(!isMobileSheetLayout());
    setShowFormPanel(true);
    setActiveRightTab("form");
    setFormMode("update");
    setEditingRowId(rowId);
    setFormError(null);
    setFormInfo(null);
    setFormValues(initialValues);
    setFormBooting(shouldBoot);
    setFormSubmitting(false);
    formOpenRequestRef.current = requestId;
    setCarFormSectionsOpen(readCarFormSectionsStorage());
    setPlateLookupSubmitting(false);
    setModeloQuickCreateOpen(false);
    setModeloQuickCreateValue("");
    setModeloQuickCreateError(null);
    setModeloQuickCreateSubmitting(false);
    setBulkError(null);
    setBulkSuccess(null);
    setBulkRawText("");
    setBulkSubmitting(false);
    resetCarFeatureFormState();

    try {
      await Promise.all([
        relationColumns.length > 0
          ? Promise.all(
              relationColumns.map(async (column) => {
                const relation = relationForActiveSheet[column];
                if (!relation) return;
                await ensureRelationLoaded(relation.table);
              })
            )
          : Promise.resolve(),
        activeSheet.key === "carros" ? loadCarFeatureFormState(rowId, requestId) : Promise.resolve()
      ]);

      if (requestId !== formOpenRequestRef.current) return;
      setFormValues(buildInitialFormValuesFromRow(row));
    } catch (err) {
      if (requestId !== formOpenRequestRef.current) return;
      setFormError(err instanceof Error ? err.message : "Falha ao preparar formulario de edicao.");
    } finally {
      if (requestId !== formOpenRequestRef.current) return;
      setFormBooting(false);
    }
  }

  async function openInsertForm(prefillValues: Record<string, string> = {}) {
    if (!canWriteActiveSheet) return;
    if (!isActiveSheetStateHydrated) return;
    if (formEditableColumns.length === 0) {
      setError("Nao ha campos editaveis para esta tabela.");
      return;
    }
    const requestId = formOpenRequestRef.current + 1;
    const relationColumns = formEditableColumns.filter((column) => Boolean(relationForActiveSheet[column]));
    const shouldBoot = relationColumns.length > 0 || activeSheet.key === "carros";

    captureMobileBodyScrollPosition();
    setShowGridPanel(!isMobileSheetLayout());
    setShowFormPanel(true);
    setActiveRightTab("form");
    setFormMode("insert");
    setEditingRowId(null);
    setFormError(null);
    setFormInfo(null);
    setFormValues({ ...buildInitialInsertValues({}), ...prefillValues });
    setFormBooting(shouldBoot);
    setFormSubmitting(false);
    formOpenRequestRef.current = requestId;
    setCarFormSectionsOpen(readCarFormSectionsStorage());
    setPlateLookupSubmitting(false);
    setModeloQuickCreateOpen(false);
    setModeloQuickCreateValue("");
    setModeloQuickCreateError(null);
    setModeloQuickCreateSubmitting(false);
    setBulkError(null);
    setBulkSuccess(null);
    setBulkRawText("");
    setBulkSubmitting(false);
    resetCarFeatureFormState();
    const relationDefaults: Record<string, string> = {};

    try {
      await Promise.all([
        relationColumns.length > 0
          ? Promise.all(
              relationColumns.map(async (column) => {
                const relation = relationForActiveSheet[column];
                if (!relation) return;
                const data = await ensureRelationLoaded(relation.table);
                const firstKey = data.rows.find((row) => row[relation.keyColumn] != null)?.[relation.keyColumn];
                if (firstKey != null) {
                  relationDefaults[column] = String(firstKey);
                }
              })
            )
          : Promise.resolve(),
        activeSheet.key === "carros" ? loadCarFeatureFormState(null, requestId) : Promise.resolve()
      ]);

      if (requestId !== formOpenRequestRef.current) return;
      setFormValues({ ...buildInitialInsertValues(relationDefaults), ...prefillValues });
    } catch (err) {
      if (requestId !== formOpenRequestRef.current) return;
      setFormError(err instanceof Error ? err.message : "Falha ao preparar formulario.");
    } finally {
      if (requestId !== formOpenRequestRef.current) return;
      setFormBooting(false);
    }
  }

  function openBulkInsertForm() {
    if (!canWriteActiveSheet) return;
    if (formEditableColumns.length === 0) {
      setError("Nao ha campos editaveis para esta tabela.");
      return;
    }

    captureMobileBodyScrollPosition();
    setShowGridPanel(!isMobileSheetLayout());
    setShowFormPanel(true);
    setActiveRightTab("form");
    setFormMode("bulk");
    formOpenRequestRef.current += 1;
    setEditingRowId(null);
    setFormError(null);
    setFormInfo(null);
    setFormValues({});
    setFormBooting(false);
    setFormSubmitting(false);
    resetCarFeatureFormState();
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

  async function loadSecondaryGridForSheet(sheet: SheetConfig) {
    const requestId = secondaryGridRequestRef.current + 1;
    secondaryGridRequestRef.current = requestId;
    setSecondaryGrid((prev) => ({
      sheet,
      payload: prev && prev.sheet.key === sheet.key ? prev.payload : null,
      loading: true,
      error: null
    }));
    setActiveRightTab("grid");
    try {
      const data = await fetchAllRowsForSheet(sheet.key);
      if (secondaryGridRequestRef.current !== requestId) return;
      setSecondaryGrid({ sheet, payload: data, loading: false, error: null });
    } catch (err) {
      if (secondaryGridRequestRef.current !== requestId) return;
      setSecondaryGrid({
        sheet,
        payload: null,
        loading: false,
        error: err instanceof Error ? err.message : "Falha ao carregar tabela secundaria."
      });
    }
  }

  function closeSecondaryGrid() {
    secondaryGridRequestRef.current += 1;
    setSecondaryGrid(null);
    setActiveRightTab((prev) => (prev === "grid" ? (showFormPanel ? "form" : null) : prev));
  }

  function openSecondaryGridSheet(sheetKey: SheetKey) {
    const sheet = SHEETS.find((entry) => entry.key === sheetKey);
    if (!sheet) return;
    void loadSecondaryGridForSheet(sheet);
  }

  function refreshSecondaryGrid() {
    if (!secondaryGrid) return;
    void loadSecondaryGridForSheet(secondaryGrid.sheet);
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
      const nextColor = normalizeCarColorValue(data.cor);

      setFormValues((prev) => ({
        ...prev,
        placa: data.placa ?? rawPlate,
        modelo_id: nextModelo || prev.modelo_id || "",
        nome: prev.nome?.trim() ? prev.nome : nextNome,
        cor: nextColor ?? prev.cor ?? "",
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
    if (!canWriteActiveSheet || formSubmitting || !isCarFeatureDataReady) return;

    const row: Record<string, unknown> = {};
    for (const column of formEditableColumns) {
      row[column] = coerceSheetFormValue(column, formValues[column] ?? "");
    }

    setFormSubmitting(true);
    setFormError(null);
    setFormInfo(null);
    try {
      if (formMode === "update" && editingRowId) {
        row[activeSheet.primaryKey] = editingRowId;
      }

      const response = await upsertRowWithPriceContextSafe({ table: activeSheet.key, row });

      if (isCarSingleForm) {
        const carroId = String(response.row.id ?? editingRowId ?? "");
        if (!carroId) {
          throw new Error("Falha ao identificar o carro salvo para sincronizar caracteristicas.");
        }

        await syncCarroCaracteristicas({
          carroId,
          caracteristicasVisuaisIds: selectedVisualFeatureIds,
          caracteristicasTecnicasIds: selectedTechnicalFeatureIds,
          requestAuth
        });
      }

      await loadGrid();

      if (formMode === "update") {
        setFormValues(buildInitialFormValuesFromRow(response.row));
        setFormInfo(isCarSingleForm ? "Registro e caracteristicas atualizados." : "Registro atualizado.");
      } else {
        closeFormPanel();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : formMode === "update" ? "Falha ao atualizar linha." : "Falha ao inserir linha.");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDeleteEditingRow() {
    if (!canDeleteActiveSheet || !editingRowId) return;
    if (!window.confirm("Excluir este registro?")) return;

    try {
      await deleteSheetRow({ table: activeSheet.key, id: editingRowId, requestAuth });
      closeFormPanel();
      await loadGrid();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao excluir linha.");
    }
  }

  async function handleFinalizeEditingRow() {
    if (!canFinalizeSelected || activeSheet.key !== "carros" || !editingRowId || formSubmitting || !isCarFeatureDataReady) return;
    if (!window.confirm("Salvar este carro como vendido?")) return;

    const row: Record<string, unknown> = {};
    for (const column of formEditableColumns) {
      row[column] = coerceSheetFormValue(column, formValues[column] ?? "");
    }

    row[activeSheet.primaryKey] = editingRowId;
    row.estado_venda = "VENDIDO";

    setFormSubmitting(true);
    setFormError(null);
    setFormInfo(null);

    try {
      const response = await upsertRowWithPriceContextSafe({ table: activeSheet.key, row });
      const carroId = String(response.row.id ?? editingRowId);

      await syncCarroCaracteristicas({
        carroId,
        caracteristicasVisuaisIds: selectedVisualFeatureIds,
        caracteristicasTecnicasIds: selectedTechnicalFeatureIds,
        requestAuth
      });

      await loadGrid();
      setFormValues(buildInitialFormValuesFromRow(response.row));
      setFormInfo("Veiculo marcado como vendido.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao salvar veiculo como vendido.");
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
          row[column] = coerceSheetFormValue(column, rawValues[colIndex] ?? "");
        }

        await upsertRowWithPriceContextSafe({ table: activeSheet.key, row });
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

  async function submitMassUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteActiveSheet || massUpdateSubmitting) return;
    if (selectedRows.size === 0) {
      setMassUpdateError("Selecione ao menos uma linha para aplicar a alteracao em massa.");
      return;
    }
    if (!massUpdateColumn) {
      setMassUpdateError("Selecione a coluna que sera alterada.");
      return;
    }

    const nextValue = massUpdateClearValue ? null : coerceSheetFormValue(massUpdateColumn, massUpdateValue);
    const rowIds = Array.from(selectedRows);
    const patch = { [massUpdateColumn]: nextValue };

    // Detect price column to collect a single shared context
    const isPriceMassColumn =
      (activeSheet.key === "carros" && massUpdateColumn === "preco_original") ||
      (activeSheet.key === "anuncios" && massUpdateColumn === "valor_anuncio");
    let sharedPriceChangeContext: string | null = null;
    if (isPriceMassColumn) {
      sharedPriceChangeContext = await askPriceChangeContext({ hint: "Explique a alteração de preço (aplicada a todas as linhas)" });
      if (!sharedPriceChangeContext) {
        setMassUpdateError("Contexto de alteração de preço é obrigatório para alteração em massa.");
        return;
      }
    }

    setMassUpdateSubmitting(true);
    setMassUpdateError(null);

    try {
      // Throttled concurrency with basic retry to avoid flooding the API
      const CONCURRENCY = 8;
      const RETRIES = 2;
      const results: Array<PromiseSettledResult<string>> = [];

      async function sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      async function updateRowWithRetry(rowId: string) {
        let attempt = 0;
        while (true) {
          try {
            await upsertSheetRow({
              table: activeSheet.key as SheetKey,
              requestAuth,
              row: { [activeSheet.primaryKey]: rowId, ...patch },
              priceChangeContext: sharedPriceChangeContext ?? null
            });
            return rowId;
          } catch (err) {
            const isApi = err instanceof ApiClientError;
            const retryable = isApi ? err.status >= 500 || err.code === "REQUEST_TIMEOUT" || err.code === "INTERNAL_ERROR" : true;
            if (!retryable || attempt >= RETRIES) throw err;
            attempt += 1;
            await sleep(400 * attempt);
          }
        }
      }

      for (let i = 0; i < rowIds.length; i += CONCURRENCY) {
        const batch = rowIds.slice(i, i + CONCURRENCY);
        // Run a small batch in parallel
        const settled = await Promise.allSettled(batch.map((rowId) => updateRowWithRetry(rowId)));
        results.push(...settled);
      }

      const failedRowIds = results.flatMap((result, index) => (result.status === "rejected" ? [rowIds[index]] : []));
      const successCount = results.length - failedRowIds.length;

      await loadGrid();

      if (failedRowIds.length > 0) {
        const failedPreview = failedRowIds.slice(0, 5).join(", ");
        const failedSuffix = failedRowIds.length > 5 ? "..." : "";
        setMassUpdateError(
          `${successCount} linha(s) atualizada(s) e ${failedRowIds.length} falharam (${failedPreview}${failedSuffix}).`
        );
        return;
      }

      setMassUpdateDialogOpen(false);
      setMassUpdateValue("");
      setMassUpdateClearValue(false);
      setSelectedRows(new Set<string>());
      setFormInfo(`${successCount} linha(s) atualizada(s) em massa.`);
    } catch (err) {
      setMassUpdateError(err instanceof Error ? err.message : "Falha ao aplicar alteracao em massa.");
      await loadGrid();
    } finally {
      setMassUpdateSubmitting(false);
    }
  }

  async function handleGeneratePrint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (printSubmitting) return;
    if (printColumns.length === 0) {
      setPrintError("Selecione ao menos uma coluna para imprimir.");
      return;
    }

    const sourceRows = printBaseRows;
    const effectivePrintFilters = isPrintTableScope ? printFilters : {};
    const filteredRows = filterRowsByPrintFilters(sourceRows, effectivePrintFilters);
    if (filteredRows.length === 0) {
      setPrintError("Nao ha linhas disponiveis para gerar a tabela.");
      return;
    }

    if (printSectionColumn && printSectionValues.length === 0 && !printIncludeOthers) {
      setPrintError("Selecione ao menos um valor de separacao ou habilite a secao Outros.");
      return;
    }

    const normalizedHighlightRules = printHighlightRules
      .map((rule, index) =>
        normalizePrintHighlightRule(
          {
            ...rule,
            columnLabel: rule.column ? getPrintColumnLabel(rule.column) : ""
          },
          index
        )
      )
      .filter((rule) => !isPrintHighlightRuleEmpty(rule));
    const invalidHighlightRuleIndex = normalizedHighlightRules.findIndex(
      (rule) => !rule.column || !rule.label || (operatorNeedsValues(rule.operator) && (rule.values?.length ?? 0) === 0)
    );
    if (invalidHighlightRuleIndex >= 0) {
      setPrintError(`Preencha coluna, operacao, valor e nome em todos os indices (${invalidHighlightRuleIndex + 1}).`);
      return;
    }

    setPrintSubmitting(true);
    setPrintError(null);

    try {
      await executePreparedPrintJob({
        title: printTitle.trim() || activeSheet.label,
        rows: sourceRows,
        filters: effectivePrintFilters,
        columns: printColumns.map((column) => ({
          key: column,
          label: getPrintColumnLabel(column)
        })),
        preserveRowOrder: !isPrintTableScope,
        sortColumn: isPrintTableScope ? printSortColumn : "",
        sortDirection: printSortDirection,
        sortLabel: isPrintTableScope && printSortColumn ? getPrintColumnLabel(printSortColumn) : "",
        sectionColumn: printSectionColumn,
        sectionValues: printSectionValues,
        includeOthers: printIncludeOthers,
        itemLabelPlural: activeSheet.key === "carros" ? "veiculos" : "registros",
        highlightRules: normalizedHighlightRules,
        highlightOpacityPercent: printHighlightOpacityPercent,
        resolveValue: resolveEffectivePrintValue
      });
      setPrintDialogOpen(false);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Falha ao gerar impressao.");
    } finally {
      setPrintSubmitting(false);
    }
  }

  async function handleQuickPrintCarros() {
    if (quickPrintSubmitting) return;

    setQuickPrintSubmitting(true);
    setError(null);

    try {
      const carrosSheet = SHEETS.find((sheet) => sheet.key === "carros") ?? DEFAULT_SHEET;
      const carrosPayload =
        activeSheet.key === "carros" && payload.table === "carros" && payload.rows.length > 0
          ? payload
          : await fetchAllRowsForSheet("carros");
      const nextRelationCache: Partial<Record<SheetKey, GridListPayload>> = { ...relationCache };
      const currentLookups = lookups ?? (await fetchLookups(requestAuth));

      nextRelationCache.modelos = nextRelationCache.modelos ?? (await ensureRelationLoaded("modelos"));

      const quickDisplayOverrides = {
        modelo_id: "modelo"
      };
      const quickRelationLookup = buildRelationDisplayLookup("carros", quickDisplayOverrides, nextRelationCache);
      quickRelationLookup.local = Object.fromEntries(currentLookups.locations.map((item) => [item.code, item.name]));
      quickRelationLookup.estado_venda = Object.fromEntries(currentLookups.sale_statuses.map((item) => [item.code, item.name]));
      quickRelationLookup.estado_veiculo = Object.fromEntries(currentLookups.vehicle_states.map((item) => [item.code, item.name]));
      const resolveQuickDisplayValue = (row: Record<string, unknown>, column: string) =>
        resolveDisplayValueFromLookup(row, column, quickRelationLookup);
      const estadoVendaFilters = resolvePrintFilterLiteralsFromLabels({
        rows: carrosPayload.rows,
        column: "estado_venda",
        labels: ["NOVO", "DISPONIVEL"],
        resolveValue: resolveQuickDisplayValue
      });
      const emEstoqueFilters = resolvePrintFilterLiteralsFromLabels({
        rows: carrosPayload.rows,
        column: "em_estoque",
        labels: ["Sim"],
        resolveValue: resolveQuickDisplayValue
      });
      const quickPrintFilters = {
        estado_venda: estadoVendaFilters,
        em_estoque: emEstoqueFilters
      };

      const preferredSections = ["Loja 1", "Loja 2", "Loja 3"];
      const availableSectionValues = new Map<string, string>();
      const baseQuickPrintRows = filterRowsByPrintFilters(carrosPayload.rows, quickPrintFilters);
      for (const row of baseQuickPrintRows) {
        const rawValue = row.local;
        if (rawValue == null || rawValue === "") continue;
        const literal = String(rawValue);
        if (availableSectionValues.has(literal)) continue;
        availableSectionValues.set(literal, toDisplay(resolveQuickDisplayValue(row, "local"), "local"));
      }

      const sectionValues = preferredSections
        .map((label) =>
          Array.from(availableSectionValues.entries()).find(([, visibleLabel]) => {
            return normalizeBulkToken(visibleLabel) === normalizeBulkToken(label);
          })?.[0] ?? null
        )
        .filter((value): value is string => Boolean(value));

      await executePreparedPrintJob({
        title: carrosSheet.label,
        rows: carrosPayload.rows,
        filters: quickPrintFilters,
        columns: [
          { key: "modelo_id", label: "Modelo" },
          { key: "cor", label: "cor" },
          { key: "ano_fab", label: "Fabr." },
          { key: "ano_mod", label: "Ano" },
          { key: "placa", label: "Placa" },
          { key: "hodometro", label: "KM" },
          { key: "preco_original", label: "Preço" }
        ],
        sortColumn: "preco_original",
        sortDirection: "asc",
        sortLabel: "Preço",
        sectionColumn: "local",
        sectionValues,
        includeOthers: true,
        itemLabelPlural: "veiculos",
        highlightOpacityPercent: DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT,
        highlightRules: [
          {
            id: createLocalId("quick-print-highlight"),
            column: "ano_ipva_pago",
            columnLabel: "ano_ipva_pago",
            operator: "eq",
            valuesInput: "2026",
            label: "IPVA PAGO",
            color: "#facc15"
          },
          {
            id: createLocalId("quick-print-highlight"),
            column: "estado_veiculo",
            columnLabel: "estado_veiculo",
            operator: "neq",
            valuesInput: "PRONTO",
            label: "PREPARAÇÃO",
            color: "#dc2626"
          }
        ],
        resolveValue: resolveQuickDisplayValue
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar impressao.");
    } finally {
      setQuickPrintSubmitting(false);
    }
  }

  async function handleFinalizeSelected() {
    if (!canFinalizeSelected || selectedRows.size === 0) return;

    const ids = Array.from(selectedRows);
    for (const id of ids) {
      enqueuePersistence(async () => {
        const response = await runFinalize(id, requestAuth);
        updateLocalRow(id, response.carro);
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

  async function handleOpenAnuncioInsightsFromHeader() {
    if (!anuncioInsightHeaderTargetRowId) {
      setError("Selecione ou clique em um anuncio para abrir os insights.");
      return;
    }

    await openAnuncioInsightsPanel(anuncioInsightHeaderTargetRowId);
  }

  async function handleVerifyCurrentAnuncioInsight() {
    const rowId = anuncioInsightsRowId ?? anuncioInsightHeaderTargetRowId;
    if (!canVerifyAnuncioInsight || !rowId) return;
    if (rowId.startsWith("missing:")) {
      setAnuncioInsightsError("Linhas de referencia sem anuncio precisam ser cadastradas antes de verificar.");
      return;
    }

    const code = anuncioInsights[0]?.code ?? "ATUALIZAR_ANUNCIO";
    await verifyAnuncioInsight({ id: rowId, code, requestAuth });
    await loadGrid();
    await openAnuncioInsightsPanel(rowId);
  }

  async function toggleGroup(groupId: string) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

    if (repetidosByGroup[groupId] || loadingRepeatedGroupIds.has(groupId)) return;

    setLoadingRepeatedGroupIds((prev) => new Set(prev).add(groupId));

    if (!relationCache.modelos) {
      void ensureRelationLoaded("modelos").catch(() => undefined);
    }

    try {
      const repeatedRowsResponse = await fetchSheetRows({
        table: "repetidos",
        requestAuth,
        page: 1,
        pageSize: 200,
        query: "",
        matchMode: "contains",
        filters: { grupo_id: `=${groupId}` },
        sort: []
      });
      const repeatedCarIds = repeatedRowsResponse.rows
        .map((row) => String(row.carro_id ?? "").trim())
        .filter(Boolean);

      if (repeatedCarIds.length === 0) {
        setRepetidosByGroup((prev) => ({ ...prev, [groupId]: [] }));
        return;
      }

      const [carrosResponse, anunciosResponse] = await Promise.all([
        fetchSheetRows({
          table: "carros",
          requestAuth,
          page: 1,
          pageSize: 200,
          query: "",
          matchMode: "contains",
          filters: { id: repeatedCarIds.join("|") },
          sort: []
        }),
        fetchSheetRows({
          table: "anuncios",
          requestAuth,
          page: 1,
          pageSize: 200,
          query: "",
          matchMode: "contains",
          filters: { carro_id: repeatedCarIds.join("|") },
          sort: []
        })
      ]);

      const announcedCarIds = new Set(
        anunciosResponse.rows
          .map((row) => String(row.carro_id ?? "").trim())
          .filter(Boolean)
      );
      const carrosById = new Map(
        carrosResponse.rows
          .map((row) => {
            const rowId = String(row.id ?? "").trim();
            return rowId ? ([rowId, row] as const) : null;
          })
          .filter((entry): entry is readonly [string, Record<string, unknown>] => entry !== null)
      );

      const detailedRows: Array<Record<string, unknown>> = repeatedCarIds
        .map((carroId) => carrosById.get(carroId))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => ({
          ...row,
          carro_id: String(row.id ?? ""),
          grupo_id: groupId,
          __has_anuncio: announcedCarIds.has(String(row.id ?? ""))
        }));

      const bucketMap = new Map<string, Array<Record<string, unknown>>>();
      for (const row of detailedRows) {
        const bucketKey = buildRepeatedPriceBucketKey(row.preco_original);
        const bucketRows = bucketMap.get(bucketKey) ?? [];
        bucketRows.push(row);
        bucketMap.set(bucketKey, bucketRows);
      }

      const orderedRows = Array.from(bucketMap.entries())
        .sort(([leftKey], [rightKey]) => {
          if (leftKey === "__sem_preco__" && rightKey === "__sem_preco__") return 0;
          if (leftKey === "__sem_preco__") return 1;
          if (rightKey === "__sem_preco__") return -1;
          return compareNullableNumbersAsc(Number(leftKey), Number(rightKey));
        })
        .flatMap(([bucketKey, bucketRows]) => {
          const orderedBucketRows = [...bucketRows].sort(compareRepeatedVehicleReferencePriority);

          return orderedBucketRows.map((row, index) => ({
            ...row,
            __price_bucket_key: bucketKey,
            __price_bucket_count: orderedBucketRows.length,
            __is_reference_choice: index === 0
          }));
        });

      setRepetidosByGroup((prev) => ({ ...prev, [groupId]: orderedRows }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar itens do grupo.");
    } finally {
      setLoadingRepeatedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }

  const handleSheetSelection = useCallback((sheetKey: SheetKey) => {
    setActiveSheetKey(sheetKey);
    if (isMobileSheetLayout()) {
      setSidebarOpen(false);
    }
  }, []);

  function closeGridPanel() {
    if (!rightPanelOpen) return;
    setShowGridPanel(false);
  }

  function closeFormPanel() {
    formOpenRequestRef.current += 1;
    if (!showGridPanel) {
      setShowGridPanel(true);
    }
    setShowFormPanel(false);
    setActiveRightTab((prev) => (prev === "form" ? (secondaryGrid ? "grid" : null) : prev));
    setFormMode("insert");
    setEditingRowId(null);
    setFormValues({});
    setFormError(null);
    setFormInfo(null);
    resetCarFeatureFormState();
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

  function startSplitResizeAt(clientX: number, event?: { preventDefault?: () => void; stopPropagation?: () => void }) {
    if (!showGridPanel || !rightPanelOpen) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const nextState: SplitResizeState = {
      startX: clientX,
      startRatio: splitRatio
    };
    splitResizeRef.current = nextState;
    setSplitResizeState(nextState);
  }

  function startSplitResize(event: React.PointerEvent<HTMLDivElement>) {
    startSplitResizeAt(event.clientX, event);
  }

  function startSplitResizeMouse(event: React.MouseEvent<HTMLDivElement>) {
    startSplitResizeAt(event.clientX, event);
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

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput, setQuery]);

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

      setShowGridPanel((current) => normalizeWorkspacePanels({ grid: current, form: showFormPanel }, !media.matches).grid);
    };

    resetSidebar();
    media.addEventListener("change", resetSidebar);
    return () => media.removeEventListener("change", resetSidebar);
  }, [setShowGridPanel, showFormPanel]);

  useEffect(() => {
    if (!showFormPanel || formMode !== "bulk") return;
    focusWithoutScroll(bulkTextareaRef.current);
  }, [formMode, showFormPanel]);

  useEffect(() => {
    if (!showFormPanel || showGridPanel) return;
    if (!isMobileSheetLayout()) return;

    if (mobileBodyScrollRestoreFrameRef.current != null) {
      window.cancelAnimationFrame(mobileBodyScrollRestoreFrameRef.current);
      mobileBodyScrollRestoreFrameRef.current = null;
    }

    const snapshot = mobileBodyScrollLockRef.current ?? buildMobileBodyScrollLockSnapshot();
    mobileBodyScrollLockRef.current = snapshot;
    if (!mobileBodyScrollRestoreRef.current) {
      mobileBodyScrollRestoreRef.current = { left: snapshot.scrollLeft, top: snapshot.scrollTop };
    }

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${snapshot.scrollTop}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    return () => {
      const currentSnapshot = mobileBodyScrollLockRef.current ?? snapshot;
      document.body.style.overflow = currentSnapshot.overflow;
      document.body.style.position = currentSnapshot.position;
      document.body.style.top = currentSnapshot.top;
      document.body.style.left = currentSnapshot.left;
      document.body.style.right = currentSnapshot.right;
      document.body.style.width = currentSnapshot.width;
      mobileBodyScrollLockRef.current = null;
    };
  }, [showFormPanel, showGridPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (showFormPanel || !showGridPanel) return;
    if (!mobileBodyScrollRestoreRef.current) return;

    if (mobileBodyScrollRestoreFrameRef.current != null) {
      window.cancelAnimationFrame(mobileBodyScrollRestoreFrameRef.current);
      mobileBodyScrollRestoreFrameRef.current = null;
    }

    const restoreScrollPosition = (attempt = 0) => {
      const restoreTarget = mobileBodyScrollRestoreRef.current;
      if (!restoreTarget) {
        mobileBodyScrollRestoreFrameRef.current = null;
        return;
      }

      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(restoreTarget.left, restoreTarget.top);
      document.documentElement.style.scrollBehavior = previousScrollBehavior;

      const restoredLeft = Math.abs(window.scrollX - restoreTarget.left) <= 1;
      const restoredTop = Math.abs(window.scrollY - restoreTarget.top) <= 1;
      if ((!restoredLeft || !restoredTop) && attempt < 6) {
        mobileBodyScrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
          restoreScrollPosition(attempt + 1);
        });
        return;
      }

      mobileBodyScrollRestoreRef.current = null;
      mobileBodyScrollRestoreFrameRef.current = null;
    };

    mobileBodyScrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
      mobileBodyScrollRestoreFrameRef.current = window.requestAnimationFrame(restoreScrollPosition);
    });

    return () => {
      if (mobileBodyScrollRestoreFrameRef.current != null) {
        window.cancelAnimationFrame(mobileBodyScrollRestoreFrameRef.current);
        mobileBodyScrollRestoreFrameRef.current = null;
      }
    };
  }, [showFormPanel, showGridPanel]);

  useEffect(() => {
    return () => {
      if (mobileBodyScrollRestoreFrameRef.current != null) {
        window.cancelAnimationFrame(mobileBodyScrollRestoreFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!massUpdateDialogOpen || !massUpdateColumn) return;
    const relation = relationForActiveSheet[massUpdateColumn];
    if (!relation) return;
    if (relationCache[relation.table]) return;
    void ensureRelationLoaded(relation.table);
  }, [ensureRelationLoaded, massUpdateColumn, massUpdateDialogOpen, relationCache, relationForActiveSheet]);

  useEffect(() => {
    if (!printDialogOpen) return;
    if (!printSectionColumn) {
      setPrintSectionValues([]);
      return;
    }

    const availableLiterals = printSectionOptions.map((option) => option.literal);
    setPrintSectionValues((prev) => {
      const retained = prev.filter((value) => availableLiterals.includes(value));
      if (retained.length > 0) {
        return [...retained, ...availableLiterals.filter((value) => !retained.includes(value))];
      }
      return availableLiterals;
    });
  }, [printDialogOpen, printSectionColumn, printSectionOptions, setPrintSectionValues]);

  useEffect(() => {
    if (!printDialogOpen) return;

    writeStorage<StoredPrintConfig>(storageKey(activeSheetKey, "print"), {
      title: printTitle,
      scope: printScope,
      columns: printColumns,
      columnLabels: printColumnLabels,
      filters: printFilters,
      displayColumnOverrides: printDisplayColumnOverrides,
      sortColumn: printSortColumn,
      sortDirection: printSortDirection,
      sectionColumn: printSectionColumn,
      sectionValues: printSectionValues,
      includeOthers: printIncludeOthers,
      highlightOpacityPercent: printHighlightOpacityPercent,
      highlightRules: printHighlightRules
    });
  }, [
    activeSheetKey,
    printColumnLabels,
    printColumns,
    printDialogOpen,
    printDisplayColumnOverrides,
    printFilters,
    printHighlightOpacityPercent,
    printHighlightRules,
    printIncludeOthers,
    printScope,
    printSectionColumn,
    printSectionValues,
    printSortColumn,
    printSortDirection,
    printTitle
  ]);

  useEffect(() => {
    if (printDialogOpen) return;
    closePrintFilterPopover();
  }, [closePrintFilterPopover, printDialogOpen]);

  useEffect(() => {
    if (isPrintTableScope) return;
    closePrintFilterPopover();
    setRelationDialog((prev) => (prev?.target === "print" ? null : prev));
  }, [closePrintFilterPopover, isPrintTableScope, setRelationDialog]);

  useEffect(() => {
    if (!filterPopoverColumn) return;
    const openColumn = filterPopoverColumn;
    updateFilterPopoverPosition(openColumn);

    function onPointerDown(event: PointerEvent) {
      if (filterPopoverRef.current?.contains(event.target as Node)) return;
      const trigger = filterTriggerRefs.current[openColumn];
      if (trigger?.contains(event.target as Node)) return;
      closeFilterPopover();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeFilterPopover();
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
  }, [closeFilterPopover, filterPopoverColumn, updateFilterPopoverPosition]);

  useEffect(() => {
    if (!printFilterPopoverColumn) return;
    const openColumn = printFilterPopoverColumn;
    updatePrintFilterPopoverPosition(openColumn);

    function onPointerDown(event: PointerEvent) {
      if (printFilterPopoverRef.current?.contains(event.target as Node)) return;
      const trigger = printFilterTriggerRefs.current[openColumn];
      if (trigger?.contains(event.target as Node)) return;
      closePrintFilterPopover();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePrintFilterPopover();
      }
    }

    function onReposition() {
      updatePrintFilterPopoverPosition(openColumn);
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
  }, [closePrintFilterPopover, printFilterPopoverColumn, updatePrintFilterPopoverPosition]);

  useEffect(() => {
    const storedFilters = readStorage<GridFilters>(storageKey(activeSheetKey, "filters"), {});
    const storedWidths = readStorage<Record<string, number>>(storageKey(activeSheetKey, "widths"), {});
    const storedHidden = readStorage<string[]>(storageKey(activeSheetKey, "hidden"), []);
    const storedConference = readStorage<string[]>(storageKey(activeSheetKey, "conference"), []);
    const storedModes = readStorage<StoredSelectionModes>(storageKey(activeSheetKey, "modes"), {
      conference: false,
      editor: false
    });
    const storedDisplay = readStorage<Record<string, string>>(storageKey(activeSheetKey, "display"), {});
    const storedSort = readStorage<SortRule[]>(storageKey(activeSheetKey, "sort"), []);
    const storedLayout = readStorage<StoredSheetLayout>(storageKey(activeSheetKey, "layout"), {
      hiddenColumns: [],
      pinnedColumn: null
    });
    const storedPagination = readStorage<StoredSheetPagination>(storageKey(activeSheetKey, "page"), {
      page: 1,
      pageSize: 25
    });
    const storedScroll = readStorage<StoredGridScroll>(storageKey(activeSheetKey, "scroll"), {
      left: 0,
      top: 0
    });
    const storedPanels = normalizeWorkspacePanels(
      readStorage<StoredWorkspacePanels>(storageKey(activeSheetKey, "panels"), {
        grid: true,
        form: false
      }),
      isMobileSheetLayout()
    );

    setFilters(storedFilters);
    setColumnWidths(storedWidths);
    setSortChain(storedSort);
    setSelectionModes(storedModes);
    setDisplayColumnBySheet((prev) => ({ ...prev, [activeSheetKey]: storedDisplay }));
    setHiddenRowsByTable((prev) => ({ ...prev, [activeSheetKey]: storedHidden }));
    setConferenceRowsByTable((prev) => ({ ...prev, [activeSheetKey]: storedConference }));
    setSheetLayoutByTable((prev) => ({ ...prev, [activeSheetKey]: storedLayout }));

    setPage(Math.max(1, storedPagination.page || 1));
    setPageSize([25, 50, 100].includes(storedPagination.pageSize) ? storedPagination.pageSize : 25);
    prepareGridScrollRestore(storedScroll);
    setExpandedGroupIds(new Set());
    setRepetidosByGroup({});
    setLoadingRepeatedGroupIds(new Set());
    closeFilterPopover();
    closePrintFilterPopover();
    closeGridDrawers();
    setMassUpdateDialogOpen(false);
    setMassUpdateError(null);
    setPrintDialogOpen(false);
    setPrintColumnLabels({});
    setPrintFilters({});
    setPrintDisplayColumnOverrides({});
    setPrintError(null);
    clearSelection();
    setShowFormPanel(storedPanels.form);
    setShowGridPanel(storedPanels.grid);
    setFormMode("insert");
    setEditingRowId(null);
    formOpenRequestRef.current += 1;
    setFormValues({});
    setFormError(null);
    resetCarFeatureFormState();
    setBulkError(null);
    setBulkSuccess(null);
    setBulkRawText("");
    setBulkSubmitting(false);
    setHydratedSheetStateKey(activeSheetKey);
  }, [
    activeSheetKey,
    clearSelection,
    closeGridDrawers,
    closeFilterPopover,
    closePrintFilterPopover,
    prepareGridScrollRestore,
    setDisplayColumnBySheet,
    setFilters,
    setMassUpdateDialogOpen,
    setMassUpdateError,
    setPage,
    setPageSize,
    setPrintColumnLabels,
    setPrintDialogOpen,
    setPrintDisplayColumnOverrides,
    setPrintError,
    setPrintFilters,
    setSelectionModes,
    setShowFormPanel,
    setShowGridPanel,
    setSortChain
  ]);

  useEffect(() => {
    if (!isActiveSheetStateHydrated) return;
    persistWorkspacePanels(
      activeSheetKey,
      normalizeWorkspacePanels({ grid: showGridPanel, form: showFormPanel }, isMobileSheetLayout())
    );
  }, [activeSheetKey, isActiveSheetStateHydrated, showFormPanel, showGridPanel]);

  useEffect(() => {
    if (allColumns.length === 0) return;

    const validColumns = new Set(allColumns);
    const nextHiddenColumns = activeSheetLayout.hiddenColumns.filter((column) => validColumns.has(column));
    const nextPinnedColumn =
      activeSheetLayout.pinnedColumn && validColumns.has(activeSheetLayout.pinnedColumn) && !nextHiddenColumns.includes(activeSheetLayout.pinnedColumn)
        ? activeSheetLayout.pinnedColumn
        : null;

    if (
      nextHiddenColumns.length === activeSheetLayout.hiddenColumns.length &&
      nextPinnedColumn === activeSheetLayout.pinnedColumn
    ) {
      return;
    }

    updateActiveSheetLayout(() => ({
      hiddenColumns: nextHiddenColumns,
      pinnedColumn: nextPinnedColumn
    }));
  }, [activeSheetLayout.hiddenColumns, activeSheetLayout.pinnedColumn, allColumns, updateActiveSheetLayout]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  useEffect(() => {
    const requiredTables = Array.from(
      new Set(
        [...Object.keys(displayColumnOverrides), ...Object.keys(printDisplayColumnOverrides)]
          .map((column) => relationForActiveSheet[column]?.table)
          .filter((table): table is SheetKey => Boolean(table))
      )
    );

    for (const table of requiredTables) {
      if (relationCache[table]) continue;
      void ensureRelationLoaded(table);
    }
  }, [displayColumnOverrides, ensureRelationLoaded, printDisplayColumnOverrides, relationCache, relationForActiveSheet]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(locallyFilteredRows.length / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [locallyFilteredRows.length, page, pageSize, setPage]);

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
  }, [setSplitRatio, setSplitResizeState]);

  useEffect(() => {
    if (!isActiveSheetStateHydrated) return;
    persistSheetState(activeSheetKey, {
      filters,
      widths: columnWidths,
      sort: sortChain,
      display: displayColumnOverrides,
      layout: activeSheetLayout
    });
  }, [activeSheetKey, activeSheetLayout, columnWidths, displayColumnOverrides, filters, isActiveSheetStateHydrated, sortChain]);

  useEffect(() => {
    if (!isActiveSheetStateHydrated) return;
    persistPaginationState(activeSheetKey, { page, pageSize });
  }, [activeSheetKey, isActiveSheetStateHydrated, page, pageSize]);

  useEffect(() => {
    if (!isActiveSheetStateHydrated) return;
    persistSelectionModes(activeSheetKey, selectionModes);
  }, [activeSheetKey, isActiveSheetStateHydrated, selectionModes]);

  useEffect(() => {
    if (!showFormPanel || showGridPanel || formMode !== "insert" || activeSheet.key !== "carros" || formBooting) return;
    if (!isMobileSheetLayout()) return;

    const plateField = plateFieldRef.current;
    if (!plateField) return;

    const frame = window.requestAnimationFrame(() => {
      focusAndSelectWithoutScroll(plateField);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeSheet.key, formBooting, formMode, showFormPanel, showGridPanel]);

  const activeFilterColumn = filterPopoverColumn;
  const activeFilterRelation = activeFilterColumn ? relationForActiveSheet[activeFilterColumn] : null;
  const activeFilterValues = filterDraftValues;
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((expression) => expression.trim().length > 0).length,
    [filters]
  );
  const activeFilterSearch = filterPopoverSearch.trim().toLowerCase();
  const activeFilterAllOptions = activeFilterColumn ? columnFilterOptions[activeFilterColumn] ?? [] : [];
  const activeFilterOptions = activeFilterColumn
    ? activeFilterAllOptions.filter((option) => {
        if (!activeFilterSearch) return true;
        return (
          option.label.toLowerCase().includes(activeFilterSearch) ||
          option.literal.toLowerCase().includes(activeFilterSearch) ||
          (option.literal === EMPTY_FILTER_LITERAL && "vazio".includes(activeFilterSearch))
        );
      })
    : [];
  const activeFilterIsDateColumn = activeFilterAllOptions.some((option) => isDateFilterLiteral(option.literal));
  const activePrintFilterColumn = printFilterPopoverColumn;
  const activePrintFilterRelation =
    isPrintTableScope && activePrintFilterColumn ? relationForActiveSheet[activePrintFilterColumn] : null;
  const activePrintFilterValues = printFilterDraftValues;
  const activePrintFilterSearch = printFilterPopoverSearch.trim().toLowerCase();
  const activePrintFilterAllOptions =
    isPrintTableScope && activePrintFilterColumn ? printColumnFilterOptions[activePrintFilterColumn] ?? [] : [];
  const activePrintFilterOptions = isPrintTableScope && activePrintFilterColumn
    ? activePrintFilterAllOptions.filter((option) => {
        if (!activePrintFilterSearch) return true;
        return (
          option.label.toLowerCase().includes(activePrintFilterSearch) ||
          option.literal.toLowerCase().includes(activePrintFilterSearch) ||
          (option.literal === EMPTY_FILTER_LITERAL && "vazio".includes(activePrintFilterSearch))
        );
      })
    : [];
  const activePrintFilterIsDateColumn = activePrintFilterAllOptions.some((option) => isDateFilterLiteral(option.literal));
  const relationDialogPayload = relationDialog ? relationCache[relationDialog.targetTable] ?? null : null;
  const rightPanelOpen = !isAuditDashboardSheet && (secondaryGrid != null || showFormPanel);
  const hasSplitPanels = !isAuditDashboardSheet && showGridPanel && (secondaryGrid != null || showFormPanel);
  const canCloseGridPanel = Boolean(secondaryGrid) || showFormPanel;
  const canCloseFormPanel = true;
  const hiddenColumnsDialogOptions = useMemo<HolisticChooserOption[]>(
    () => [
      ...(activeSheetLayout.hiddenColumns.length > 1
        ? [
            {
              key: "__all__",
              label: "Revelar todas",
              description: `Mostrar novamente as ${activeSheetLayout.hiddenColumns.length} colunas ocultas.`,
              testId: "hidden-columns-option-all"
            }
          ]
        : []),
      ...activeSheetLayout.hiddenColumns.map((column) => ({
        key: column,
        label: column,
        description: "Revelar esta coluna no grid.",
        testId: `hidden-columns-option-${column}`
      }))
    ],
    [activeSheetLayout.hiddenColumns]
  );
  const selectionDialogOptions = useMemo<HolisticChooserOption[]>(
    () => [
      {
        key: "select-visible",
        label: "Selecionar visiveis",
        description: `Seleciona as ${viewRows.length} linhas visiveis.`,
        testId: "selection-option-select-visible",
        disabled: viewRows.length === 0
      },
      {
        key: "invert-selection",
        label: "Inverter selecao",
        description: "Inverte a selecao apenas das linhas visiveis.",
        testId: "selection-option-invert",
        disabled: viewRows.length === 0
      },
      {
        key: "clear-selection",
        label: "Limpar selecao",
        description: `Remove a selecao atual de ${selectedRows.size} linha(s).`,
        testId: "selection-option-clear",
        disabled: selectedRows.size === 0
      },
      ...(isConferenceMode
        ? [
            {
              key: "conference-mark",
              label: selectedRows.size > 0 ? "Marcar selecoes" : "Marcar visiveis",
              description: "Marca as linhas alvo como conferidas.",
              testId: "selection-option-conference-mark",
              disabled: viewRows.length === 0
            },
            {
              key: "conference-unmark",
              label: selectedRows.size > 0 ? "Desmarcar selecoes" : "Desmarcar visiveis",
              description: "Remove a marcacao de conferencia das linhas alvo.",
              testId: "selection-option-conference-unmark",
              disabled: viewRows.length === 0
            }
          ]
        : [])
    ],
    [isConferenceMode, selectedRows.size, viewRows.length]
  );
  const activeFiltersDialogOptions = useMemo<HolisticChooserOption[]>(
    () => [
      ...(activeFilterCount > 1
        ? [
            {
              key: "__all__",
              label: "Limpar todos",
              description: `Remove os ${activeFilterCount} filtros ativos deste grid.`,
              testId: "active-filter-option-all"
            }
          ]
        : []),
      ...Object.entries(filters)
        .filter(([, expression]) => expression.trim().length > 0)
        .map(([column, expression]) => ({
          key: column,
          label: column,
          description: describeFilterExpression(expression),
          testId: `active-filter-option-${column}`
        }))
    ],
    [activeFilterCount, filters]
  );
  const sidebarInsightSummary = useMemo(() => {
    let pendingActionCount = 0;
    let missingDataCount = 0;

    for (const summary of Object.values(tableInsightsBySheet)) {
      if (!summary) continue;
      pendingActionCount += summary.pendingActionCount ?? 0;
      missingDataCount += summary.missingDataCount ?? 0;
    }

    const totalInsightCount = pendingActionCount + missingDataCount;

    return {
      pendingActionCount,
      missingDataCount,
      totalInsightCount,
      hasPendingAction: totalInsightCount > 0
    };
  }, [tableInsightsBySheet]);
  const totalPages = Math.max(1, Math.ceil(locallyFilteredRows.length / pageSize));
  const workspaceStyle = hasSplitPanels
    ? { gridTemplateColumns: `minmax(0, ${splitRatio}%) 10px minmax(0, ${Math.max(10, 100 - splitRatio)}%)` }
    : undefined;

  return (
    <main className="sheet-shell" data-testid="holistic-sheet">
      <WorkspaceHeader actor={actor} title="Home" />
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
                  {sheets.map((sheet) => {
                    const insightSummary = tableInsightsBySheet[sheet.key];
                    const hasPendingAction = Boolean(insightSummary?.hasPendingAction);
                    const pendingActionCount = insightSummary?.pendingActionCount ?? 0;
                    const missingDataCount = insightSummary?.missingDataCount ?? 0;
                    const totalInsightCount = pendingActionCount + missingDataCount;

                    return (
                      <button
                        key={sheet.key}
                        type="button"
                        className={`sheet-side-tab ${sheet.key === activeSheet.key ? "is-active" : ""}`}
                        onClick={() => handleSheetSelection(sheet.key)}
                        data-testid={`sheet-tab-${sheet.key}`}
                      >
                        <span className="sheet-side-tab-head">
                          <span>{sheet.label}</span>
                          <span className="sheet-side-tab-status">
                            {hasPendingAction ? (
                              <span
                                className="sheet-side-tab-dot"
                                title={`${totalInsightCount} aviso(s) nesta tabela (${pendingActionCount} pendencia(s) e ${missingDataCount} falta(s))`}
                                aria-label={`${totalInsightCount} aviso(s) nesta tabela`}
                              />
                            ) : null}
                            <span
                              className={`sheet-side-tag ${
                                sheet.readOnly || !hasRequiredRole(role, sheet.minWriteRole) ? "is-readonly" : "is-writable"
                              }`}
                            >
                              {sheet.readOnly || !hasRequiredRole(role, sheet.minWriteRole) ? "RO" : "RW"}
                            </span>
                          </span>
                        </span>
                        {sheet.description ? <small>{sheet.description}</small> : null}
                      </button>
                    );
                  })}
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
                  aria-label={
                    sidebarInsightSummary.hasPendingAction
                      ? `Tabelas, ${sidebarInsightSummary.totalInsightCount} aviso(s) nas tabelas`
                      : "Tabelas"
                  }
                  title={
                    sidebarInsightSummary.hasPendingAction
                      ? `${sidebarInsightSummary.totalInsightCount} aviso(s) nas tabelas (${sidebarInsightSummary.pendingActionCount} pendencia(s) e ${sidebarInsightSummary.missingDataCount} falta(s))`
                      : undefined
                  }
                  data-testid="sidebar-toggle"
                >
                  <span className="sheet-sidebar-toggle-icon" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="sheet-sidebar-toggle-label">
                    <span>Tabelas</span>
                    {sidebarInsightSummary.hasPendingAction ? (
                      <span className="sheet-side-tab-dot" aria-hidden="true" />
                    ) : null}
                  </span>
                </button>

                <div className="sheet-title-wrap">
                  <h1>{activeSheet.label}</h1>
                  <p>Tabela ativa</p>
                </div>
              </div>

              {!isAuditDashboardSheet ? (
                <div className="sheet-pager sheet-pager-top" data-testid="sheet-pager">
                  <IconButton
                    icon="left"
                    label="Pagina anterior"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                    testId="pager-prev"
                  />
                  <span className="sheet-pager-status">
                    {page}/{totalPages}
                  </span>
                  <IconButton
                    icon="right"
                    label="Proxima pagina"
                    onClick={() => setPage((prev) => prev + 1)}
                    disabled={page >= totalPages}
                    testId="pager-next"
                  />
                  <label className="sheet-inline-field sheet-pager-field">
                    <span className="sr-only">Linhas por pagina</span>
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
              ) : null}
            </div>

            <div className="sheet-actions-row">
              <div className="sheet-topbar-meta">
                <div className="sheet-session-chip" title={actor.userEmail ?? actor.userName}>
                  <strong>{actor.userName}</strong>
                  <span>{role}</span>
                  {actor.userEmail ? <small>{actor.userEmail}</small> : null}
                </div>
                <div className="sheet-session-actions">
                  <Link href="/arquivos" className={`${styles.btn} sheet-nav-btn`}>
                    Arquivos
                  </Link>
                  <button
                    type="button"
                    className={`${styles.btn} sheet-nav-btn`}
                    onClick={() => void handleQuickPrintCarros()}
                    data-testid="global-print-carros"
                    disabled={quickPrintSubmitting}
                  >
                    {quickPrintSubmitting ? "Imprimindo..." : "Imprimir"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} sheet-signout-btn`}
                    onClick={() => void onSignOut()}
                  >
                    Sair
                  </button>
                </div>
              </div>


              {!isAuditDashboardSheet ? (
                <div className="sheet-toolbar-stack">
                  <ToolbarSection
                    id="grid-workspace"
                    title="Sessao de trabalho"
                    description="Concentre operacao, relatorios e manutencao em um unico painel."
                  >
                    <div className="sheet-toolbar-group-stack">
                      <div className="sheet-toolbar-group" data-testid="toolbar-grid-quick-actions">
                        <div className="sheet-toolbar-group-copy">
                          <strong>Acoes rapidas</strong>
                          <span>Organize selecoes e edite registros prioritarios.</span>
                        </div>
                        <div className="sheet-toolbar-controls sheet-toolbar-controls-secondary">
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
                            disabled={!canUseActiveSheetWriteActions}
                            testId="action-insert-row"
                          />
                          <IconButton
                            icon="bulk"
                            label="Insert em massa"
                            onClick={openBulkInsertForm}
                            disabled={!canUseActiveSheetWriteActions}
                            testId="action-insert-bulk"
                          />
                          <button
                            type="button"
                            className={`${styles.btn} sheet-nav-btn`}
                            onClick={openMassUpdateDialog}
                            data-testid="action-mass-update"
                            disabled={!canUseActiveSheetWriteActions || selectedRows.size === 0 || formEditableColumns.length === 0}
                          >
                            Alteracao em massa
                          </button>
                        </div>
                      </div>

                      <div className="sheet-toolbar-group" data-testid="toolbar-grid-reports">
                        <div className="sheet-toolbar-group-copy">
                          <strong>Relatorios e auditoria</strong>
                          <span>Gere tabelas ou acompanhe o painel de auditoria.</span>
                        </div>
                        <div className="sheet-toolbar-controls sheet-toolbar-controls-secondary">
                          <button
                            type="button"
                            className={`${styles.btn} sheet-nav-btn`}
                            onClick={openPrintDialog}
                            data-testid="action-print-table"
                            disabled={payload.rows.length === 0}
                          >
                            Gerar tabela
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} sheet-nav-btn`}
                            onClick={() => router.push(`/auditoria?tabela=${encodeURIComponent(activeSheet.key)}`)}
                            data-testid="action-open-audit-dashboard"
                          >
                            Ver auditoria
                          </button>
                        </div>
                      </div>

                      <div className="sheet-toolbar-group" data-testid="toolbar-grid-maintenance">
                        <div className="sheet-toolbar-group-copy">
                          <strong>Manutencao</strong>
                          <span>Limpe duplicidades, finalize e valide insights.</span>
                        </div>
                        <div className="sheet-toolbar-controls sheet-toolbar-controls-secondary">
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
                    </div>
                  </ToolbarSection>
                </div>
              ) : null}
            </div>

            {!isAuditDashboardSheet ? (
              <div className="sheet-status-row">
                <span>Rows visiveis: {viewRows.length}</span>
                <span>Total: {locallyFilteredRows.length}</span>
                <span>Selecionadas (rows): {selectedRows.size}</span>
                <span>Selecionadas (cells): {selectedCells.size}</span>
                <span>Fila persistencia: {queueDepth}</span>
                {loading ? <span>Carregando...</span> : null}
                {error ? <span className="sheet-error">Erro: {error}</span> : null}
              </div>
            ) : null}
          </section>

          <div
            className={`sheet-workspace ${splitResizeState ? "is-resizing" : ""}`}
            ref={workspaceRef}
            style={workspaceStyle}
            data-testid="sheet-workspace"
          >
            <GridTableBodySection>
            {showGridPanel ? (
              isAuditDashboardSheet ? (
                <section className="sheet-panel sheet-grid-panel sheet-audit-panel" data-testid="sheet-grid-panel">
                  <AuditLogDashboard requestAuth={requestAuth} initialFilters={initialAuditFilters} />
                </section>
              ) : (
              <section className="sheet-panel sheet-grid-panel" data-testid="sheet-grid-panel">
                <header className="sheet-panel-head">
                  <div className="sheet-panel-head-main">
                    <div className="sheet-mode-toggle-group" data-testid="grid-mode-selector">
                      <button
                        type="button"
                        className={`sheet-mode-toggle ${isConferenceMode ? "is-active" : ""}`}
                        onClick={() => toggleSelectionMode("conference")}
                        data-testid="mode-toggle-conference"
                      >
                        Conferencia
                      </button>
                      <button
                        type="button"
                        className={`sheet-mode-toggle ${isEditorMode ? "is-active" : ""}`}
                        onClick={() => toggleSelectionMode("editor")}
                        data-testid="mode-toggle-editor"
                      >
                        Editor
                      </button>
                    </div>
                    <strong className="sheet-panel-head-title">{activeSheet.label}</strong>
                    {activeSheet.key === "anuncios" && activeAnuncioInsight ? (
                      <span className="sheet-inline-note" title={activeAnuncioInsight}>
                        {activeAnuncioInsight}
                      </span>
                    ) : null}
                  </div>
                  <div className="sheet-panel-head-actions">
                    <div className="sheet-panel-head-action-group">
                      <button
                        type="button"
                        className="sheet-panel-head-btn"
                        onClick={() => setSelectionDialogOpen(true)}
                        data-testid="action-selection-dialog"
                      >
                        Selecao
                      </button>
                      {activeFilterCount > 0 ? (
                        <button
                          type="button"
                          className="sheet-panel-head-btn"
                          onClick={() => setActiveFiltersDialogOpen(true)}
                          data-testid="action-clear-filters"
                        >
                          Limpar filtros ({activeFilterCount})
                        </button>
                      ) : null}
                      {activeSheetLayout.hiddenColumns.length > 0 ? (
                        <button
                          type="button"
                          className="sheet-panel-head-btn"
                          onClick={() => setHiddenColumnsDialogOpen(true)}
                          data-testid="action-hidden-columns"
                        >
                          Colunas ocultas ({activeSheetLayout.hiddenColumns.length})
                        </button>
                      ) : null}
                      {activeSheet.key === "anuncios" ? (
                        <button
                          type="button"
                          className="sheet-panel-head-btn"
                          onClick={() => void handleOpenAnuncioInsightsFromHeader()}
                          disabled={!anuncioInsightHeaderTargetRowId}
                          data-testid="grid-anuncio-insights-trigger"
                          title={activeAnuncioInsight ?? "Abrir insights do anuncio selecionado"}
                        >
                          Insights
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="sheet-panel-head-btn"
                      onClick={() => setSecondaryGridChooserOpen(true)}
                      data-testid="action-open-secondary-grid"
                    >
                      Abrir tabela lateral
                    </button>
                    <button
                      type="button"
                      className="sheet-panel-close"
                      data-testid="panel-close-grid"
                      onClick={closeGridPanel}
                      disabled={!canCloseGridPanel}
                      title={canCloseGridPanel ? "Fechar planilha principal" : "Mantenha ao menos um modulo aberto"}
                      aria-label="Fechar planilha principal"
                    >
                      —
                    </button>
                  </div>
                </header>
                <div className="sheet-grid-body">
                  <div className="sheet-grid-search-panel" data-testid="toolbar-grid-search">
                    <div className="sheet-grid-search-copy">
                      <strong>Busca rapida</strong>
                      <span>Pesquise em todas as colunas ou use operadores como &gt;=, &lt;= e VAZIO.</span>
                    </div>
                    <div className="sheet-toolbar-controls sheet-toolbar-controls-primary sheet-toolbar-search-controls">
                      <label className="sheet-inline-field sheet-toolbar-field">
                        Busca
                        <input
                          type="search"
                          value={queryInput}
                          onChange={(e) => setQueryInput(e.target.value)}
                          placeholder="Buscar..."
                        />
                      </label>
                      <div className="sheet-toolbar-search-meta">
                        <label className="sheet-inline-field sheet-toolbar-field">
                          Match
                          <select value={matchMode} onChange={(e) => setMatchMode(e.target.value as typeof matchMode)}>
                            <option value="contains">contains</option>
                            <option value="exact">exact</option>
                            <option value="starts">starts</option>
                            <option value="ends">ends</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className={`${styles.btn} sheet-nav-btn sheet-clear-search`}
                          onClick={() => setQueryInput("")}
                          data-testid="action-clear-search"
                          disabled={!queryInput}
                        >
                          Limpar
                        </button>
                        <IconButton icon="refresh" label="Recarregar grid" onClick={() => void loadGrid()} testId="action-reload" />
                      </div>
                    </div>
                  </div>
                  <section
                    className={`sheet-grid-container ${resizeState ? "is-resizing" : ""}`}
                    ref={gridRef}
                    tabIndex={0}
                    data-testid="sheet-grid-container"
                    onScroll={handleGridScroll}
                    onContextMenu={(event) => event.preventDefault()}
                    onMouseDown={() => focusWithoutScroll(gridRef.current)}
                    onPointerDown={() => focusWithoutScroll(gridRef.current)}
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

                    const targetCell = getCellSelectionAnchor();
                    if (event.key === "Enter" && targetCell) {
                      event.preventDefault();
                      const row = viewRows[targetCell.rIdx];
                      const column = columns[targetCell.cIdx];
                      const rowId = String(row?.[activeSheet.primaryKey] ?? "");
                      if (!row || !column || !canWriteActiveSheet || activeSheet.lockedColumns.includes(column)) return;
                      if (isMissingAnuncioReferenceRow(row)) {
                        void openInsertForm(buildMissingAnuncioInsertPrefill(row));
                        return;
                      }
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
                      {isConferenceMode ? <col style={{ width: 92 }} /> : null}
                      {columns.map((column) => (
                        <col key={column} style={{ width: resolvedColumnWidths[column] ?? 180 }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="sheet-sticky-select-col">
                          <div className="sheet-select-cycle-cell">
                            <button
                              type="button"
                              className={`sheet-select-cycle-btn ${selectCycleMode === "inverted" ? "is-inverted" : ""}`}
                              title="Ciclo de selecao"
                              aria-label="Ciclo de selecao"
                              onClick={handleSelectAllCycle}
                              data-testid="action-select-cycle"
                            >
                              <ActionIcon name="select-cycle" />
                            </button>
                          </div>
                        </th>
                        {isConferenceMode ? <th className="sheet-conference-col">Conferida</th> : null}
                        {columns.map((column) => {
                          const sortIndex = sortChain.findIndex((item) => item.column === column);
                          const sortDir = sortIndex >= 0 ? sortChain[sortIndex].dir : null;
                          const currentFilterExpression = filters[column] ?? "";
                          const filterActive = currentFilterExpression.trim().length > 0;
                          const displayOverride = displayColumnOverrides[column];
                          const isPinnedColumn = pinnedColumn === column;

                          return (
                            <th
                              key={column}
                              className={`${activeSheet.lockedColumns.includes(column) ? "is-locked" : ""} ${
                                isPinnedColumn ? "sheet-pinned-data-col" : ""
                              }`.trim()}
                              style={isPinnedColumn ? { left: isConferenceMode ? 140 : 48 } : undefined}
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
                                      {sortIndex + 1}:{sortDir === "asc" ? "↑" : "↓"}
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
                                      openFilterPopover(column);
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
                        const isConferenceRow = conferenceMarkedRows.has(rowId);
                        const isMissingDataRow = isMissingAnuncioReferenceRow(row);
                        const domainClass = activeSheet.rowClassName?.(row) ?? "";
                        const expandedGroupRows = activeSheet.key === "grupos_repetidos" ? repetidosByGroup[rowId] ?? [] : [];
                        const isRepeatedGroupExpanded = activeSheet.key === "grupos_repetidos" && expandedGroupIds.has(rowId);
                        const isRepeatedGroupLoading = activeSheet.key === "grupos_repetidos" && loadingRepeatedGroupIds.has(rowId);

                        return (
                          <Fragment key={rowId}>
                            <tr
                              key={rowId}
                              className={`${isSelectedRow || isConferenceRow ? "is-selected-row" : ""} ${
                                isConferenceRow ? "is-conference-row" : ""
                              } ${domainClass}`.trim()}
                            >
                              <td className={`sheet-sticky-select-col ${activeSheet.key === "grupos_repetidos" ? "has-expand-toggle" : ""}`.trim()}>
                                {activeSheet.key === "grupos_repetidos" ? (
                                  <div className="sheet-select-expand-stack">
                                    <input
                                      type="checkbox"
                                      checked={isSelectedRow}
                                      disabled={isMissingDataRow}
                                      onClick={(event) => handleRowToggle(rowIndex, rowId, event)}
                                      onChange={() => undefined}
                                      data-testid={`row-check-${rowId}`}
                                    />
                                    <button
                                      className={`sheet-expand-btn ${expandedGroupIds.has(rowId) ? "v" : ">"}`}
                                      type="button"
                                      onClick={() => void toggleGroup(rowId)}
                                      title={expandedGroupIds.has(rowId) ? "v" : ">"}
                                      aria-label={expandedGroupIds.has(rowId) ? "v" : ">"}
                                      data-testid={`expand-group-${rowId}`}
                                    >
                                      {expandedGroupIds.has(rowId) ? "v" : ">"}
                                    </button>
                                  </div>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isSelectedRow}
                                    disabled={isMissingDataRow}
                                    onClick={(event) => handleRowToggle(rowIndex, rowId, event)}
                                    onChange={() => undefined}
                                    data-testid={`row-check-${rowId}`}
                                  />
                                )}
                              </td>
                              {isConferenceMode ? (
                                <td
                                  className="sheet-conference-col"
                                  data-testid={`conference-cell-${rowId}`}
                                  onClick={() => {
                                    if (isEditorMode) {
                                      void openUpdateForm(row);
                                      return;
                                    }

                                    toggleConferenceRow(rowId);
                                  }}
                                >
                                  <span className={`sheet-conference-pill ${isConferenceRow ? "is-checked" : ""}`}>
                                    {isConferenceRow ? "Conferida" : "Pendente"}
                                  </span>
                                </td>
                              ) : null}
                              {columns.map((column, colIndex) => {
                                const isEditing =
                                  editingCell?.rowId === rowId && editingCell?.column === column && editingCell?.rowIndex === rowIndex;
                                const isSelectedCell = selectedCells.has(cellKey(rowIndex, colIndex));
                                const cellValue = row[column];
                                const visibleValue = resolveDisplayValue(row, column);
                                const isPinnedColumn = pinnedColumn === column;

                                return (
                                  <td
                                    id={`grid-cell-${activeSheet.key}-${rowIndex}-${colIndex}`}
                                    key={`${rowId}-${column}`}
                                    data-testid={`cell-${activeSheet.key}-${rowIndex}-${column}`}
                                    className={`${isSelectedCell ? "is-selected-cell" : ""} ${
                                      activeSheet.lockedColumns.includes(column) ? "is-locked" : ""
                                    } ${isPinnedColumn ? "sheet-pinned-data-col" : ""}`.trim()}
                                    style={isPinnedColumn ? { left: isConferenceMode ? 140 : 48 } : undefined}
                                    title={toEditable(visibleValue)}
                                    onClick={(event) => handleCellClick(rowIndex, colIndex, event)}
                                    onDoubleClick={() => {
                                      if (!canWriteActiveSheet || activeSheet.lockedColumns.includes(column)) return;
                                      if (isMissingDataRow) {
                                        void openInsertForm(buildMissingAnuncioInsertPrefill(row));
                                        return;
                                      }
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
                            {isRepeatedGroupExpanded ? (
                              isRepeatedGroupLoading ? (
                                <tr className="sheet-grid-child-state-row">
                                  <td colSpan={columns.length + 1 + (isConferenceMode ? 1 : 0)}>Carregando veiculos do grupo...</td>
                                </tr>
                              ) : expandedGroupRows.length === 0 ? (
                                <tr className="sheet-grid-child-state-row">
                                  <td colSpan={columns.length + 1 + (isConferenceMode ? 1 : 0)}>Sem itens no grupo.</td>
                                </tr>
                              ) : (
                                expandedGroupRows.map((child, childIndex) => {
                                  const isReferenceChild = child.__is_reference_choice === true;
                                  const isBucketStart =
                                    childIndex === 0 ||
                                    expandedGroupRows[childIndex - 1]?.__price_bucket_key !== child.__price_bucket_key;

                                  return (
                                    <tr
                                      key={`${rowId}-${String(child.carro_id ?? child.id ?? childIndex)}`}
                                      className={`sheet-grid-child-row ${isReferenceChild ? "is-reference" : ""} ${
                                        isBucketStart ? "is-bucket-start" : ""
                                      }`.trim()}
                                      data-testid={`group-child-row-${rowId}-${String(child.carro_id ?? child.id ?? childIndex)}`}
                                    >
                                      <td className="sheet-sticky-select-col">
                                        <div className="sheet-child-marker" aria-hidden="true">
                                          <span className="sheet-child-branch">{isBucketStart ? "--" : "|-"}</span>
                                          <span className={`sheet-child-marker-dot ${isReferenceChild ? "is-reference" : ""}`} />
                                        </div>
                                      </td>
                                      {isConferenceMode ? <td className="sheet-grid-child-meta-cell">Filho</td> : null}
                                      {columns.map((column) => {
                                        const isPinnedColumn = pinnedColumn === column;
                                        const cellContent = renderRepeatedGroupChildCell(
                                          row,
                                          child,
                                          column,
                                          childIndex,
                                          expandedGroupRows.length,
                                          isBucketStart
                                        );

                                        return (
                                          <td
                                            key={`${rowId}-${String(child.carro_id ?? child.id ?? childIndex)}-${column}`}
                                            className={`sheet-grid-child-cell ${isPinnedColumn ? "sheet-pinned-data-col" : ""}`.trim()}
                                            style={isPinnedColumn ? { left: isConferenceMode ? 140 : 48 } : undefined}
                                          >
                                            {cellContent || <span className="sheet-child-empty"> </span>}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })
                              )
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  </section>
                </div>
              </section>
              )
            ) : null}
            </GridTableBodySection>
            {hasSplitPanels ? (
              <div
                className="sheet-splitter"
                role="separator"
                aria-orientation="vertical"
                onPointerDown={startSplitResize}
                onMouseDown={startSplitResizeMouse}
                data-testid="sheet-splitter"
              />
            ) : null}
            <GridSidePanelsSection>
            {rightPanelOpen ? (
              <section className="sheet-panel sheet-form-panel" data-testid="sheet-form-panel">
                {(secondaryGrid || showFormPanel) ? (
                  <div className="sheet-mode-toggle-group sheet-right-tabs" data-testid="sheet-right-tabs">
                    {secondaryGrid ? (
                      <button
                        type="button"
                        className={`sheet-mode-toggle ${activeRightTab === "grid" ? "is-active" : ""}`}
                        onClick={() => setActiveRightTab("grid")}
                        data-testid="right-tab-grid"
                      >
                        {`Tabela: ${secondaryGrid.sheet.label}`}
                      </button>
                    ) : null}
                    {showFormPanel ? (
                      <button
                        type="button"
                        className={`sheet-mode-toggle ${activeRightTab === "form" ? "is-active" : ""}`}
                        onClick={() => setActiveRightTab("form")}
                        data-testid="right-tab-form"
                      >
                        {`Formulario: ${activeSheet.label}`}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {activeRightTab === "grid" && secondaryGrid ? (
                  <div className="sheet-secondary-grid" data-testid="secondary-grid-panel">
                    <header className="sheet-panel-head">
                      <div className="sheet-panel-head-main">
                        <strong className="sheet-panel-head-title">{secondaryGrid.sheet.label}</strong>
                        <span className="sheet-inline-note">Tabela secundaria</span>
                      </div>
                      <div className="sheet-panel-head-actions">
                        <button
                          type="button"
                          className="sheet-panel-head-btn"
                          onClick={refreshSecondaryGrid}
                          disabled={secondaryGrid.loading}
                          data-testid="secondary-grid-refresh"
                        >
                          {secondaryGrid.loading ? "Atualizando..." : "Recarregar"}
                        </button>
                        <button
                          type="button"
                          className="sheet-panel-close"
                          onClick={closeSecondaryGrid}
                          aria-label="Fechar tabela secundaria"
                          data-testid="secondary-grid-close"
                        >
                          x
                        </button>
                      </div>
                    </header>
                    <div className="sheet-grid-container" style={{ maxHeight: 400, overflowY: "auto" }}>
                      {secondaryGrid.error ? <p className="sheet-error">{secondaryGrid.error}</p> : null}
                      {secondaryGrid.loading && !secondaryGrid.payload ? <p>Carregando tabela...</p> : null}
                      {secondaryGrid.payload ? (
                        <table className="sheet-grid" data-testid="secondary-grid-table">
                          <thead>
                            <tr>
                              {secondaryGrid.payload!.header.map((column) => (
                                <th key={`secondary-col-${column}`}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {secondaryGrid.payload!.rows.length === 0 ? (
                              <tr>
                                <td colSpan={Math.max(1, secondaryGrid.payload!.header.length)}>Sem registros.</td>
                              </tr>
                            ) : (
                              secondaryGrid.payload!.rows.map((row, index) => (
                                <tr key={`secondary-row-${index}`}>
                                  {secondaryGrid.payload!.header.map((column) => (
                                    <td key={`secondary-cell-${index}-${column}`}>{String(row[column] ?? "")}</td>
                                  ))}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {showFormPanel && activeRightTab === "form" ? (
                  formMode !== "bulk" ? (
                  <form className="sheet-form-panel-shell" onSubmit={submitInsertForm}>
                    <header className="sheet-form-topbar" data-testid="form-topbar">
                      <strong className="sheet-form-topbar-title">
                        {formMode === "update" ? `Editar ${activeSheet.label}: ${carHandlerHeader}` : `Novo ${activeSheet.label}: ${carHandlerHeader}`}
                      </strong>
                      <div className="sheet-form-topbar-actions">
                        <div className="sheet-form-topbar-button-group">
                          {formMode === "update" && isConferenceMode && editingRowId ? (
                            <button
                              type="button"
                              className="sheet-form-secondary"
                              onClick={() => toggleConferenceRow(editingRowId)}
                              data-testid="form-conference-toggle"
                            >
                              {conferenceMarkedRows.has(editingRowId) ? "Desmarcar" : "Marcar"}
                            </button>
                          ) : null}
                          {formMode === "update" && activeSheet.key === "carros" ? (
                            <button
                              type="button"
                              className="sheet-form-secondary"
                              onClick={() => void handleFinalizeEditingRow()}
                              data-testid="form-finalize"
                              disabled={!canFinalizeSelected || isFormSaveDisabled}
                            >
                              Vender
                            </button>
                          ) : null}
                          {formMode === "update" ? (
                            <button
                              type="button"
                              className="sheet-form-secondary is-danger"
                              onClick={() => void handleDeleteEditingRow()}
                              data-testid="form-delete"
                              disabled={!canDeleteActiveSheet}
                            >
                              Excluir
                            </button>
                          ) : null}
                          <button
                            type="submit"
                            className="sheet-form-submit"
                            data-testid="form-submit"
                            disabled={isFormSaveDisabled}
                          >
                            {formSubmitting ? "Salvando..." : formMode === "update" ? "Salvar alteracoes" : "Salvar"}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="sheet-panel-close"
                          data-testid="panel-close-form"
                          onClick={closeFormPanel}
                          disabled={!canCloseFormPanel}
                          title={canCloseFormPanel ? "Fechar formulario" : "Mantenha ao menos um modulo aberto"}
                          aria-label="Fechar formulario"
                        >
                          —
                        </button>
                      </div>
                    </header>
                    <div className="sheet-form-panel-body">
                      {formBooting ? <p>Carregando relacoes...</p> : null}
                      {formEditableColumns.length === 0 ? (
                        <p>Sem campos editaveis para esta tabela.</p>
                      ) : isCarSingleForm ? (
                        <>
                          {carPriorityColumnsBeforeChassi.length > 0 ||
                          carBooleanColumns.length > 0 ||
                          carPriorityColumns.includes("modelo_id") ? (
                            <div className="sheet-form-priority-grid">
                              {carPriorityColumnsBeforeChassi.map((column) =>
                                renderEditableFormField(column, {
                                  fullWidth: column === "placa" || column === "chassi"
                                })
                              )}
                              {carBooleanColumns.length > 0 ? (
                                <div className="sheet-form-boolean-grid">
                                  {carBooleanColumns.map((column) => renderEditableFormField(column))}
                                </div>
                              ) : null}
                              {carPriorityColumns.includes("modelo_id")
                                ? renderEditableFormField("modelo_id", {
                                    fullWidth: true
                                  })
                                : null}
                            </div>
                          ) : null}
                          <div className="sheet-form-sections">
                            <section className="sheet-form-section">
                              <button
                                type="button"
                                className="sheet-form-section-toggle"
                                onClick={() => toggleCarFormSection("technical")}
                                aria-expanded={carFormSectionsOpen.technical}
                                data-testid="car-form-section-technical"
                              >
                                <span>Dados Tecnicos</span>
                                <strong aria-hidden="true">{carFormSectionsOpen.technical ? "-" : "+"}</strong>
                              </button>
                              {carFormSectionsOpen.technical ? (
                                <div className="sheet-form-section-body sheet-form-fields-grid">
                                  {carSectionColumns.map((column) => renderEditableFormField(column))}
                                </div>
                              ) : null}
                            </section>

                            <section className="sheet-form-section">
                              <button
                                type="button"
                                className="sheet-form-section-toggle"
                                onClick={() => toggleCarFormSection("characteristics")}
                                aria-expanded={carFormSectionsOpen.characteristics}
                                data-testid="car-form-section-characteristics"
                              >
                                <span>Caracteristicas</span>
                                <strong aria-hidden="true">{carFormSectionsOpen.characteristics ? "-" : "+"}</strong>
                              </button>
                              {carFormSectionsOpen.characteristics ? (
                                <div className="sheet-form-section-body">
                                  <label className="sheet-form-field is-form-span-full">
                                    <span>Pesquisar</span>
                                    <input
                                      type="text"
                                      value={carFeatureSearch}
                                      onChange={(event) => setCarFeatureSearch(event.target.value)}
                                      placeholder="Buscar caracteristica"
                                      data-testid="car-feature-search"
                                      disabled={formBooting || carFeatureLoading}
                                    />
                                  </label>
                                  {carFeatureLoading ? <p>Carregando caracteristicas do veiculo...</p> : null}
                                  {carFeatureError ? <p className="sheet-error">{carFeatureError}</p> : null}
                                  {renderCarFeatureGroup({
                                    title: "Visuais",
                                    emptyLabel: "Nenhuma caracteristica visual encontrada para o filtro atual.",
                                    options: filteredVisualFeatureOptions,
                                    selectedIds: selectedVisualFeatureIds,
                                    kind: "visual",
                                    testIdPrefix: "car-feature-visual"
                                  })}
                                  {renderCarFeatureGroup({
                                    title: "Tecnicas",
                                    emptyLabel: "Nenhuma caracteristica tecnica encontrada para o filtro atual.",
                                    options: filteredTechnicalFeatureOptions,
                                    selectedIds: selectedTechnicalFeatureIds,
                                    kind: "technical",
                                    testIdPrefix: "car-feature-technical"
                                  })}
                                </div>
                              ) : null}
                            </section>
                          </div>
                        </>
                      ) : (
                        formEditableColumns.map((column) => renderEditableFormField(column))
                      )}
                      <div className="sheet-form-feedback-slot" data-testid="form-feedback-slot">
                        {formInfo ? (
                          <p className="sheet-form-success" data-testid="form-info">
                            {formInfo}
                          </p>
                        ) : null}
                        {formError ? <p className="sheet-error">{formError}</p> : null}
                      </div>
                    </div>
                  </form>
                ) : (
                  <form className="sheet-form-panel-shell" onSubmit={submitBulkInsertForm}>
                    <header className="sheet-form-topbar" data-testid="bulk-topbar">
                      <strong className="sheet-form-topbar-title">Insert em massa: {activeSheet.label}</strong>
                      <div className="sheet-form-topbar-actions">
                        <div className="sheet-form-topbar-button-group">
                          <button
                            type="submit"
                            className="sheet-form-submit"
                            data-testid="bulk-submit"
                            disabled={bulkSubmitting}
                          >
                            {bulkSubmitting ? "Inserindo..." : "Inserir em massa"}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="sheet-panel-close"
                          data-testid="panel-close-form"
                          onClick={closeFormPanel}
                          disabled={!canCloseFormPanel}
                          title={canCloseFormPanel ? "Fechar formulario" : "Mantenha ao menos um modulo aberto"}
                          aria-label="Fechar formulario"
                        >
                          —
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
                      <div className="sheet-form-feedback-slot" data-testid="bulk-feedback-slot">
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
                    </div>
                  </form>
                )
                ) : null}
              </section>
            ) : null}
            </GridSidePanelsSection>
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
                left: filterPopoverPosition.left,
                maxHeight: filterPopoverPosition.maxHeight
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
                    data-testid={`filter-pin-${activeFilterColumn}`}
                    onClick={() => togglePinnedColumn(activeFilterColumn)}
                  >
                    {pinnedColumn === activeFilterColumn ? "Soltar coluna" : "Fixar coluna"}
                  </button>
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    data-testid={`filter-hide-column-${activeFilterColumn}`}
                    onClick={() => hideColumn(activeFilterColumn)}
                    disabled={columns.length <= 1}
                  >
                    Ocultar coluna
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
              <div className="sheet-filter-bulk-actions">
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`filter-select-all-${activeFilterColumn}`}
                  onClick={() =>
                    setFilterDraftValues((prev) => {
                      const next = new Set(prev);
                      for (const option of activeFilterOptions) {
                        next.add(option.literal);
                      }
                      return Array.from(next);
                    })
                  }
                >
                  Selecionar tudo
                </button>
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`filter-clear-selection-${activeFilterColumn}`}
                  onClick={() =>
                    setFilterDraftValues((prev) => {
                      if (activeFilterOptions.length === 0) return prev;
                      const blocked = new Set(activeFilterOptions.map((option) => option.literal));
                      return prev.filter((value) => !blocked.has(value));
                    })
                  }
                >
                  Desmarcar tudo
                </button>
              </div>
              {activeFilterIsDateColumn ? (
                <div className="sheet-filter-date-range" data-testid={`filter-date-range-${activeFilterColumn}`}>
                  <label className="sheet-filter-date-field">
                    <span>De</span>
                    <input
                      type="date"
                      value={filterDateFrom}
                      data-testid={`filter-date-from-${activeFilterColumn}`}
                      onChange={(event) => setFilterDateFrom(event.target.value)}
                    />
                  </label>
                  <label className="sheet-filter-date-field">
                    <span>Até</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      data-testid={`filter-date-to-${activeFilterColumn}`}
                      onChange={(event) => setFilterDateTo(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    data-testid={`filter-date-apply-${activeFilterColumn}`}
                    onClick={() => {
                      const rangeValues = selectDateFilterRange(activeFilterAllOptions, filterDateFrom, filterDateTo);
                      setFilterDraftValues(rangeValues);
                    }}
                    disabled={!filterDateFrom && !filterDateTo}
                  >
                    Filtrar datas
                  </button>
                </div>
              ) : null}
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
                          onChange={() => toggleFilterDraftValue(option.literal)}
                        />
                        <span title={option.label}>
                          {option.label} <em>({option.count})</em>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="sheet-filter-footer">
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`filter-clear-${activeFilterColumn}`}
                  onClick={clearActiveFilter}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="sheet-filter-apply-btn"
                  data-testid={`filter-apply-${activeFilterColumn}`}
                  onClick={applyActiveFilter}
                >
                  Aplicar
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
      {isPrintTableScope && activePrintFilterColumn && printFilterPopoverPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="sheet-filter-popover"
              ref={printFilterPopoverRef}
              data-testid={`print-filter-popover-${activePrintFilterColumn}`}
              style={{
                position: "fixed",
                top: printFilterPopoverPosition.top,
                left: printFilterPopoverPosition.left,
                maxHeight: printFilterPopoverPosition.maxHeight
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-filter-popover-head">
                <strong>{activePrintFilterColumn}</strong>
                <div className="sheet-filter-popover-actions">
                  {activePrintFilterRelation ? (
                    <button
                      type="button"
                      className="sheet-filter-clear-btn"
                      data-testid={`print-relation-expand-${activePrintFilterColumn}`}
                      onClick={() => openRelationDialogForColumn(activePrintFilterColumn, "print")}
                    >
                      Expandir PK
                    </button>
                  ) : null}
                </div>
              </div>
              <input
                className="sheet-filter-search"
                placeholder="Buscar valor..."
                value={printFilterPopoverSearch}
                data-testid={`print-filter-search-${activePrintFilterColumn}`}
                onChange={(event) => setPrintFilterPopoverSearch(event.target.value)}
              />
              <div className="sheet-filter-bulk-actions">
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`print-filter-select-all-${activePrintFilterColumn}`}
                  onClick={() =>
                    setPrintFilterDraftValues((prev) => {
                      const next = new Set(prev);
                      for (const option of activePrintFilterOptions) {
                        next.add(option.literal);
                      }
                      return Array.from(next);
                    })
                  }
                >
                  Selecionar tudo
                </button>
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`print-filter-clear-selection-${activePrintFilterColumn}`}
                  onClick={() =>
                    setPrintFilterDraftValues((prev) => {
                      if (activePrintFilterOptions.length === 0) return prev;
                      const blocked = new Set(activePrintFilterOptions.map((option) => option.literal));
                      return prev.filter((value) => !blocked.has(value));
                    })
                  }
                >
                  Desmarcar tudo
                </button>
              </div>
              {activePrintFilterIsDateColumn ? (
                <div className="sheet-filter-date-range" data-testid={`print-filter-date-range-${activePrintFilterColumn}`}>
                  <label className="sheet-filter-date-field">
                    <span>De</span>
                    <input
                      type="date"
                      value={printFilterDateFrom}
                      data-testid={`print-filter-date-from-${activePrintFilterColumn}`}
                      onChange={(event) => setPrintFilterDateFrom(event.target.value)}
                    />
                  </label>
                  <label className="sheet-filter-date-field">
                    <span>Até</span>
                    <input
                      type="date"
                      value={printFilterDateTo}
                      data-testid={`print-filter-date-to-${activePrintFilterColumn}`}
                      onChange={(event) => setPrintFilterDateTo(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    data-testid={`print-filter-date-apply-${activePrintFilterColumn}`}
                    onClick={() => {
                      const rangeValues = selectDateFilterRange(
                        activePrintFilterAllOptions,
                        printFilterDateFrom,
                        printFilterDateTo
                      );
                      setPrintFilterDraftValues(rangeValues);
                    }}
                    disabled={!printFilterDateFrom && !printFilterDateTo}
                  >
                    Filtrar datas
                  </button>
                </div>
              ) : null}
              <div className="sheet-filter-options">
                {activePrintFilterOptions.length === 0 ? (
                  <p>Sem valores nesta configuracao.</p>
                ) : (
                  activePrintFilterOptions.map((option) => {
                    const checked = activePrintFilterValues.includes(option.literal);

                    return (
                      <label key={option.literal} className="sheet-filter-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          data-testid={`print-filter-option-${activePrintFilterColumn}-${toTestIdFragment(option.literal)}`}
                          onChange={() => togglePrintFilterDraftValue(option.literal)}
                        />
                        <span title={option.label}>
                          {option.label} <em>({option.count})</em>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="sheet-filter-footer">
                <button
                  type="button"
                  className="sheet-filter-clear-btn"
                  data-testid={`print-filter-clear-${activePrintFilterColumn}`}
                  onClick={clearPrintFilter}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="sheet-filter-apply-btn"
                  data-testid={`print-filter-apply-${activePrintFilterColumn}`}
                  onClick={applyPrintFilter}
                >
                  Aplicar
                </button>
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
      {featureQuickCreateOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="feature-create-overlay">
              <div className="sheet-focus-dialog is-compact" role="dialog" aria-modal="true" data-testid="feature-create-dialog">
                <form className="sheet-form-panel-shell" onSubmit={handleFeatureQuickCreate}>
                  <header className="sheet-focus-dialog-head">
                    <div>
                      <strong>
                        Nova {featureQuickCreateKind === "visual" ? "caracteristica visual" : "caracteristica tecnica"}
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="sheet-filter-clear-btn"
                      onClick={() => {
                        if (featureQuickCreateSubmitting) return;
                        setFeatureQuickCreateOpen(false);
                        setFeatureQuickCreateError(null);
                        setFeatureQuickCreateValue("");
                      }}
                      data-testid="feature-create-close"
                    >
                      Fechar
                    </button>
                  </header>
                  <div className="sheet-focus-dialog-body">
                    <label className="sheet-form-field">
                      <span>caracteristica</span>
                      <input
                        ref={featureQuickCreateInputRef}
                        type="text"
                        value={featureQuickCreateValue}
                        onChange={(event) => setFeatureQuickCreateValue(event.target.value)}
                        data-testid="feature-create-input"
                      />
                    </label>
                    {featureQuickCreateError ? (
                      <p className="sheet-error" data-testid="feature-create-error">
                        {featureQuickCreateError}
                      </p>
                    ) : null}
                    <div className="sheet-form-topbar-actions">
                      <button
                        type="submit"
                        className="sheet-form-submit"
                        data-testid="feature-create-submit"
                        disabled={featureQuickCreateSubmitting}
                      >
                        {featureQuickCreateSubmitting ? "Salvando..." : "Salvar caracteristica"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
      {massUpdateDialogOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="mass-update-overlay">
              <div className="sheet-focus-dialog" role="dialog" aria-modal="true" data-testid="mass-update-dialog">
                <form className="sheet-dialog-form" onSubmit={submitMassUpdate}>
                  <header className="sheet-focus-dialog-head">
                    <div>
                      <strong>Alteracao em massa</strong>
                      <p>{selectedRows.size} linha(s) selecionada(s) receberao o mesmo valor em uma coluna.</p>
                    </div>
                    <button
                      type="button"
                      className="sheet-filter-clear-btn"
                      onClick={() => {
                        if (massUpdateSubmitting) return;
                        setMassUpdateDialogOpen(false);
                        setMassUpdateError(null);
                      }}
                      data-testid="mass-update-close"
                    >
                      Fechar
                    </button>
                  </header>
                  <div className="sheet-focus-dialog-body">
                    <div className="sheet-dialog-grid">
                      <label className="sheet-form-field">
                        <span>Coluna</span>
                        <select
                          value={massUpdateColumn}
                          onChange={(event) => {
                            setMassUpdateColumn(event.target.value);
                            setMassUpdateValue("");
                            setMassUpdateClearValue(false);
                          }}
                          data-testid="mass-update-column"
                        >
                          {formEditableColumns.map((column) => (
                            <option key={`mass-column-${column}`} value={column}>
                              {column}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sheet-form-field">
                        <span>Linhas alvo</span>
                        <div className="sheet-inline-static" data-testid="mass-update-count">
                          <strong>{selectedRows.size}</strong>
                          <span>linhas selecionadas</span>
                        </div>
                      </label>
                    </div>
                    <label className="sheet-dialog-checkbox">
                      <input
                        type="checkbox"
                        checked={massUpdateClearValue}
                        onChange={(event) => setMassUpdateClearValue(event.target.checked)}
                        data-testid="mass-update-clear"
                      />
                      <span>Limpar o valor atual desta coluna</span>
                    </label>
                    {!massUpdateClearValue && massUpdateColumn ? (
                      <label className="sheet-form-field">
                        <span>Novo valor</span>
                        {renderValueEditor({
                          column: massUpdateColumn,
                          value: massUpdateValue,
                          onChange: setMassUpdateValue,
                          testId: "mass-update-value",
                          disabled: massUpdateSubmitting,
                          allowBlank: true
                        })}
                      </label>
                    ) : null}
                    {massUpdateError ? (
                      <p className="sheet-error" data-testid="mass-update-error">
                        {massUpdateError}
                      </p>
                    ) : null}
                    <div className="sheet-dialog-actions">
                      <button
                        type="submit"
                        className="sheet-form-submit"
                        data-testid="mass-update-submit"
                        disabled={massUpdateSubmitting}
                      >
                        {massUpdateSubmitting ? "Aplicando..." : "Aplicar alteracao"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
      {printDialogOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="print-dialog-overlay">
              <div className="sheet-focus-dialog sheet-print-dialog" role="dialog" aria-modal="true" data-testid="print-dialog">
                <form className="sheet-dialog-form" onSubmit={handleGeneratePrint}>
                  <header className="sheet-focus-dialog-head">
                    <div>
                      <strong>Gerar tabela para impressao</strong>
                      <p>Configure colunas, ordem, titulo e seccionamento antes de imprimir.</p>
                    </div>
                    <button
                      type="button"
                      className="sheet-filter-clear-btn"
                      onClick={() => {
                        if (printSubmitting) return;
                        closePrintFilterPopover();
                        setPrintDialogOpen(false);
                        setPrintError(null);
                      }}
                      data-testid="print-dialog-close"
                    >
                      Fechar
                    </button>
                  </header>
                  <div className="sheet-focus-dialog-body">
                    <div className="sheet-dialog-grid">
                      <label className="sheet-form-field">
                        <span>Titulo</span>
                        <input
                          type="text"
                          value={printTitle}
                          onChange={(event) => setPrintTitle(event.target.value)}
                          data-testid="print-title"
                        />
                      </label>
                      <label className="sheet-form-field">
                        <span>Escopo</span>
                        <select
                          value={printScope}
                          onChange={(event) => setPrintScope(event.target.value as PrintScope)}
                          data-testid="print-scope"
                        >
                          {PRINT_SCOPE_OPTIONS.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={option.value === "selected" && selectedRows.size === 0}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sheet-form-field">
                        <span>Ordenar por</span>
                        <select
                          value={printSortColumn}
                          onChange={(event) => setPrintSortColumn(event.target.value)}
                          data-testid="print-sort-column"
                          disabled={!isPrintTableScope}
                        >
                          <option value="">Sem ordenacao extra</option>
                          {allColumns.map((column) => (
                            <option key={`print-sort-column-${column}`} value={column}>
                              {getPrintColumnLabel(column)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sheet-form-field">
                        <span>Direcao</span>
                        <select
                          value={printSortDirection}
                          onChange={(event) => setPrintSortDirection(event.target.value as PrintSortDirection)}
                          data-testid="print-sort-direction"
                          disabled={!isPrintTableScope || !printSortColumn}
                        >
                          {PRINT_SORT_DIRECTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <section className="sheet-dialog-section">
                      <div className="sheet-dialog-section-head">
                        <div>
                          <strong>Colunas</strong>
                          <span>
                            {isPrintTableScope
                              ? "Selecione, renomeie, filtre e reordene as colunas que irao para a impressao."
                              : "Selecione, renomeie e reordene as colunas. Filtros e expansao dedicada so existem em Tabela."}
                          </span>
                        </div>
                        <div className="sheet-dialog-section-actions">
                          <button
                            type="button"
                            className="sheet-filter-clear-btn"
                            onClick={() => setPrintColumns(printColumnReferenceOrder)}
                            data-testid="print-columns-select-all"
                          >
                            Selecionar tudo
                          </button>
                          <button
                            type="button"
                            className="sheet-filter-clear-btn"
                            onClick={() => setPrintColumns([])}
                            data-testid="print-columns-clear"
                          >
                            Desselecionar
                          </button>
                        </div>
                      </div>
                      <div className="sheet-order-list" data-testid="print-columns-list">
                        {[...printColumns.filter((column) => printColumnReferenceOrder.includes(column)), ...printColumnReferenceOrder.filter((column) => !printColumns.includes(column))].map((column) => {
                          const enabled = printColumns.includes(column);
                          const activePrintFilterCount = isPrintTableScope ? printFilters[column]?.length ?? 0 : 0;
                          const printExpandedColumn = isPrintTableScope ? printDisplayColumnOverrides[column] : undefined;
                          return (
                            <div key={`print-column-${column}`} className="sheet-order-item">
                              <div className="sheet-print-column-main">
                                <label className="sheet-dialog-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(event) =>
                                      setPrintColumns((prev) =>
                                        toggleOrderedValue(prev, column, event.target.checked, printColumnReferenceOrder)
                                      )
                                    }
                                    data-testid={`print-column-toggle-${column}`}
                                  />
                                  <span>{column}</span>
                                </label>
                                <label className="sheet-form-field sheet-print-column-label-field">
                                  <span>Nome na impressao</span>
                                  <input
                                    type="text"
                                    value={printColumnLabels[column] ?? column}
                                    onChange={(event) =>
                                      setPrintColumnLabels((prev) => ({ ...prev, [column]: event.target.value }))
                                    }
                                    data-testid={`print-column-label-${column}`}
                                  />
                                </label>
                                {printExpandedColumn || activePrintFilterCount > 0 ? (
                                  <div className="sheet-print-column-meta">
                                    {printExpandedColumn ? <span>Expandida em {printExpandedColumn}</span> : null}
                                    {activePrintFilterCount > 0 ? <span>Filtro: {activePrintFilterCount}</span> : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="sheet-order-actions">
                                {isPrintTableScope ? (
                                  <button
                                    type="button"
                                    className="sheet-panel-head-btn sheet-print-filter-btn"
                                    onClick={() => openPrintFilterPopover(column)}
                                    data-testid={`print-column-filter-${column}`}
                                    ref={(element) => {
                                      printFilterTriggerRefs.current[column] = element;
                                    }}
                                  >
                                    {activePrintFilterCount > 0 ? `Filtro (${activePrintFilterCount})` : "Filtro"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="sheet-order-btn"
                                  disabled={!enabled}
                                  onClick={() => setPrintColumns((prev) => moveOrderedValue(prev, column, "up"))}
                                  data-testid={`print-column-up-${column}`}
                                >
                                  ^
                                </button>
                                <button
                                  type="button"
                                  className="sheet-order-btn"
                                  disabled={!enabled}
                                  onClick={() => setPrintColumns((prev) => moveOrderedValue(prev, column, "down"))}
                                  data-testid={`print-column-down-${column}`}
                                >
                                  v
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section className="sheet-dialog-section">
                      <div className="sheet-dialog-grid">
                        <label className="sheet-form-field">
                          <span>Separar por</span>
                          <select
                            value={printSectionColumn}
                            onChange={(event) => setPrintSectionColumn(event.target.value)}
                            data-testid="print-section-column"
                          >
                            <option value="">Sem separacao</option>
                            {allColumns.map((column) => (
                              <option key={`print-section-column-${column}`} value={column}>
                                {getPrintColumnLabel(column)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {printSectionColumn ? (
                          <label className="sheet-dialog-checkbox sheet-dialog-checkbox-inline">
                            <input
                              type="checkbox"
                              checked={printIncludeOthers}
                              onChange={(event) => setPrintIncludeOthers(event.target.checked)}
                              data-testid="print-include-others"
                            />
                            <span>Adicionar secao Outros</span>
                          </label>
                        ) : null}
                      </div>
                      {printSectionColumn ? (
                        <>
                          <div className="sheet-dialog-section-head">
                            <div>
                              <strong>Valores tratados</strong>
                              <span>Os desmarcados poderao ser agrupados em Outros.</span>
                            </div>
                            <div className="sheet-dialog-section-actions">
                              <button
                                type="button"
                                className="sheet-filter-clear-btn"
                                onClick={() => setPrintSectionValues(printSectionOptions.map((option) => option.literal))}
                                data-testid="print-sections-select-all"
                              >
                                Selecionar tudo
                              </button>
                              <button
                                type="button"
                                className="sheet-filter-clear-btn"
                                onClick={() => setPrintSectionValues([])}
                                data-testid="print-sections-clear"
                              >
                                Desselecionar
                              </button>
                            </div>
                          </div>
                          <div className="sheet-order-list" data-testid="print-section-values-list">
                            {printSectionOptions.map((option) => {
                              const enabled = printSectionValues.includes(option.literal);
                              return (
                                <div key={`print-section-value-${option.literal}`} className="sheet-order-item">
                                  <label className="sheet-dialog-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={enabled}
                                      onChange={(event) =>
                                        setPrintSectionValues((prev) =>
                                          toggleOrderedValue(prev, option.literal, event.target.checked)
                                        )
                                      }
                                      data-testid={`print-section-toggle-${toTestIdFragment(option.literal)}`}
                                    />
                                    <span>
                                      {option.label} <em>({option.count})</em>
                                    </span>
                                  </label>
                                  <div className="sheet-order-actions">
                                    <button
                                      type="button"
                                      className="sheet-order-btn"
                                      disabled={!enabled}
                                      onClick={() =>
                                        setPrintSectionValues((prev) => moveOrderedValue(prev, option.literal, "up"))
                                      }
                                      data-testid={`print-section-up-${toTestIdFragment(option.literal)}`}
                                    >
                                      ^
                                    </button>
                                    <button
                                      type="button"
                                      className="sheet-order-btn"
                                      disabled={!enabled}
                                      onClick={() =>
                                        setPrintSectionValues((prev) => moveOrderedValue(prev, option.literal, "down"))
                                      }
                                      data-testid={`print-section-down-${toTestIdFragment(option.literal)}`}
                                    >
                                      v
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                    </section>

                    <PrintHighlightEditor
                      allColumns={allColumns}
                      getPrintColumnLabel={getPrintColumnLabel}
                      opacityPercent={printHighlightOpacityPercent}
                      previews={printHighlightPreview}
                      rules={printHighlightRules}
                      onAdd={addPrintHighlightRule}
                      onOpacityChange={setPrintHighlightOpacityPercent}
                      onRemove={removePrintHighlightRule}
                      onUpdate={updatePrintHighlightRule}
                    />

                    <section className="sheet-dialog-section">
                      <div className="sheet-dialog-section-head">
                        <div>
                          <strong>Preview</strong>
                          <span>
                            {printableRows.length} linha(s) disponiveis, {printPreviewColumns.length} coluna(s) selecionada(s)
                          </span>
                        </div>
                      </div>
                      <div className="sheet-print-preview" data-testid="print-preview">
                        {printPreviewColumns.length === 0 ? (
                          <p>Selecione ao menos uma coluna para visualizar a impressao.</p>
                        ) : printPreviewRows.length === 0 ? (
                          <p>Nao ha linhas no escopo atual.</p>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                {printPreviewColumns.slice(0, 10).map((column) => (
                                  <th key={`print-preview-head-${column.key}`}>{column.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {printPreviewRows.map((row, rowIndex) => (
                                <tr key={`print-preview-row-${rowIndex}`}>
                                  {printPreviewColumns.slice(0, 10).map((column) => (
                                    <td key={`print-preview-cell-${rowIndex}-${column.key}`}>
                                      {toDisplay(resolveEffectivePrintValue(row, column.key), column.key) || " "}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </section>

                    {printError ? (
                      <p className="sheet-error" data-testid="print-error">
                        {printError}
                      </p>
                    ) : null}
                    <div className="sheet-dialog-actions">
                      <button
                        type="submit"
                        className="sheet-form-submit"
                        data-testid="print-submit"
                        disabled={printSubmitting}
                      >
                        {printSubmitting ? "Gerando..." : "Gerar impressao"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
      <GridDrawersSection>
      <HolisticChooserDialog
        open={selectionDialogOpen}
        overlayTestId="selection-dialog-overlay"
        dialogTestId="selection-dialog"
        title="Selecao"
        subtitle={`Grid: ${activeSheet.label}`}
        options={selectionDialogOptions}
        emptyMessage="Nenhuma acao de selecao disponivel."
        closeTestId="selection-dialog-close"
        compact
        onClose={() => setSelectionDialogOpen(false)}
        actionMap={{
          cases: {
            "select-visible": async () => {
              selectVisibleRows();
            },
            "invert-selection": async () => {
              invertVisibleSelection();
            },
            "clear-selection": async () => {
              clearSelectedRows();
            },
            "conference-mark": async () => {
              applyConferenceAction("mark");
            },
            "conference-unmark": async () => {
              applyConferenceAction("unmark");
            }
          }
        }}
      />
      <HolisticChooserDialog
        open={activeFiltersDialogOpen}
        overlayTestId="active-filters-dialog-overlay"
        dialogTestId="active-filters-dialog"
        title="Filtros ativos"
        subtitle={`Grid: ${activeSheet.label}`}
        options={activeFiltersDialogOptions}
        emptyMessage="Nenhum filtro ativo neste grid."
        closeTestId="active-filters-dialog-close"
        compact
        onClose={() => setActiveFiltersDialogOpen(false)}
        actionMap={{
          default: async (key) => {
            clearFilterColumn(key);
          },
          cases: {
            __all__: async () => {
              clearAllFilters();
            }
          }
        }}
      />
      <HolisticChooserDialog
        open={Boolean(relationDialog)}
        overlayTestId="relation-dialog-overlay"
        dialogTestId="relation-dialog"
        title={relationDialog ? `Expandir PK/FK: ${relationDialog.sourceColumn}` : "Expandir PK/FK"}
        subtitle={relationDialog ? `Tabela de origem: ${relationDialog.targetTable}` : undefined}
        options={
          relationDialog && relationDialogPayload
            ? relationDialogPayload.header.map((columnName) => ({
                key: columnName,
                label: columnName,
                testId: `relation-option-${relationDialog.sourceColumn}-${columnName}`
              }))
            : []
        }
        loading={relationDialogLoading && !relationDialogPayload}
        emptyMessage="Sem dados para expandir."
        closeTestId="relation-dialog-close"
        onClose={() => setRelationDialog(null)}
        actionMap={{
          default: async (key) => {
            selectDisplayColumnForRelation(key);
          }
        }}
      />
      <HolisticChooserDialog
        open={secondaryGridChooserOpen}
        overlayTestId="secondary-grid-dialog-overlay"
        dialogTestId="secondary-grid-dialog"
        title="Abrir tabela secundaria"
        subtitle="Selecione uma tabela para o painel direito."
        options={SHEETS.map((sheet) => ({
          key: sheet.key,
          label: sheet.label,
          description: sheet.description,
          testId: `secondary-grid-option-${sheet.key}`
        }))}
        emptyMessage="Nenhuma tabela disponivel."
        closeTestId="secondary-grid-dialog-close"
        compact
        onClose={() => setSecondaryGridChooserOpen(false)}
        actionMap={{
          default: async (key) => {
            setSecondaryGridChooserOpen(false);
            openSecondaryGridSheet(key as SheetKey);
          }
        }}
      />
      <HolisticChooserDialog
        open={hiddenColumnsDialogOpen}
        overlayTestId="hidden-columns-dialog-overlay"
        dialogTestId="hidden-columns-dialog"
        title="Colunas ocultas"
        subtitle={`Grid: ${activeSheet.label}`}
        options={hiddenColumnsDialogOptions}
        emptyMessage="Nenhuma coluna oculta neste grid."
        closeTestId="hidden-columns-dialog-close"
        compact
        onClose={() => setHiddenColumnsDialogOpen(false)}
        actionMap={{
          default: async (key) => {
            showHiddenColumn(key);
          },
          cases: {
            __all__: async () => {
              showAllHiddenColumns();
            }
          }
        }}
      />
      {priceContextOpen
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="price-context-overlay" role="dialog" aria-modal="true">
              <form className="sheet-focus-dialog is-compact sheet-dialog-form" onSubmit={submitPriceContext} data-testid="price-context-dialog">
                <div className="sheet-focus-dialog-head">
                  <div>
                    <strong>Contexto da alteração de preço</strong>
                    <p>{priceContextHint}</p>
                  </div>
                  <button type="button" className="sheet-panel-close" onClick={cancelPriceContext} aria-label="Fechar">×</button>
                </div>
                <div className="sheet-focus-dialog-body">
                  {priceContextOld !== null || priceContextNew !== null ? (
                    <p>
                      {`Alteração: ${priceContextOld !== null ? fmtCurrency.format(priceContextOld) : "(vazio)"} → ${
                        priceContextNew !== null ? fmtCurrency.format(priceContextNew) : "(vazio)"
                      }`}
                    </p>
                  ) : null}
                  <label className="sheet-form-field is-form-span-full">
                    <span>Descreva o contexto</span>
                    <textarea
                      ref={priceContextTextareaRef}
                      value={priceContextText}
                      onChange={(e) => setPriceContextText(e.target.value)}
                      rows={4}
                      data-testid="price-context-text"
                      placeholder="Ex.: atualização por mudança de tabela, oferta, erro de cadastro, etc."
                    />
                  </label>
                  <div className="sheet-dialog-actions">
                    <button type="button" className="sheet-form-secondary" onClick={cancelPriceContext} data-testid="price-context-cancel">
                      Cancelar
                    </button>
                    <button type="submit" className="sheet-form-submit" data-testid="price-context-submit">
                      Salvar contexto e continuar
                    </button>
                  </div>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
      {priceContextsOpen
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="price-contexts-overlay" role="dialog" aria-modal="true">
              <div className="sheet-focus-dialog sheet-print-dialog" data-testid="price-contexts-dialog">
                <div className="sheet-focus-dialog-head">
                  <div>
                    <strong>Contextos de alteração de preço</strong>
                    <p>
                      {`Tabela: ${activeSheet.key}`}
                      {priceContextsRowId ? ` | Registro: ${priceContextsRowId}` : ""}
                      {priceContextsColumn ? ` | Coluna: ${priceContextsColumn}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sheet-panel-close"
                    onClick={() => setPriceContextsOpen(false)}
                    aria-label="Fechar"
                  >
                    ×
                  </button>
                </div>
                <div className="sheet-focus-dialog-body">
                  {priceContextsLoading ? <p>Carregando...</p> : null}
                  {priceContextsError ? <p className="sheet-error">{priceContextsError}</p> : null}
                  <div style={{ overflowX: "auto" }}>
                    <table className="sheet-grid" data-testid="price-contexts-table">
                      <thead>
                        <tr>
                          <th>Quando</th>
                          <th>Tabela</th>
                          <th>Registro</th>
                          <th>Coluna</th>
                          <th>De</th>
                          <th>Para</th>
                          <th>Contexto</th>
                          <th>Autor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceContextsRows.length === 0 ? (
                          <tr>
                            <td colSpan={8}>Sem registros.</td>
                          </tr>
                        ) : (
                          priceContextsRows.map((r) => (
                            <tr key={r.id}>
                              <td>{new Date(r.created_at).toLocaleString()}</td>
                              <td>{r.table_name}</td>
                              <td>{r.row_id}</td>
                              <td>{r.column_name}</td>
                              <td>{r.old_value ?? "(vazio)"}</td>
                              <td>{r.new_value ?? "(vazio)"}</td>
                              <td>{r.context}</td>
                              <td>{r.created_by ?? "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="sheet-dialog-actions" style={{ justifyContent: "space-between" }}>
                    <div>
                      <button
                        type="button"
                        className="sheet-form-secondary"
                        onClick={async () => {
                          const next = Math.max(1, priceContextsPage - 1);
                          setPriceContextsPage(next);
                          await loadPriceContexts(priceContextsColumn, priceContextsRowId, next, priceContextsPageSize);
                        }}
                        disabled={priceContextsPage <= 1 || priceContextsLoading}
                      >
                        Página anterior
                      </button>
                      <button
                        type="button"
                        className="sheet-form-secondary"
                        onClick={async () => {
                          const next = priceContextsPage + 1;
                          setPriceContextsPage(next);
                          await loadPriceContexts(priceContextsColumn, priceContextsRowId, next, priceContextsPageSize);
                        }}
                        disabled={priceContextsLoading}
                        style={{ marginLeft: 8 }}
                      >
                        Próxima página
                      </button>
                    </div>
                    <div>
                      <label className="sheet-form-field" style={{ display: "inline-grid", width: 140 }}>
                        <span>Tamanho</span>
                        <select
                          value={priceContextsPageSize}
                          onChange={async (e) => {
                            const next = Number(e.target.value);
                            setPriceContextsPageSize(next);
                            await loadPriceContexts(priceContextsColumn, priceContextsRowId, 1, next);
                            setPriceContextsPage(1);
                          }}
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {anuncioInsightsOpen
        ? createPortal(
            <div className="sheet-focus-overlay" data-testid="anuncio-insights-overlay" role="dialog" aria-modal="true">
              <div className="sheet-focus-dialog is-compact" data-testid="anuncio-insights-dialog">
                <div className="sheet-focus-dialog-head">
                  <div>
                    <strong>Insights do anúncio</strong>
                    <p>{insightDialogRowId ? `ID: ${insightDialogRowId}` : undefined}</p>
                  </div>
                  <button
                    type="button"
                    className="sheet-panel-close"
                    onClick={() => setAnuncioInsightsOpen(false)}
                    aria-label="Fechar"
                  >
                    ×
                  </button>
                </div>
                <div className="sheet-focus-dialog-body">
                  {anuncioInsightsLoading ? <p>Carregando...</p> : null}
                  {anuncioInsightsError ? <p className="sheet-error">{anuncioInsightsError}</p> : null}
                  {(!anuncioInsightsLoading && !anuncioInsightsError && anuncioInsights.length === 0) ? (
                    <p>Nenhum insight registrado para este anúncio.</p>
                  ) : null}
                  <div className="sheet-order-list" data-testid="anuncio-insights-list">
                    {anuncioInsights.map((item, idx) => (
                      <div key={`insight-${idx}`} className="sheet-order-item">
                        <div style={{ display: 'grid', gap: 4 }}>
                          <strong>{item.code}</strong>
                          <span>{item.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {canVerifyAnuncioInsight && insightDialogRowId && !insightDialogRowId.startsWith("missing:") ? (
                    <button
                      type="button"
                      className={`${styles.btn} sheet-nav-btn`}
                      onClick={() => void handleVerifyCurrentAnuncioInsight()}
                      disabled={anuncioInsightsLoading || anuncioInsights.length === 0}
                      data-testid="action-verify-anuncio-insight"
                      title="Marcar o insight primario deste anuncio como verificado"
                    >
                      Marcar verificado
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      </GridDrawersSection>
    </main>
  );
}


