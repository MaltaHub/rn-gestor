import { useCallback, useState } from "react";
import type { RelationDialogTarget, SheetKey } from "@/components/ui-grid/types";

export type GridRelationDialogState = {
  sourceColumn: string;
  /** Tabela apontada pela FK da coluna (primeiro salto do caminho). */
  targetTable: SheetKey;
  keyColumn: string;
  target: RelationDialogTarget;
  /**
   * Saltos de FK ja escolhidos dentro do dialogo. Vazio = escolhendo a coluna
   * direto na tabela apontada (o caso de sempre). Cada "entrar" empilha um
   * segmento e o dialogo passa a listar as colunas do nivel seguinte.
   */
  segments: string[];
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
