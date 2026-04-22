import { useState } from "react";
import type { FrontGridMatchMode } from "@/components/ui-grid/front-grid";
import type { GridFilters, SortRule } from "@/components/ui-grid/types";

export function useGridFiltersAndSort() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [matchMode, setMatchMode] = useState<FrontGridMatchMode>("contains");
  const [filters, setFilters] = useState<GridFilters>({});
  const [sortChain, setSortChain] = useState<SortRule[]>([]);

  return {
    queryInput,
    setQueryInput,
    query,
    setQuery,
    matchMode,
    setMatchMode,
    filters,
    setFilters,
    sortChain,
    setSortChain
  };
}
