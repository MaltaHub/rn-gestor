import { useState } from "react";
import { DEFAULT_SHEET } from "@/components/ui-grid/config";
import type { GridInsightsSummaryPayload, GridListPayload, LookupsPayload } from "@/components/ui-grid/types";

const defaultPayload: GridListPayload = {
  table: DEFAULT_SHEET.key,
  label: DEFAULT_SHEET.label,
  header: [],
  rows: [],
  totalRows: 0,
  page: 1,
  pageSize: 25,
  sort: [],
  filters: {}
};

export function useGridDataSource() {
  const [payload, setPayload] = useState<GridListPayload>(defaultPayload);
  const [lookups, setLookups] = useState<LookupsPayload | null>(null);
  const [tableInsightsBySheet, setTableInsightsBySheet] = useState<GridInsightsSummaryPayload["byTable"]>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    payload,
    setPayload,
    lookups,
    setLookups,
    tableInsightsBySheet,
    setTableInsightsBySheet,
    loading,
    setLoading,
    error,
    setError
  };
}
