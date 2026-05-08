import type {
  GridFilters,
  SheetKey,
  SortRule,
  StoredGridScroll,
  StoredSelectionModes,
  StoredSheetLayout,
  StoredSheetPagination,
  StoredWorkspacePanels
} from "@/components/ui-grid/types";

type GridStorageKind =
  | "filters"
  | "widths"
  | "hidden"
  | "sort"
  | "display"
  | "layout"
  | "page"
  | "conference"
  | "modes"
  | "scroll"
  | "form-sections"
  | "panels"
  | "print";

export function storageKey(sheet: SheetKey, kind: GridStorageKind) {
  return `grid:v1:${sheet}:${kind}`;
}

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function normalizeStoredGridScroll(value: Partial<StoredGridScroll> | null | undefined): StoredGridScroll {
  const left = Number(value?.left ?? 0);
  const top = Number(value?.top ?? 0);

  return {
    left: Number.isFinite(left) ? Math.max(0, Math.round(left)) : 0,
    top: Number.isFinite(top) ? Math.max(0, Math.round(top)) : 0
  };
}

export function clampGridScrollToNode(
  node: Pick<HTMLElement, "clientHeight" | "clientWidth" | "scrollHeight" | "scrollLeft" | "scrollTop" | "scrollWidth">,
  value: Partial<StoredGridScroll> | null | undefined
): StoredGridScroll {
  const normalized = normalizeStoredGridScroll(value);
  const maxLeft = Math.max(0, Math.round(node.scrollWidth - node.clientWidth));
  const maxTop = Math.max(0, Math.round(node.scrollHeight - node.clientHeight));

  return {
    left: Math.min(normalized.left, maxLeft),
    top: Math.min(normalized.top, maxTop)
  };
}

export function normalizeWorkspacePanels(next: StoredWorkspacePanels, mobile: boolean) {
  let grid = next.grid;
  const form = next.form;

  if (mobile && form) {
    grid = false;
  }

  if (!grid && !form) {
    grid = true;
  }

  return { grid, form };
}

export function persistSheetState(
  sheet: SheetKey,
  next: {
    filters: GridFilters;
    widths: Record<string, number>;
    sort: SortRule[];
    display: Record<string, string>;
    layout: StoredSheetLayout;
  }
) {
  writeStorage(storageKey(sheet, "filters"), next.filters);
  writeStorage(storageKey(sheet, "widths"), next.widths);
  writeStorage(storageKey(sheet, "sort"), next.sort);
  writeStorage(storageKey(sheet, "display"), next.display);
  writeStorage(storageKey(sheet, "layout"), next.layout);
}

export function persistPaginationState(sheet: SheetKey, next: StoredSheetPagination) {
  writeStorage(storageKey(sheet, "page"), next);
}

export function persistSelectionModes(sheet: SheetKey, next: StoredSelectionModes) {
  writeStorage(storageKey(sheet, "modes"), next);
}

export function persistWorkspacePanels(sheet: SheetKey, next: StoredWorkspacePanels) {
  writeStorage(storageKey(sheet, "panels"), next);
}

export function persistGridScrollState(sheet: SheetKey, next: StoredGridScroll) {
  writeStorage(storageKey(sheet, "scroll"), next);
}
