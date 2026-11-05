import { describe, expect, it } from "vitest";

import { buildOcrCatalog, typedValue, type OcrCatalogSourceConfig } from "@/lib/domain/ocr/catalog";
import { isAllowedOcrDestination, resolveOcrDestination } from "@/lib/domain/ocr/destinations";

const configs: OcrCatalogSourceConfig[] = [
  {
    table: "carros",
    label: "Carros",
    primaryKey: "id",
    readableColumns: ["id", "placa", "renavam", "hodometro"],
    editableColumns: ["placa", "renavam", "hodometro", "__missing_data"],
    virtualColumns: [],
    columnTypes: { hodometro: "number" }
  },
  {
    table: "documentos",
    label: "Documentos",
    primaryKey: "carro_id",
    readableColumns: ["carro_id", "estado_transferencia", "data_vistoria"],
    editableColumns: ["carro_id", "estado_transferencia", "data_vistoria"],
    virtualColumns: [],
    columnTypes: { data_vistoria: "date" }
  },
  { table: "modelos", label: "Modelos", primaryKey: "id", readableColumns: ["id", "modelo"], editableColumns: ["modelo"], virtualColumns: [] },
  {
    table: "finalizados",
    label: "Finalizados",
    primaryKey: "id",
    readOnly: true,
    readableColumns: ["carro_id", "x"],
    editableColumns: ["x"],
    virtualColumns: []
  },
  {
    table: "carro_caracteristicas_visuais",
    label: "Vínculo",
    primaryKey: "carro_id",
    readableColumns: ["carro_id", "caracteristica_id"],
    editableColumns: ["caracteristica_id"],
    virtualColumns: []
  }
];

describe("catálogo de destinos", () => {
  const catalog = buildOcrCatalog(configs);

  it("só tabelas graváveis ligadas ao veículo, veículo primeiro", () => {
    expect(catalog.map((table) => table.table)).toEqual(["carros", "documentos"]);
    expect(catalog[1].link).toBe("carro_id");
  });

  it("tira PK, carro_id e colunas internas", () => {
    expect(catalog[0].columns.map((column) => column.column)).toEqual(["placa", "renavam", "hodometro"]);
    expect(catalog[1].columns.map((column) => column.column)).toEqual(["estado_transferencia", "data_vistoria"]);
  });

  it("allow-list: chave fora do catálogo é recusada", () => {
    expect(isAllowedOcrDestination("documentos.estado_transferencia", catalog)).toBe(true);
    expect(isAllowedOcrDestination("modelos.modelo", catalog)).toBe(false);
    expect(isAllowedOcrDestination("usuarios_acesso.role", catalog)).toBe(false);
    expect(isAllowedOcrDestination("check.placa", catalog)).toBe(true);
  });

  it("resolve com regra especial ou pelo tipo da coluna", () => {
    expect(resolveOcrDestination("carros.renavam", catalog).validate("123")).not.toBeNull();
    const data = resolveOcrDestination("documentos.data_vistoria", catalog);
    expect(data.kind).toBe("write");
    expect(data.format("05/11/2026")).toBe("2026-11-05");
    expect(resolveOcrDestination("carros.hodometro", catalog).format("45.000")).toBe(45000);
  });
});

describe("typedValue", () => {
  it("converte número, sim/não e data no formato brasileiro", () => {
    expect(typedValue("number", "1.234,56")).toEqual({ ok: true, value: 1234.56 });
    expect(typedValue("boolean", "Não")).toEqual({ ok: true, value: false });
    expect(typedValue("date", "31/02/2026").ok).toBe(false);
    expect(typedValue("string", "  texto  ")).toEqual({ ok: true, value: "texto" });
  });
});
