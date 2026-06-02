import type { PlaygroundCellStyle } from "@/components/playground/types";

export const PLAYGROUND_STYLE_SWATCHES = [
  "#ffffff",
  "#fff3a6",
  "#dbeafe",
  "#dcfce7",
  "#fee2e2",
  "#f3e8ff",
  "#e0f2fe",
  "#f8fafc"
] as const;

export const PLAYGROUND_TEXT_SWATCHES = ["#0f172a", "#1d4ed8", "#166534", "#991b1b", "#6d28d9", "#475569"] as const;

export function sanitizeStyleColor(value: string | null | undefined, fallback?: string) {
  const normalized = String(value ?? "").trim();

  if (/^#[\da-f]{6}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (/^#[\da-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .slice(1)
      .toLowerCase()
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }

  return fallback;
}

export function normalizeCellStyle(style: Partial<PlaygroundCellStyle> | null | undefined): PlaygroundCellStyle | undefined {
  if (!style || typeof style !== "object") return undefined;

  const background = sanitizeStyleColor(style.background);
  const color = sanitizeStyleColor(style.color);
  const bold = style.bold === true;
  const normalized: PlaygroundCellStyle = {};

  if (background) normalized.background = background;
  if (color) normalized.color = color;
  if (bold) normalized.bold = true;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function mergeCellStyle(base: PlaygroundCellStyle | undefined, patch: PlaygroundCellStyle) {
  return normalizeCellStyle({
    ...base,
    ...patch
  });
}

/**
 * Define (ou remove) o estilo de uma coluna num mapa de estilos por coluna,
 * retornando um novo mapa. Estilo vazio/undefined remove a chave. Usado pela
 * formatacao por area dinamica (estilo por coluna de alimentador/fragmento).
 */
export function setColumnStyle(
  styles: Record<string, PlaygroundCellStyle> | undefined,
  column: string,
  style: PlaygroundCellStyle | null | undefined
): Record<string, PlaygroundCellStyle> {
  const next = { ...(styles ?? {}) };
  const normalized = normalizeCellStyle(style ?? undefined);

  if (normalized) {
    next[column] = normalized;
  } else {
    delete next[column];
  }

  return next;
}

/**
 * Estilos efetivos de coluna de um fragmento: herda os do pai e sobrepoe os
 * proprios, espelhando a semantica de `getFeedFragmentDisplayColumnOverrides`.
 */
export function getEffectiveColumnStyles(
  feedColumnStyles: Record<string, PlaygroundCellStyle> | undefined,
  fragmentColumnStyles?: Record<string, PlaygroundCellStyle> | undefined
): Record<string, PlaygroundCellStyle> {
  return {
    ...(feedColumnStyles ?? {}),
    ...(fragmentColumnStyles ?? {})
  };
}

