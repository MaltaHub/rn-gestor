import type { PlaygroundPreferences, PlaygroundPrintTemplate } from "@/components/playground/types";

export const PLAYGROUND_WORKBOOK_VERSION = 2;
export const PLAYGROUND_MIN_ZOOM = 0.4;
export const PLAYGROUND_MAX_ZOOM = 2.5;

export const DEFAULT_PLAYGROUND_PREFERENCES: PlaygroundPreferences = {
  showGridLines: true,
  stripedRows: false,
  printMargin: "compact",
  zoom: 1,
  printTemplates: []
};

function clampZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(PLAYGROUND_MAX_ZOOM, Math.max(PLAYGROUND_MIN_ZOOM, value));
}

function normalizePrintTemplates(value: unknown): PlaygroundPrintTemplate[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id : null;
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : null;
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        showGridLines: entry.showGridLines !== false,
        showSheetIndexes: entry.showSheetIndexes === true,
        stripedRows: entry.stripedRows === true
      }
    ];
  });
}

export function normalizePlaygroundPreferences(value: Partial<PlaygroundPreferences> | null | undefined): PlaygroundPreferences {
  return {
    showGridLines: value?.showGridLines !== false,
    stripedRows: value?.stripedRows === true,
    printMargin: "compact",
    zoom: clampZoom(value?.zoom),
    printTemplates: normalizePrintTemplates(value?.printTemplates)
  };
}

