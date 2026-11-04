import { useCallback, useEffect, useState } from "react";

import type { ViewMode } from "@/components/files/explorer/explorer-command-bar";
import type { FolderKind } from "@/components/files/explorer/folder-rules";
import type { SortDirection, SortKey } from "@/components/files/explorer/model";

/** Preferência por TIPO de pasta (como o "aplicar a pastas deste tipo" do Windows). */
export type PrefKind = FolderKind | "root" | "search";

type Prefs = {
  views: Record<PrefKind, ViewMode>;
  sorts: Record<PrefKind, { key: SortKey; direction: SortDirection }>;
  navPane: boolean;
  detailsPane: boolean;
};

const STORAGE_KEY = "rn-gestor.files.explorer-prefs.v1";

const DEFAULTS: Prefs = {
  views: { root: "tiles", generic: "details", documents: "details", photos: "large", search: "details" },
  sorts: {
    root: { key: "name", direction: "asc" },
    generic: { key: "name", direction: "asc" },
    documents: { key: "name", direction: "asc" },
    // A ordem manual das fotos é a do catálogo/galeria.
    photos: { key: "order", direction: "asc" },
    search: { key: "name", direction: "asc" }
  },
  navPane: true,
  detailsPane: true
};

function load(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      views: { ...DEFAULTS.views, ...parsed.views },
      sorts: { ...DEFAULTS.sorts, ...parsed.sorts },
      navPane: parsed.navPane ?? DEFAULTS.navPane,
      detailsPane: parsed.detailsPane ?? DEFAULTS.detailsPane
    };
  } catch {
    return DEFAULTS;
  }
}

export function useExplorerPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  // Lido após montar (evita divergência de hidratação com o SSR).
  useEffect(() => setPrefs(load()), []);

  const save = useCallback((next: (current: Prefs) => Prefs) => {
    setPrefs((current) => {
      const value = next(current);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // sem storage: vale só nesta sessão.
      }
      return value;
    });
  }, []);

  return {
    prefs,
    setView: (kind: PrefKind, view: ViewMode) => save((current) => ({ ...current, views: { ...current.views, [kind]: view } })),
    setSort: (kind: PrefKind, key: SortKey, direction: SortDirection) =>
      save((current) => ({ ...current, sorts: { ...current.sorts, [kind]: { key, direction } } })),
    toggleNavPane: () => save((current) => ({ ...current, navPane: !current.navPane })),
    toggleDetailsPane: () => save((current) => ({ ...current, detailsPane: !current.detailsPane })),
    setDetailsPane: (open: boolean) => save((current) => ({ ...current, detailsPane: open }))
  };
}
