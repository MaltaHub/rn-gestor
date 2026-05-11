import { useCallback, useEffect, useRef, type UIEvent } from "react";
import type { SheetKey, StoredGridScroll } from "@/components/ui-grid/types";
import {
  clampGridScrollToNode,
  normalizeStoredGridScroll,
  persistGridScrollState
} from "@/components/ui-grid/hooks/useGridStoredState";

type UseGridScrollSyncParams = {
  activeSheetKey: SheetKey;
  isActiveSheetStateHydrated: boolean;
  rowCount: number;
  showGridPanel: boolean;
  tablePixelWidth: number;
};

export function useGridScrollSync({
  activeSheetKey,
  isActiveSheetStateHydrated,
  rowCount,
  showGridPanel,
  tablePixelWidth
}: UseGridScrollSyncParams) {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridScrollRestoreRef = useRef<StoredGridScroll>({ left: 0, top: 0 });
  const gridScrollRestoringRef = useRef(false);
  const gridScrollWriteFrameRef = useRef<number | null>(null);

  const prepareGridScrollRestore = useCallback((storedScroll: Partial<StoredGridScroll> | null | undefined) => {
    gridScrollRestoreRef.current = normalizeStoredGridScroll(storedScroll);
    gridScrollRestoringRef.current = true;
  }, []);

  const handleGridScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!isActiveSheetStateHydrated) return;
      if (gridScrollRestoringRef.current) return;

      const next = normalizeStoredGridScroll({
        left: event.currentTarget.scrollLeft,
        top: event.currentTarget.scrollTop
      });

      gridScrollRestoreRef.current = next;

      if (gridScrollWriteFrameRef.current != null) {
        window.cancelAnimationFrame(gridScrollWriteFrameRef.current);
      }

      gridScrollWriteFrameRef.current = window.requestAnimationFrame(() => {
        persistGridScrollState(activeSheetKey, next);
        gridScrollWriteFrameRef.current = null;
      });
    },
    [activeSheetKey, isActiveSheetStateHydrated]
  );

  useEffect(() => {
    return () => {
      if (gridScrollWriteFrameRef.current != null) {
        window.cancelAnimationFrame(gridScrollWriteFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showGridPanel || !isActiveSheetStateHydrated) return;

    const node = gridRef.current;
    if (!node) return;

    const desiredScroll = normalizeStoredGridScroll(gridScrollRestoreRef.current);
    let frame = 0;
    let attempts = 0;

    const restoreScroll = () => {
      attempts += 1;
      const clampedScroll = clampGridScrollToNode(node, desiredScroll);
      const nextLeft = clampedScroll.left;
      const nextTop = clampedScroll.top;

      if (Math.abs(node.scrollLeft - nextLeft) > 1) {
        node.scrollLeft = nextLeft;
      }

      if (Math.abs(node.scrollTop - nextTop) > 1) {
        node.scrollTop = nextTop;
      }

      const needsRetry =
        attempts < 60 && (Math.abs(node.scrollLeft - desiredScroll.left) > 1 || Math.abs(node.scrollTop - desiredScroll.top) > 1);

      if (needsRetry) {
        frame = window.requestAnimationFrame(restoreScroll);
        return;
      }

      gridScrollRestoringRef.current = false;
    };

    frame = window.requestAnimationFrame(restoreScroll);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeSheetKey, isActiveSheetStateHydrated, rowCount, showGridPanel, tablePixelWidth]);

  return {
    gridRef,
    handleGridScroll,
    prepareGridScrollRestore
  };
}
