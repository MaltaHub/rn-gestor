import { useCallback, useRef, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import type { SheetKey } from "@/components/ui-grid/types";
import type { CellAnchor, GridSelectionState } from "@/components/ui-grid/hooks/useGridSelection";

type UseGridKeyboardSelectionParams = {
  activeSheetKey: SheetKey;
  activeSheetPrimaryKey: string;
  columns: string[];
  getSelectableRowIds: (rows: Array<Record<string, unknown>>) => string[];
  gridRef: RefObject<HTMLDivElement | null>;
  isConferenceMode: boolean;
  isEditorMode: boolean;
  onOpenUpdateForm: (row: Record<string, unknown>) => void | Promise<void>;
  selection: GridSelectionState;
  toggleConferenceRow: (rowId: string) => void;
  viewRows: Array<Record<string, unknown>>;
};

export function cellKey(rIdx: number, cIdx: number) {
  return `${rIdx}::${cIdx}`;
}

export function parseCellKey(value: string): CellAnchor {
  const [r, c] = value.split("::");
  return { rIdx: Number(r), cIdx: Number(c) };
}

function focusGridWithoutScroll(gridRef: RefObject<HTMLDivElement | null>) {
  gridRef.current?.focus({ preventScroll: true });
}

export function useGridKeyboardSelection({
  activeSheetKey,
  activeSheetPrimaryKey,
  columns,
  getSelectableRowIds,
  gridRef,
  isConferenceMode,
  isEditorMode,
  onOpenUpdateForm,
  selection,
  toggleConferenceRow,
  viewRows
}: UseGridKeyboardSelectionParams) {
  const {
    lastCellAnchor,
    lastRowAnchor,
    selectedRows,
    selectCycleMode,
    setCurrentCell,
    setLastCellAnchor,
    setLastClickedRowId,
    setLastRowAnchor,
    setSelectedCells,
    setSelectedRows,
    setSelectCycleMode
  } = selection;
  const lastCellAnchorRef = useRef<CellAnchor | null>(null);
  const currentCellRef = useRef<CellAnchor | null>(null);

  const setCellAnchor = useCallback(
    (next: CellAnchor | null) => {
      lastCellAnchorRef.current = next;
      setLastCellAnchor(next);
    },
    [setLastCellAnchor]
  );

  const setCurrentCellAnchor = useCallback(
    (next: CellAnchor | null) => {
      currentCellRef.current = next;
      setCurrentCell(next);
    },
    [setCurrentCell]
  );

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
    setSelectedCells(new Set());
    setCellAnchor(null);
    setCurrentCellAnchor(null);
    setLastRowAnchor(null);
    setSelectCycleMode("default");
  }, [setCellAnchor, setCurrentCellAnchor, setLastRowAnchor, setSelectCycleMode, setSelectedCells, setSelectedRows]);

  const getCellSelectionAnchor = useCallback(() => currentCellRef.current ?? lastCellAnchorRef.current ?? lastCellAnchor, [lastCellAnchor]);

  const handleCellClick = useCallback(
    (rIdx: number, cIdx: number, event: ReactMouseEvent) => {
      focusGridWithoutScroll(gridRef);
      const row = viewRows[rIdx];
      const rowId = String(row?.[activeSheetPrimaryKey] ?? "");
      if (rowId) setLastClickedRowId(rowId);

      if (row && isEditorMode) {
        void onOpenUpdateForm(row);
        return;
      }

      if (row && isConferenceMode) {
        toggleConferenceRow(rowId);
        return;
      }

      const key = cellKey(rIdx, cIdx);
      setCurrentCellAnchor({ rIdx, cIdx });

      const anchor = lastCellAnchorRef.current ?? lastCellAnchor;
      if (event.shiftKey && anchor) {
        const next = new Set<string>();
        const rMin = Math.min(anchor.rIdx, rIdx);
        const rMax = Math.max(anchor.rIdx, rIdx);
        const cMin = Math.min(anchor.cIdx, cIdx);
        const cMax = Math.max(anchor.cIdx, cIdx);

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
    },
    [
      activeSheetPrimaryKey,
      gridRef,
      isConferenceMode,
      isEditorMode,
      lastCellAnchor,
      onOpenUpdateForm,
      setCellAnchor,
      setCurrentCellAnchor,
      setLastClickedRowId,
      setSelectedCells,
      toggleConferenceRow,
      viewRows
    ]
  );

  const handleRowToggle = useCallback(
    (rowIndex: number, rowId: string, event: ReactMouseEvent) => {
      setLastClickedRowId(rowId);
      focusGridWithoutScroll(gridRef);
      setSelectCycleMode("default");

      if (event.shiftKey && lastRowAnchor != null) {
        const min = Math.min(lastRowAnchor, rowIndex);
        const max = Math.max(lastRowAnchor, rowIndex);
        const next = new Set(selectedRows);

        for (let idx = min; idx <= max; idx += 1) {
          const row = viewRows[idx];
          if (!row) continue;
          next.add(String(row[activeSheetPrimaryKey] ?? ""));
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
    },
    [
      activeSheetPrimaryKey,
      gridRef,
      lastRowAnchor,
      selectedRows,
      setLastClickedRowId,
      setLastRowAnchor,
      setSelectedRows,
      setSelectCycleMode,
      viewRows
    ]
  );

  const selectVisibleRows = useCallback(() => {
    const visibleIds = getSelectableRowIds(viewRows);
    setSelectedRows(new Set(visibleIds));
    setSelectCycleMode("default");
  }, [getSelectableRowIds, setSelectedRows, setSelectCycleMode, viewRows]);

  const clearSelectedRows = useCallback(() => {
    setSelectedRows(new Set());
    setSelectCycleMode("default");
  }, [setSelectedRows, setSelectCycleMode]);

  const invertVisibleSelection = useCallback(() => {
    const visibleIds = getSelectableRowIds(viewRows);
    const inverted = new Set<string>();

    for (const rowId of visibleIds) {
      if (!selectedRows.has(rowId)) {
        inverted.add(rowId);
      }
    }

    setSelectedRows(inverted);
    setSelectCycleMode("inverted");
  }, [getSelectableRowIds, selectedRows, setSelectedRows, setSelectCycleMode, viewRows]);

  const handleSelectAllCycle = useCallback(() => {
    const visibleIds = getSelectableRowIds(viewRows);

    if (visibleIds.length === 0) {
      clearSelectedRows();
      return;
    }

    if (selectedRows.size === 0) {
      selectVisibleRows();
      return;
    }

    if (selectedRows.size === visibleIds.length) {
      clearSelectedRows();
      return;
    }

    if (selectCycleMode === "inverted") {
      clearSelectedRows();
      return;
    }

    invertVisibleSelection();
  }, [
    clearSelectedRows,
    getSelectableRowIds,
    invertVisibleSelection,
    selectCycleMode,
    selectVisibleRows,
    selectedRows.size,
    viewRows
  ]);

  const moveCellSelectionBy = useCallback(
    (dr: number, dc: number, withRange: boolean) => {
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

      const cell = document.getElementById(`grid-cell-${activeSheetKey}-${nextRow}-${nextCol}`);
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
      focusGridWithoutScroll(gridRef);
    },
    [activeSheetKey, columns.length, gridRef, setCellAnchor, setCurrentCellAnchor, setSelectedCells, viewRows.length]
  );

  return {
    clearSelectedRows,
    clearSelection,
    getCellSelectionAnchor,
    handleCellClick,
    handleRowToggle,
    handleSelectAllCycle,
    invertVisibleSelection,
    moveCellSelectionBy,
    selectVisibleRows
  };
}
