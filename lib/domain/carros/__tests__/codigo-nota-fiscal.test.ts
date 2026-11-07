import { describe, expect, it } from "vitest";

import {
  codigosNotaFiscalIguais,
  isValidCodigoNotaFiscal,
  normalizeCodigoNotaFiscal
} from "@/lib/domain/carros/codigo-nota-fiscal";

describe("código da nota fiscal", () => {
  it("aceita só o formato alfanumérico_dígitos_ano_dígitos (ex.: O21_1_2026_5890)", () => {
    expect(isValidCodigoNotaFiscal("O21_1_2026_5890")).toBe(true);
    expect(isValidCodigoNotaFiscal("21_1_2026_5890")).toBe(true);
    expect(isValidCodigoNotaFiscal("A2B_1_2026_5890")).toBe(true);
    expect(isValidCodigoNotaFiscal("O21_1_26_5890")).toBe(false);
    expect(isValidCodigoNotaFiscal("O21_X_2026_5890")).toBe(false);
    expect(isValidCodigoNotaFiscal("o21_1_2026_5890")).toBe(false);
  });

  it("normaliza caixa e separadores", () => {
    expect(normalizeCodigoNotaFiscal(" o21_1_2026_5890 ")).toBe("O21_1_2026_5890");
    expect(normalizeCodigoNotaFiscal("O21 1 2026 5890")).toBe("O21_1_2026_5890");
    expect(normalizeCodigoNotaFiscal("O21-1-2026-5890")).toBe("O21_1_2026_5890");
  });

  it("compara ignorando separadores e O/0", () => {
    expect(codigosNotaFiscalIguais("O21_1_2026_5890", "021 1 2026 5890")).toBe(true);
    expect(codigosNotaFiscalIguais("O21_1_2026_5890", "O21_1_2026_5891")).toBe(false);
    expect(codigosNotaFiscalIguais("", "")).toBe(false);
  });
});
