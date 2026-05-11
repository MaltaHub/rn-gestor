import { useCallback, useMemo, useState } from "react";
import { getActualUsedRange, isColumnHidden, isRowHidden, normalizeSelection } from "@/components/playground/grid-utils";
import type { PlaygroundPage, PlaygroundSelection, PlaygroundWorkbook } from "@/components/playground/types";

export type PlaygroundPrintScope = "page" | "selection";

export type PlaygroundPrintDialogState = {
  scope: PlaygroundPrintScope;
  title: string;
  showGridLines: boolean;
  showSheetIndexes: boolean;
  pageRange: PlaygroundSelection;
  selectionRange: PlaygroundSelection | null;
};

type BuildPrintDocumentParams = {
  page: PlaygroundPage;
  range: PlaygroundSelection;
  title: string;
  showGridLines: boolean;
  showSheetIndexes: boolean;
};

type UsePlaygroundPrintDialogParams = {
  activePage: PlaygroundPage | null;
  workbook: PlaygroundWorkbook | null;
  printablePage: PlaygroundPage | null;
  selection: PlaygroundSelection | null;
  buildPrintDocument: (params: BuildPrintDocumentParams) => string;
  onError: (message: string | null) => void;
};

function hasVisibleRowsInRange(page: PlaygroundPage, range: PlaygroundSelection) {
  const normalized = normalizeSelection(range);

  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    if (!isRowHidden(page, row)) {
      return true;
    }
  }

  return false;
}

function hasVisibleColumnsInRange(page: PlaygroundPage, range: PlaygroundSelection) {
  const normalized = normalizeSelection(range);

  for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
    if (!isColumnHidden(page, col)) {
      return true;
    }
  }

  return false;
}

export function usePlaygroundPrintDialog({
  activePage,
  buildPrintDocument,
  onError,
  printablePage,
  selection,
  workbook
}: UsePlaygroundPrintDialogParams) {
  const [printDialog, setPrintDialog] = useState<PlaygroundPrintDialogState | null>(null);

  const printDialogRange = useMemo(() => {
    if (!printDialog) return null;
    return printDialog.scope === "selection" ? printDialog.selectionRange : printDialog.pageRange;
  }, [printDialog]);

  const printPreviewColumnIndexes = useMemo(() => {
    if (!printablePage || !printDialogRange) return [];
    const normalized = normalizeSelection(printDialogRange);
    const indexes: number[] = [];

    for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
      if (!isColumnHidden(printablePage, col)) {
        indexes.push(col);
      }
    }

    return indexes;
  }, [printDialogRange, printablePage]);

  const printPreviewRowIndexes = useMemo(() => {
    if (!printablePage || !printDialogRange) return [];
    const normalized = normalizeSelection(printDialogRange);
    const indexes: number[] = [];

    for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
      if (!isRowHidden(printablePage, row)) {
        indexes.push(row);
      }
    }

    return indexes;
  }, [printDialogRange, printablePage]);

  const openPrintDialog = useCallback(
    (scope: PlaygroundPrintScope) => {
      if (!activePage || !workbook) return;

      const printPage = printablePage ?? activePage;
      const pageRange = getActualUsedRange(printPage);
      const selectionRange = selection ? normalizeSelection(selection) : null;
      const range = scope === "selection" ? selectionRange : pageRange;

      if (!range) {
        onError(scope === "selection" ? "Selecione uma area antes de imprimir." : "Nao ha dados para imprimir nesta pagina.");
        return;
      }

      if (!hasVisibleRowsInRange(printPage, range) || !hasVisibleColumnsInRange(printPage, range)) {
        onError("Nao ha linhas ou colunas visiveis no intervalo escolhido para impressao.");
        return;
      }

      setPrintDialog({
        scope,
        title: `${activePage.name} - ${scope === "page" ? "Pagina inteira" : "Selecao"}`,
        showGridLines: workbook.preferences.showGridLines,
        showSheetIndexes: false,
        pageRange: pageRange ?? range,
        selectionRange
      });
      onError(null);
    },
    [activePage, onError, printablePage, selection, workbook]
  );

  const submitPrintDialog = useCallback(() => {
    if (!activePage || !workbook || !printDialog) return;

    const printPage = printablePage ?? activePage;
    const range = printDialog.scope === "selection" ? printDialog.selectionRange : printDialog.pageRange;

    if (!range) {
      onError("Nao ha intervalo valido para impressao.");
      return;
    }

    if (!hasVisibleRowsInRange(printPage, range) || !hasVisibleColumnsInRange(printPage, range)) {
      onError("Nao ha linhas ou colunas visiveis no intervalo escolhido para impressao.");
      return;
    }

    const popup = window.open("", "_blank", "width=1200,height=860");

    if (!popup) {
      onError("Nao foi possivel abrir a janela de impressao.");
      return;
    }

    popup.document.open();
    popup.document.write(
      buildPrintDocument({
        page: printPage,
        range,
        title: printDialog.title.trim() || activePage.name,
        showGridLines: printDialog.showGridLines,
        showSheetIndexes: printDialog.showSheetIndexes
      })
    );
    popup.document.close();
    window.setTimeout(() => {
      popup.focus();
      popup.print();
    }, 80);
    setPrintDialog(null);
    onError(null);
  }, [activePage, buildPrintDocument, onError, printablePage, printDialog, workbook]);

  return {
    printDialog,
    setPrintDialog,
    printDialogRange,
    printPreviewColumnIndexes,
    printPreviewRowIndexes,
    openPrintDialog,
    submitPrintDialog
  };
}
