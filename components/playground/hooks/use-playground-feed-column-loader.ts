import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { fetchSheetRows } from "@/components/ui-grid/api";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type LoadTableColumnsOptions = {
  initialize?: boolean;
  selected?: string[];
  labels?: Record<string, string>;
};

type UsePlaygroundFeedColumnLoaderParams = {
  feedTable: SheetKey | "";
  requestAuth: RequestAuth;
  setFeedColumns: Dispatch<SetStateAction<string[]>>;
  setFeedColumnLabels: Dispatch<SetStateAction<Record<string, string>>>;
  buildErrorMessage: (error: unknown) => string;
  onError: (message: string | null) => void;
};

export function usePlaygroundFeedColumnLoader({
  buildErrorMessage,
  feedTable,
  onError,
  requestAuth,
  setFeedColumnLabels,
  setFeedColumns
}: UsePlaygroundFeedColumnLoaderParams) {
  const [tableColumnsByKey, setTableColumnsByKey] = useState<Partial<Record<SheetKey, string[]>>>({});
  const [loadingColumnsFor, setLoadingColumnsFor] = useState<SheetKey | null>(null);

  const activeColumns = useMemo(() => (feedTable ? tableColumnsByKey[feedTable] ?? [] : []), [feedTable, tableColumnsByKey]);

  const applyFeedColumnsFromSource = useCallback(
    (sourceColumns: string[], preferredSelected?: string[], preferredLabels?: Record<string, string>) => {
      const filteredSelected = preferredSelected?.filter((column) => sourceColumns.includes(column)) ?? [];
      const nextSelected =
        filteredSelected.length > 0 ? filteredSelected : sourceColumns.slice(0, Math.min(6, sourceColumns.length));

      setFeedColumns(nextSelected);
      setFeedColumnLabels(
        sourceColumns.reduce<Record<string, string>>((acc, column) => {
          const candidate = preferredLabels?.[column];
          acc[column] = typeof candidate === "string" && candidate.trim() ? candidate : column;
          return acc;
        }, {})
      );
    },
    [setFeedColumnLabels, setFeedColumns]
  );

  const loadTableColumns = useCallback(
    async (table: SheetKey, options?: LoadTableColumnsOptions) => {
      const cached = tableColumnsByKey[table];

      if (cached) {
        if (options?.initialize) {
          applyFeedColumnsFromSource(cached, options.selected, options.labels);
        }
        return cached;
      }

      setLoadingColumnsFor(table);
      onError(null);

      try {
        const payload = await fetchSheetRows({
          table,
          requestAuth,
          page: 1,
          pageSize: 1,
          query: "",
          matchMode: "contains",
          filters: {},
          sort: []
        });

        setTableColumnsByKey((current) => ({
          ...current,
          [table]: payload.header
        }));

        if (options?.initialize) {
          applyFeedColumnsFromSource(payload.header, options.selected, options.labels);
        }

        return payload.header;
      } catch (loadError) {
        onError(buildErrorMessage(loadError));
        return [];
      } finally {
        setLoadingColumnsFor((current) => (current === table ? null : current));
      }
    },
    [applyFeedColumnsFromSource, buildErrorMessage, onError, requestAuth, tableColumnsByKey]
  );

  return {
    activeColumns,
    applyFeedColumnsFromSource,
    loadTableColumns,
    loadingColumnsFor,
    tableColumnsByKey
  };
}
