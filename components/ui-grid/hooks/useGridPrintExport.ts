import { useState } from "react";
import { DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT } from "@/components/ui-grid/print-highlights";
import type { PrintHighlightRule } from "@/components/ui-grid/print-highlights";
import type { PrintScope, PrintSortDirection, SheetKey } from "@/components/ui-grid/types";

export type PrintFilterPopoverPosition = {
  top: number;
  left: number;
  maxHeight: number;
};

export function useGridPrintExport() {
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printTitle, setPrintTitle] = useState("");
  const [printScope, setPrintScope] = useState<PrintScope>("table");
  const [printColumns, setPrintColumns] = useState<string[]>([]);
  const [printColumnLabels, setPrintColumnLabels] = useState<Record<string, string>>({});
  const [printFilters, setPrintFilters] = useState<Record<string, string[]>>({});
  const [printDisplayColumnOverrides, setPrintDisplayColumnOverrides] = useState<Record<string, string>>({});
  const [printSortColumn, setPrintSortColumn] = useState("");
  const [printSortDirection, setPrintSortDirection] = useState<PrintSortDirection>("asc");
  const [printSectionColumn, setPrintSectionColumn] = useState("");
  const [printSectionValues, setPrintSectionValues] = useState<string[]>([]);
  const [printIncludeOthers, setPrintIncludeOthers] = useState(true);
  const [printHighlightOpacityPercent, setPrintHighlightOpacityPercent] = useState(DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT);
  const [printHighlightRules, setPrintHighlightRules] = useState<PrintHighlightRule[]>([]);
  const [printSubmitting, setPrintSubmitting] = useState(false);
  const [quickPrintSubmitting, setQuickPrintSubmitting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const [printFilterPopoverColumn, setPrintFilterPopoverColumn] = useState<string | null>(null);
  const [printFilterPopoverSearch, setPrintFilterPopoverSearch] = useState("");
  const [printFilterDraftValues, setPrintFilterDraftValues] = useState<string[]>([]);
  const [printFilterDateFrom, setPrintFilterDateFrom] = useState("");
  const [printFilterDateTo, setPrintFilterDateTo] = useState("");
  const [printFilterPopoverPosition, setPrintFilterPopoverPosition] = useState<PrintFilterPopoverPosition | null>(null);

  const [displayColumnBySheet, setDisplayColumnBySheet] = useState<Partial<Record<SheetKey, Record<string, string>>>>({});

  return {
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
  };
}
