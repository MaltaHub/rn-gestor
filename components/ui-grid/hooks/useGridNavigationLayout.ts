import { useState } from "react";
import type { SecondaryGridState, SplitResizeState } from "@/components/ui-grid/types";

export function useGridNavigationLayout() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showGridPanel, setShowGridPanel] = useState(true);
  const [showFormPanel, setShowFormPanel] = useState(false);
  const [secondaryGrid, setSecondaryGrid] = useState<SecondaryGridState | null>(null);
  const [secondaryGridChooserOpen, setSecondaryGridChooserOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"grid" | "form" | null>(null);
  const [splitRatio, setSplitRatio] = useState(64);
  const [splitResizeState, setSplitResizeState] = useState<SplitResizeState | null>(null);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    showGridPanel,
    setShowGridPanel,
    showFormPanel,
    setShowFormPanel,
    secondaryGrid,
    setSecondaryGrid,
    secondaryGridChooserOpen,
    setSecondaryGridChooserOpen,
    activeRightTab,
    setActiveRightTab,
    splitRatio,
    setSplitRatio,
    splitResizeState,
    setSplitResizeState
  };
}
