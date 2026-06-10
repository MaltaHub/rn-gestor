/** Margens de pagina do documento (editor + impressao). */
export type MarginKey = "estreita" | "normal" | "larga";

export const MARGINS: Record<MarginKey, { mm: number; label: string }> = {
  estreita: { mm: 10, label: "Estreita" },
  normal: { mm: 18, label: "Normal" },
  larga: { mm: 28, label: "Larga" }
};

export function asMarginKey(value: unknown): MarginKey {
  return value === "estreita" || value === "larga" ? value : "normal";
}
