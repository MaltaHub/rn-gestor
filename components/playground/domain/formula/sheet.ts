/**
 * Driver de planilha para o motor de formulas: avalia todas as celulas-formula
 * de uma pagina, resolvendo referencias entre formulas com deteccao de ciclo.
 * Mantem o motor (`engine.ts`) puro e sem estado de planilha.
 */
import {
  FormulaError,
  evaluateFormula,
  type FormulaContext,
  type FormulaResult,
  type FormulaScalar
} from "@/components/playground/domain/formula/engine";

export type SheetFormulaParams = {
  /** Mapa "row:col" -> texto da formula (apenas celulas que SAO formula). */
  formulaCells: Record<string, string>;
  /** Valor resolvido de uma celula NAO-formula (alimentador ou literal manual). */
  getRawCellValue: (row: number, col: number) => FormulaScalar;
  /** Valores de uma coluna de alimentador referenciada por `feed.coluna`. */
  getColumnValues: (feedRef: string, column: string) => FormulaScalar[];
};

/**
 * Avalia todas as celulas-formula. Referencias a outras formulas sao resolvidas
 * recursivamente; ciclos retornam `#REF!`. Resultados sao cacheados por celula.
 */
export function evaluateSheetFormulas(params: SheetFormulaParams): Record<string, FormulaResult> {
  const results: Record<string, FormulaResult> = {};
  const cache = new Map<string, FormulaScalar>();
  const visiting = new Set<string>();

  const resolveCell = (row: number, col: number): FormulaScalar => {
    const key = `${row}:${col}`;
    const formula = params.formulaCells[key];
    if (!formula) return params.getRawCellValue(row, col);

    if (cache.has(key)) return cache.get(key) ?? null;
    if (visiting.has(key)) throw new FormulaError("#REF!");

    visiting.add(key);
    try {
      const result = evaluateFormula(formula, ctx);
      if ("error" in result) throw new FormulaError(result.error);
      cache.set(key, result.value);
      return result.value;
    } finally {
      visiting.delete(key);
    }
  };

  const ctx: FormulaContext = {
    getCellValue: resolveCell,
    getColumnValues: params.getColumnValues
  };

  for (const key of Object.keys(params.formulaCells)) {
    const [rowRaw, colRaw] = key.split(":");
    const row = Number(rowRaw);
    const col = Number(colRaw);
    try {
      results[key] = { value: resolveCell(row, col) };
    } catch (error) {
      results[key] = { error: error instanceof FormulaError ? error.code : "#ERRO!" };
    }
  }

  return results;
}

/** Converte um resultado de formula em texto para exibicao na celula. */
export function formatFormulaResult(result: FormulaResult): string {
  if ("error" in result) return result.error;

  const value = result.value;
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "VERDADEIRO" : "FALSO";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "#NUM!";
    if (Number.isInteger(value)) return String(value);
    // Remove ruido de ponto flutuante (ex.: 0.1 + 0.2) sem truncar demais.
    return String(Number(value.toFixed(10)));
  }
  return String(value);
}
