import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchPriceChangeContexts } from "@/components/ui-grid/api";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type FormMode = "insert" | "bulk" | "update";

type UseGridPriceContextDialogsParams = {
  activeSheetKey: SheetKey;
  editingRowId: string | null;
  formMode: FormMode;
  requestAuth: RequestAuth;
};

type PriceContextRow = {
  id: string;
  table_name: string;
  row_id: string;
  column_name: string;
  old_value: number | null;
  new_value: number | null;
  context: string;
  created_by: string | null;
  created_at: string;
};

export function useGridPriceContextDialogs({
  activeSheetKey,
  editingRowId,
  formMode,
  requestAuth
}: UseGridPriceContextDialogsParams) {
  const [priceContextOpen, setPriceContextOpen] = useState(false);
  const [priceContextHint, setPriceContextHint] = useState<string>("");
  const [priceContextOld, setPriceContextOld] = useState<number | null>(null);
  const [priceContextNew, setPriceContextNew] = useState<number | null>(null);
  const [priceContextText, setPriceContextText] = useState("");
  const priceContextResolveRef = useRef<null | ((value: string | null) => void)>(null);
  const priceContextTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [priceContextsOpen, setPriceContextsOpen] = useState(false);
  const [priceContextsLoading, setPriceContextsLoading] = useState(false);
  const [priceContextsError, setPriceContextsError] = useState<string | null>(null);
  const [priceContextsRows, setPriceContextsRows] = useState<PriceContextRow[]>([]);
  const [priceContextsPage, setPriceContextsPage] = useState(1);
  const [priceContextsPageSize, setPriceContextsPageSize] = useState(25);
  const [priceContextsColumn, setPriceContextsColumn] = useState<string>("");
  const [priceContextsRowId, setPriceContextsRowId] = useState<string>("");

  useEffect(() => {
    if (!priceContextOpen) return;
    const id = window.setTimeout(() => {
      priceContextTextareaRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [priceContextOpen]);

  function askPriceChangeContext(params: {
    hint: string;
    oldValue?: number | null;
    newValue?: number | null;
  }): Promise<string | null> {
    setPriceContextHint(params.hint);
    setPriceContextOld(params.oldValue ?? null);
    setPriceContextNew(params.newValue ?? null);
    setPriceContextText("");
    setPriceContextOpen(true);

    return new Promise<string | null>((resolve) => {
      priceContextResolveRef.current = resolve;
    });
  }

  function submitPriceContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = priceContextText.trim();
    const resolve = priceContextResolveRef.current;
    priceContextResolveRef.current = null;
    setPriceContextOpen(false);
    if (resolve) resolve(text || null);
  }

  function cancelPriceContext() {
    const resolve = priceContextResolveRef.current;
    priceContextResolveRef.current = null;
    setPriceContextOpen(false);
    if (resolve) resolve(null);
  }

  async function loadPriceContexts(column: string, rowId: string, page: number, pageSize: number) {
    try {
      setPriceContextsLoading(true);
      setPriceContextsError(null);
      const { rows } = await fetchPriceChangeContexts({
        table: activeSheetKey,
        rowId,
        column,
        page,
        pageSize,
        requestAuth
      });
      setPriceContextsRows(rows);
    } catch (err) {
      setPriceContextsError(err instanceof Error ? err.message : "Falha ao carregar contextos.");
    } finally {
      setPriceContextsLoading(false);
    }
  }

  async function openPriceContextsPanel(column: string) {
    if (formMode !== "update" || !editingRowId) return;
    setPriceContextsColumn(column);
    setPriceContextsRowId(editingRowId);
    setPriceContextsOpen(true);
    setPriceContextsPage(1);
    await loadPriceContexts(column, editingRowId, 1, priceContextsPageSize);
  }

  return {
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
  };
}
