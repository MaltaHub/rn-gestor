import type { PlaygroundPreferences } from "@/components/playground/types";

export const PLAYGROUND_WORKBOOK_VERSION = 2;
export const PLAYGROUND_MIN_ZOOM = 0.4;
export const PLAYGROUND_MAX_ZOOM = 2.5;

export const DEFAULT_PLAYGROUND_PREFERENCES: PlaygroundPreferences = {
  showGridLines: true,
  printMargin: "compact",
  zoom: 1
};

function clampZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(PLAYGROUND_MAX_ZOOM, Math.max(PLAYGROUND_MIN_ZOOM, value));
}

export function normalizePlaygroundPreferences(value: Partial<PlaygroundPreferences> | null | undefined): PlaygroundPreferences {
  return {
    showGridLines: value?.showGridLines !== false,
    printMargin: "compact",
    zoom: clampZoom(value?.zoom)
  };
}

