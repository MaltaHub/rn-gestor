import { useCallback, useState } from "react";
import type { RelationDialogTarget, SheetKey } from "@/components/ui-grid/types";

export type GridRelationDialogState = {
  sourceColumn: string;
  targetTable: SheetKey;
  keyColumn: string;
  target: RelationDialogTarget;
};

export function useGridDrawerState() {
  const [relationDialog, setRelationDialog] = useState<GridRelationDialogState | null>(null);
  const [relationDialogLoading, setRelationDialogLoading] = useState(false);
  const [hiddenColumnsDialogOpen, setHiddenColumnsDialogOpen] = useState(false);
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [activeFiltersDialogOpen, setActiveFiltersDialogOpen] = useState(false);

  const closeGridDrawers = useCallback(() => {
    setRelationDialog(null);
    setHiddenColumnsDialogOpen(false);
    setSelectionDialogOpen(false);
    setActiveFiltersDialogOpen(false);
  }, []);

  return {
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
  };
}
