import type { PlaygroundPreferences } from "@/components/playground/types";

export const PLAYGROUND_WORKBOOK_VERSION = 2;

export const DEFAULT_PLAYGROUND_PREFERENCES: PlaygroundPreferences = {
  showGridLines: true,
  printMargin: "compact"
};

export function normalizePlaygroundPreferences(value: Partial<PlaygroundPreferences> | null | undefined): PlaygroundPreferences {
  return {
    showGridLines: value?.showGridLines !== false,
    printMargin: "compact"
  };
}

