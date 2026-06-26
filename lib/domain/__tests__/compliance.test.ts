import { describe, expect, it } from "vitest";
import {
  getMissingImportantFields,
  hasComplianceFields,
  isImportantValueMissing,
  rowHasMissingImportant,
} from "@/lib/domain/compliance";

describe("compliance", () => {
  it("trata null/undefined/'' como faltando; numeros (incl. 0) e booleanos como preenchidos", () => {
    expect(isImportantValueMissing(null)).toBe(true);
    expect(isImportantValueMissing(undefined)).toBe(true);
    expect(isImportantValueMissing("")).toBe(true);
    expect(isImportantValueMissing("  ")).toBe(true);
    expect(isImportantValueMissing(0)).toBe(false);
    expect(isImportantValueMissing(false)).toBe(false);
    expect(isImportantValueMissing("x")).toBe(false);
  });

  it("CARROS: detecta campos importantes ausentes", () => {
    const full = { ano_mod: 2020, chassi: "9BW", renavam: "123", hodometro: 0, preco_original: 50000 };
    expect(rowHasMissingImportant("carros", full)).toBe(false);
    const missing = { ano_mod: 2020, chassi: "", renavam: null, hodometro: 10, preco_original: 1 };
    expect(getMissingImportantFields("carros", missing).sort()).toEqual(["chassi", "renavam"]);
  });

  it("DOCUMENTOS e VENDAS: usam os campos certos", () => {
    expect(getMissingImportantFields("documentos", {})).toEqual([
      "origem",
      "valor_compra",
      "remetente_id",
      "pericia",
      "responsavel_virado",
    ]);
    expect(getMissingImportantFields("vendas", { data_venda: "2026-01-01", valor_total: 1000 }).sort()).toEqual([
      "data_entrega",
      "forma_pagamento",
    ]);
  });

  it("tabelas sem compliance retornam vazio", () => {
    expect(hasComplianceFields("modelos")).toBe(false);
    expect(rowHasMissingImportant("modelos", {})).toBe(false);
  });
});
