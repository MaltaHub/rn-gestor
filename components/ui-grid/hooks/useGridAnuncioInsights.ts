import { useEffect, useMemo, useState } from "react";
import {
  buildActiveInsightSummary,
  buildInsightItemsFromRow,
  normalizeApiInsightItems
} from "@/components/ui-grid/anuncio-insights-display";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type InsightItem = {
  code: string;
  message: string;
};

type UseGridAnuncioInsightsParams = {
  activeSheetKey: SheetKey;
  activeSheetPrimaryKey: string;
  currencyFormatter: Intl.NumberFormat;
  editingRowId: string | null;
  lastClickedRowId: string | null;
  normalizeNum: (value: unknown) => number | null;
  payloadMatchesActiveSheet: boolean;
  payloadRows: Array<Record<string, unknown>>;
  requestAuth: RequestAuth;
  selectedRows: Set<string>;
};

export function useGridAnuncioInsights({
  activeSheetKey,
  activeSheetPrimaryKey,
  currencyFormatter,
  editingRowId,
  lastClickedRowId,
  normalizeNum,
  payloadMatchesActiveSheet,
  payloadRows,
  requestAuth,
  selectedRows
}: UseGridAnuncioInsightsParams) {
  const [anuncioInsightsOpen, setAnuncioInsightsOpen] = useState(false);
  const [anuncioInsightsLoading, setAnuncioInsightsLoading] = useState(false);
  const [anuncioInsightsError, setAnuncioInsightsError] = useState<string | null>(null);
  const [anuncioInsights, setAnuncioInsights] = useState<InsightItem[]>([]);
  const [anuncioInsightsRowId, setAnuncioInsightsRowId] = useState<string | null>(null);

  const insightDialogRowId = anuncioInsightsRowId ?? editingRowId ?? null;

  async function openAnuncioInsightsPanel(targetRowId?: string) {
    const rowId = targetRowId ?? editingRowId;
    if (activeSheetKey !== "anuncios" || !rowId) return;
    const localRow = payloadMatchesActiveSheet
      ? payloadRows.find((row) => String(row[activeSheetPrimaryKey] ?? "") === rowId)
      : null;
    const localItems = localRow ? buildInsightItemsFromRow(localRow) : [];
    const isMissingReferenceRow = localRow?.__missing_data === true || rowId.startsWith("missing:");
    try {
      setAnuncioInsightsOpen(true);
      setAnuncioInsightsLoading(true);
      setAnuncioInsightsError(null);
      if (anuncioInsightsRowId === rowId && anuncioInsights.length > 0) {
        setAnuncioInsightsLoading(false);
        return;
      }
      if (isMissingReferenceRow) {
        setAnuncioInsights(localItems);
        setAnuncioInsightsRowId(rowId);
        setAnuncioInsightsLoading(false);
        return;
      }
      const res = await fetch(`/api/v1/anuncios/${encodeURIComponent(rowId)}/insights`, {
        headers: buildRequestHeaders(requestAuth)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Falha ao carregar insights do anuncio.");
      }
      const json = (await res.json()) as { data?: { insights: InsightItem[] } };
      const apiItems = normalizeApiInsightItems(json?.data?.insights ?? []);
      const items = apiItems.length > 0 ? apiItems : localItems;
      setAnuncioInsights(items);
      setAnuncioInsightsRowId(rowId);
    } catch (err) {
      if (localItems.length > 0) {
        setAnuncioInsights(localItems);
        setAnuncioInsightsRowId(rowId);
        setAnuncioInsightsError(null);
        return;
      }
      setAnuncioInsightsError(err instanceof Error ? err.message : "Falha ao carregar insights do anuncio.");
    } finally {
      setAnuncioInsightsLoading(false);
    }
  }

  useEffect(() => {
    if (activeSheetKey !== "anuncios" || selectedRows.size !== 1) {
      return;
    }
    const rowId = Array.from(selectedRows)[0] ?? null;
    if (!rowId) return;
    const localRow = payloadMatchesActiveSheet
      ? payloadRows.find((row) => String(row[activeSheetPrimaryKey] ?? "") === rowId)
      : null;
    const localItems = localRow ? buildInsightItemsFromRow(localRow) : [];
    if (localRow?.__missing_data === true || rowId.startsWith("missing:")) {
      setAnuncioInsights(localItems);
      setAnuncioInsightsRowId(rowId);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/v1/anuncios/${encodeURIComponent(rowId)}/insights`, {
          headers: buildRequestHeaders(requestAuth)
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { insights: InsightItem[] } };
        const apiItems = normalizeApiInsightItems(json?.data?.insights ?? []);
        const items = apiItems.length > 0 ? apiItems : localItems;
        setAnuncioInsights(items);
        setAnuncioInsightsRowId(rowId);
      } catch {
        if (localItems.length > 0) {
          setAnuncioInsights(localItems);
          setAnuncioInsightsRowId(rowId);
        }
      }
    })();
  }, [
    activeSheetKey,
    activeSheetPrimaryKey,
    payloadMatchesActiveSheet,
    payloadRows,
    requestAuth,
    selectedRows
  ]);

  const activeAnuncioInsight = useMemo(() => {
    if (activeSheetKey !== "anuncios" || !lastClickedRowId || !payloadMatchesActiveSheet) return null as string | null;
    const row = payloadRows.find(
      (entry) => String(entry[activeSheetPrimaryKey] ?? "") === lastClickedRowId
    ) as Record<string, unknown> | undefined;
    if (!row) return null;
    return buildActiveInsightSummary(row, { formatCurrency: currencyFormatter.format.bind(currencyFormatter), normalizeNum });
  }, [
    activeSheetKey,
    activeSheetPrimaryKey,
    currencyFormatter,
    lastClickedRowId,
    normalizeNum,
    payloadMatchesActiveSheet,
    payloadRows
  ]);

  const anuncioInsightHeaderTargetRowId = useMemo(() => {
    if (activeSheetKey !== "anuncios") return null as string | null;
    if (selectedRows.size === 1) return Array.from(selectedRows)[0] ?? null;
    return lastClickedRowId ?? editingRowId ?? null;
  }, [activeSheetKey, editingRowId, lastClickedRowId, selectedRows]);

  return {
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
  };
}
