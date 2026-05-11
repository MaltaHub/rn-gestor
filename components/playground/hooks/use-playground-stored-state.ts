import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPlaygroundWorkbook, savePlaygroundWorkbook, getPlaygroundStorageKey } from "@/components/playground/storage";
import type { PlaygroundPage, PlaygroundPreferences, PlaygroundWorkbook } from "@/components/playground/types";
import type { CurrentActor } from "@/components/ui-grid/types";

type UsePlaygroundStoredStateParams = {
  actor: CurrentActor;
  onHydrate?: (activePage: PlaygroundPage | null, workbook: PlaygroundWorkbook) => void;
};

export function usePlaygroundStoredState({ actor, onHydrate }: UsePlaygroundStoredStateParams) {
  const storageKey = getPlaygroundStorageKey(actor);
  const [workbook, setWorkbook] = useState<PlaygroundWorkbook | null>(null);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);

  const activePage = useMemo(() => {
    if (!workbook) return null;
    return workbook.pages.find((page) => page.id === workbook.activePageId) ?? workbook.pages[0] ?? null;
  }, [workbook]);

  const updatePageById = useCallback((pageId: string, updater: (page: PlaygroundPage) => PlaygroundPage) => {
    setWorkbook((current) => {
      if (!current) return current;

      const pageIndex = current.pages.findIndex((page) => page.id === pageId);
      if (pageIndex === -1) return current;

      const nextPages = current.pages.slice();
      nextPages[pageIndex] = updater(current.pages[pageIndex]);

      return {
        ...current,
        pages: nextPages
      };
    });
  }, []);

  const updateWorkbookPreferences = useCallback((updater: (preferences: PlaygroundPreferences) => PlaygroundPreferences) => {
    setWorkbook((current) =>
      current
        ? {
            ...current,
            preferences: updater(current.preferences)
          }
        : current
    );
  }, []);

  const updateActivePage = useCallback(
    (updater: (page: PlaygroundPage) => PlaygroundPage) => {
      if (!activePage) return;
      updatePageById(activePage.id, updater);
    },
    [activePage, updatePageById]
  );

  useEffect(() => {
    const loadedWorkbook = loadPlaygroundWorkbook(actor);
    const initialPage = loadedWorkbook.pages.find((page) => page.id === loadedWorkbook.activePageId) ?? loadedWorkbook.pages[0] ?? null;

    setWorkbook(loadedWorkbook);
    setHydratedStorageKey(storageKey);
    onHydrate?.(initialPage, loadedWorkbook);
  }, [actor, onHydrate, storageKey]);

  useEffect(() => {
    if (!workbook || hydratedStorageKey !== storageKey) return;

    const timeoutId = window.setTimeout(() => {
      savePlaygroundWorkbook(actor, workbook);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [actor, hydratedStorageKey, storageKey, workbook]);

  return {
    workbook,
    setWorkbook,
    activePage,
    updatePageById,
    updateActivePage,
    updateWorkbookPreferences
  };
}
