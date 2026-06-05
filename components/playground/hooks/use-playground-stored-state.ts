import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // `actor` e `onHydrate` sao lidos via ref para que a (re)hidratacao dependa
  // SO de `storageKey`. Em modo dev (e em refresh de token) o objeto `actor` e
  // recriado a cada render; se a hidratacao dependesse dele, recarregaria o
  // localStorage a cada render e descartaria mudancas ainda nao persistidas
  // (o save tem debounce), causando "resets" (pagina ativa volta, alimentador
  // oculto reaparece).
  const actorRef = useRef(actor);
  actorRef.current = actor;
  const onHydrateRef = useRef(onHydrate);
  onHydrateRef.current = onHydrate;

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
    const loadedWorkbook = loadPlaygroundWorkbook(actorRef.current);
    const initialPage = loadedWorkbook.pages.find((page) => page.id === loadedWorkbook.activePageId) ?? loadedWorkbook.pages[0] ?? null;

    setWorkbook(loadedWorkbook);
    setHydratedStorageKey(storageKey);
    onHydrateRef.current?.(initialPage, loadedWorkbook);
  }, [storageKey]);

  useEffect(() => {
    if (!workbook || hydratedStorageKey !== storageKey) return;

    const timeoutId = window.setTimeout(() => {
      savePlaygroundWorkbook(actorRef.current, workbook);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [hydratedStorageKey, storageKey, workbook]);

  return {
    workbook,
    setWorkbook,
    activePage,
    updatePageById,
    updateActivePage,
    updateWorkbookPreferences
  };
}
