import { useState } from "react";

export type CellAnchor = {
  rIdx: number;
  cIdx: number;
};

export function useGridSelection() {
  const [selectionModes, setSelectionModes] = useState({ conference: false, editor: false });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastClickedRowId, setLastClickedRowId] = useState<string | null>(null);
  const [lastCellAnchor, setLastCellAnchor] = useState<CellAnchor | null>(null);
  const [currentCell, setCurrentCell] = useState<CellAnchor | null>(null);
  const [lastRowAnchor, setLastRowAnchor] = useState<number | null>(null);
  const [selectCycleMode, setSelectCycleMode] = useState<"default" | "inverted">("default");

  return {
    selectionModes,
    setSelectionModes,
    selectedRows,
    setSelectedRows,
    selectedCells,
    setSelectedCells,
    lastClickedRowId,
    setLastClickedRowId,
    lastCellAnchor,
    setLastCellAnchor,
    currentCell,
    setCurrentCell,
    lastRowAnchor,
    setLastRowAnchor,
    selectCycleMode,
    setSelectCycleMode
  };
}
