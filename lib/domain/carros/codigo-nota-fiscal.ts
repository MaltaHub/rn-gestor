/**
 * Código da nota fiscal de entrada do veículo (carros.codigo_nota_fiscal).
 * Sempre no formato O21_1_2026_5890 — alfanumérico _ dígitos _ ano _ dígitos —
 * em CAIXA ALTA e único entre os veículos. Regra única do form, do servidor e do
 * OCR; o banco garante o mesmo formato (constraint) e a unicidade (índice).
 */
export const CODIGO_NOTA_FISCAL_PATTERN = /^[A-Z0-9]+_\d+_\d{4}_\d+$/;
export const CODIGO_NOTA_FISCAL_EXEMPLO = "O21_1_2026_5890";

/** Arruma só o que não é adivinhação: caixa alta e espaço/hífen/ponto/barra viram "_". */
export function normalizeCodigoNotaFiscal(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s.\-/\\]+/g, "_").replace(/_+/g, "_");
}

export function isValidCodigoNotaFiscal(value: string) {
  return CODIGO_NOTA_FISCAL_PATTERN.test(value);
}

/** Mesmo código? Ignora separadores e a confusão O/0 da leitura do OCR. */
export function codigosNotaFiscalIguais(left: string, right: string) {
  const key = (value: string) => normalizeCodigoNotaFiscal(value).replace(/_/g, "").replace(/O/g, "0");
  return key(left) !== "" && key(left) === key(right);
}
