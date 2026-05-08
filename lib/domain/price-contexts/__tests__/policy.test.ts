import { describe, expect, it } from "vitest";
import {
  PRICE_CONTEXT_TABLE_POLICY,
  isAllowedPriceContextColumn,
  isAllowedPriceContextTable,
  listAllowedPriceContextTables,
  validatePriceContextTarget
} from "@/lib/domain/price-contexts/policy";

describe("price-contexts policy allow-list", () => {
  it("exposes only the auditable price tables", () => {
    expect(listAllowedPriceContextTables().slice().sort()).toEqual(["anuncios", "carros"]);
  });

  it("locks columns to the writers in carros/anuncios services", () => {
    expect(PRICE_CONTEXT_TABLE_POLICY.carros).toEqual(["preco_original"]);
    expect(PRICE_CONTEXT_TABLE_POLICY.anuncios).toEqual(["valor_anuncio"]);
  });

  it("rejects unknown tables", () => {
    expect(isAllowedPriceContextTable("usuarios_acesso")).toBe(false);
    expect(isAllowedPriceContextTable("price_change_contexts")).toBe(false);
    expect(isAllowedPriceContextTable("")).toBe(false);
  });

  it("accepts known tables", () => {
    expect(isAllowedPriceContextTable("carros")).toBe(true);
    expect(isAllowedPriceContextTable("anuncios")).toBe(true);
  });

  it("rejects columns not paired with their table", () => {
    // valor_anuncio belongs to anuncios, not carros
    expect(isAllowedPriceContextColumn("carros", "valor_anuncio")).toBe(false);
    expect(isAllowedPriceContextColumn("anuncios", "preco_original")).toBe(false);
  });

  it("validates a happy-path target", () => {
    const result = validatePriceContextTarget({ table: "carros", column: "preco_original" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toEqual({ table: "carros", column: "preco_original" });
    }
  });

  it("returns TABLE_NOT_ALLOWED for foreign tables", () => {
    const result = validatePriceContextTarget({ table: "usuarios_acesso", column: "email" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("TABLE_NOT_ALLOWED");
    }
  });

  it("returns COLUMN_NOT_ALLOWED for off-list columns", () => {
    const result = validatePriceContextTarget({ table: "carros", column: "placa" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("COLUMN_NOT_ALLOWED");
    }
  });
});
