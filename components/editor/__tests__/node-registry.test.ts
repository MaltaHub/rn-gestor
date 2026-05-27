import { describe, expect, it } from "vitest";
import {
  NODE_REGISTRY,
  isSocketCompatible,
  listRegistryByCategory,
  resolveOutputSocketType
} from "@/components/editor/node-registry";

describe("isSocketCompatible", () => {
  it("Value como target aceita qualquer source", () => {
    expect(isSocketCompatible({ kind: "Number" }, { kind: "Value" })).toBe(true);
    expect(isSocketCompatible({ kind: "Boolean" }, { kind: "Value" })).toBe(true);
    expect(isSocketCompatible({ kind: "RowList" }, { kind: "Value" })).toBe(true);
  });

  it("kinds diferentes nao casam (exceto target=Value)", () => {
    expect(isSocketCompatible({ kind: "Number" }, { kind: "Boolean" })).toBe(false);
    expect(isSocketCompatible({ kind: "String" }, { kind: "Number" })).toBe(false);
    expect(isSocketCompatible({ kind: "Boolean" }, { kind: "String" })).toBe(false);
  });

  it("RowList sem sheet em ambos os lados sao compativeis", () => {
    expect(isSocketCompatible({ kind: "RowList" }, { kind: "RowList" })).toBe(true);
  });

  it("RowList tipada satisfaz target untyped", () => {
    expect(
      isSocketCompatible({ kind: "RowList", sheet: "carros" }, { kind: "RowList" })
    ).toBe(true);
  });

  it("RowList untyped NAO satisfaz target tipado", () => {
    expect(
      isSocketCompatible({ kind: "RowList" }, { kind: "RowList", sheet: "carros" })
    ).toBe(false);
  });

  it("RowList<carros> nao casa com RowList<anuncios>", () => {
    expect(
      isSocketCompatible(
        { kind: "RowList", sheet: "carros" },
        { kind: "RowList", sheet: "anuncios" }
      )
    ).toBe(false);
  });

  it("Row<S> segue mesma regra que RowList<S>", () => {
    expect(isSocketCompatible({ kind: "Row", sheet: "carros" }, { kind: "Row" })).toBe(true);
    expect(
      isSocketCompatible({ kind: "Row", sheet: "carros" }, { kind: "Row", sheet: "anuncios" })
    ).toBe(false);
  });
});

describe("resolveOutputSocketType", () => {
  it("preenche sheet de RowList com config.sheet_key quando ausente", () => {
    const result = resolveOutputSocketType({ kind: "RowList" }, { sheet_key: "carros" });
    expect(result).toEqual({ kind: "RowList", sheet: "carros" });
  });

  it("mantem sheet ja preenchida (nao sobrescreve)", () => {
    const result = resolveOutputSocketType(
      { kind: "RowList", sheet: "anuncios" },
      { sheet_key: "carros" }
    );
    expect(result).toEqual({ kind: "RowList", sheet: "anuncios" });
  });

  it("retorna o socket original quando nao e RowList/Row", () => {
    const t = { kind: "Number" } as const;
    expect(resolveOutputSocketType(t, { sheet_key: "carros" })).toBe(t);
  });

  it("retorna untyped quando config.sheet_key e undefined", () => {
    expect(resolveOutputSocketType({ kind: "RowList" }, undefined)).toEqual({ kind: "RowList" });
    expect(resolveOutputSocketType({ kind: "RowList" }, {})).toEqual({ kind: "RowList" });
  });
});

describe("NODE_REGISTRY", () => {
  it("inclui todos os 9 nos do MVP da Fase 3", () => {
    const expected = [
      "ConstantNode",
      "BulkSelectSource",
      "SelectedRowsSource",
      "AllRowsSource",
      "Filter",
      "ColumnPick",
      "Compare",
      "If",
      "LogNode"
    ];
    for (const type of expected) {
      expect(NODE_REGISTRY[type]).toBeDefined();
    }
  });

  it("agrupa em categorias", () => {
    const grouped = listRegistryByCategory();
    expect(grouped.source.length).toBeGreaterThan(0);
    expect(grouped.computation.length).toBeGreaterThan(0);
  });

  it("sources tem sheet_key como configField", () => {
    for (const type of ["BulkSelectSource", "SelectedRowsSource", "AllRowsSource"]) {
      const entry = NODE_REGISTRY[type];
      const hasSheet = entry.configFields.some((field) => field.key === "sheet_key");
      expect(hasSheet, `${type} deveria ter sheet_key`).toBe(true);
    }
  });
});
