import { describe, expect, it } from "vitest";
import { getSheetSchema, listSheetColumns } from "@/components/editor/schema/sheet-schema";

describe("getSheetSchema", () => {
  it("carros: retorna colunas tipadas com flags locked/editable", () => {
    const schema = getSheetSchema("carros");
    expect(schema).not.toBeNull();
    if (!schema) return;
    expect(schema.sheet).toBe("carros");
    expect(schema.label).toBe("Carros");

    const placa = schema.columns.find((c) => c.name === "placa");
    expect(placa).toBeDefined();
    expect(placa?.type).toBe("string");
    expect(placa?.editable).toBe(true);
    expect(placa?.locked).toBe(false);

    const anoFab = schema.columns.find((c) => c.name === "ano_fab");
    expect(anoFab?.type).toBe("number");

    const emEstoque = schema.columns.find((c) => c.name === "em_estoque");
    expect(emEstoque?.type).toBe("boolean");

    const createdAt = schema.columns.find((c) => c.name === "created_at");
    expect(createdAt?.type).toBe("date");
    expect(createdAt?.locked).toBe(true);
  });

  it("vendas: inclui colunas de financ_/seguro_/troca_", () => {
    const schema = getSheetSchema("vendas");
    expect(schema).not.toBeNull();
    if (!schema) return;
    const financBanco = schema.columns.find((c) => c.name === "financ_banco");
    expect(financBanco?.type).toBe("string");
    const valorTotal = schema.columns.find((c) => c.name === "valor_total");
    expect(valorTotal?.type).toBe("number");
    const dataVenda = schema.columns.find((c) => c.name === "data_venda");
    expect(dataVenda?.type).toBe("date");
  });

  it("modelos: tem id, modelo, codigo_oficial, created_at, updated_at", () => {
    const schema = getSheetSchema("modelos");
    expect(schema).not.toBeNull();
    const names = schema?.columns.map((c) => c.name);
    expect(names).toEqual(["id", "modelo", "codigo_oficial", "created_at", "updated_at"]);
  });

  it("finalizados: inclui valor_venda e finalizado_em", () => {
    const schema = getSheetSchema("finalizados");
    expect(schema?.columns.find((c) => c.name === "valor_venda")?.type).toBe("number");
    expect(schema?.columns.find((c) => c.name === "finalizado_em")?.type).toBe("date");
  });

  it("sheet sem columnTypes declarado cai em 'unknown'", () => {
    const schema = getSheetSchema("anuncios");
    expect(schema).not.toBeNull();
    // anuncios nao foi enriquecido — todas colunas devem ser "unknown".
    const types = new Set(schema?.columns.map((c) => c.type));
    expect(types.has("unknown")).toBe(true);
  });

  it("listSheetColumns: shape simplificado pra dropdowns", () => {
    const cols = listSheetColumns("carros");
    expect(cols.length).toBeGreaterThan(5);
    expect(cols[0]).toHaveProperty("name");
    expect(cols[0]).toHaveProperty("type");
  });

  it("sheet inexistente retorna null", () => {
    // @ts-expect-error tipo de propósito errado
    expect(getSheetSchema("nao_existe")).toBeNull();
  });

  it("formOnlyColumns aparecem no schema (renavam, tem_chave_r, tem_manual em carros)", () => {
    const schema = getSheetSchema("carros");
    const names = schema?.columns.map((c) => c.name) ?? [];
    expect(names).toContain("renavam");
    expect(names).toContain("tem_chave_r");
    expect(names).toContain("tem_manual");
  });
});
