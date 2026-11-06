import { describe, expect, it } from "vitest";

import {
  buildForeignLookups,
  foreignColumnLabel,
  isForeignColumnKey,
  isForeignColumnReadOnly,
  materializeForeignColumns,
  parseForeignColumn,
  planForeignWrites,
  resolveForeignWriteTarget,
  validForeignColumns
} from "@/components/ui-grid/core/foreign-columns";
import type { SheetKey } from "@/components/ui-grid/types";

const tables: Partial<Record<SheetKey, Array<Record<string, unknown>>>> = {
  carros: [
    { id: "c1", placa: "ABC1D23", chassi: "9BWAAA", modelo_id: "m1" },
    { id: "c2", placa: "XYZ9K88", chassi: null, modelo_id: "m2" }
  ],
  modelos: [
    { id: "m1", modelo: "ONIX" },
    { id: "m2", modelo: "HB20" }
  ]
};
const getRows = (table: SheetKey) => tables[table] ?? null;

const documentos = [
  { carro_id: "c1", envelope: "ABERTO" },
  { carro_id: "c2", envelope: "FECHADO" },
  { carro_id: null, envelope: "BRANCO" }
];

describe("colunas estrangeiras", () => {
  it("reconhece e valida o caminho a partir de uma FK do sheet", () => {
    expect(isForeignColumnKey("carro_id>chassi")).toBe(true);
    expect(isForeignColumnKey("chassi")).toBe(false);
    expect(parseForeignColumn("documentos", "carro_id>modelo_id>modelo")?.resolved.displayTable).toBe("modelos");
    expect(parseForeignColumn("documentos", "envelope>x")).toBeNull(); // envelope não é FK
    expect(parseForeignColumn("documentos", "carro_id>placa>x")).toBeNull(); // placa não é FK
    expect(foreignColumnLabel("carro_id>modelo_id>modelo")).toBe("carro_id › modelo_id › modelo");
  });

  it("descarta inválidas, repetidas e as que colidem com colunas reais", () => {
    const columns = validForeignColumns("documentos", ["carro_id>chassi", "carro_id > chassi", "x>y", "envelope"], ["carro_id", "envelope"]);
    expect(columns.map((column) => column.key)).toEqual(["carro_id>chassi"]);
  });

  it("materializa o valor em cada linha (1 e N saltos)", () => {
    const columns = validForeignColumns("documentos", ["carro_id>chassi", "carro_id>modelo_id>modelo"], []);
    const rows = materializeForeignColumns(documentos, columns, buildForeignLookups(columns, getRows));
    expect(rows.map((row) => [row["carro_id>chassi"], row["carro_id>modelo_id>modelo"]])).toEqual([
      ["9BWAAA", "ONIX"],
      [null, "HB20"],
      [null, null]
    ]);
    // Linhas originais intactas.
    expect("carro_id>chassi" in documentos[0]).toBe(false);
  });

  it("sem tabela do caminho em cache, a coluna fica vazia (não inventa valor)", () => {
    const columns = validForeignColumns("documentos", ["carro_id>modelo_id>modelo"], []);
    const lookups = buildForeignLookups(columns, (table) => (table === "modelos" ? null : getRows(table)));
    expect(materializeForeignColumns(documentos, columns, lookups)[0]["carro_id>modelo_id>modelo"]).toBeNull();
  });

  it("escrita vai para a linha de DESTINO, seguindo os saltos", () => {
    const [chassi, modelo] = validForeignColumns("documentos", ["carro_id>chassi", "carro_id>modelo_id>modelo"], []);
    expect(resolveForeignWriteTarget(chassi, documentos[0], getRows)).toEqual({ table: "carros", keyColumn: "id", id: "c1", column: "chassi" });
    expect(resolveForeignWriteTarget(modelo, documentos[1], getRows)).toEqual({ table: "modelos", keyColumn: "id", id: "m2", column: "modelo" });
    expect(resolveForeignWriteTarget(chassi, documentos[2], getRows)).toBeNull();
  });

  it("plano da escrita avançada agrupa por tabela e aponta linhas sem vínculo", () => {
    const columns = validForeignColumns("documentos", ["carro_id>chassi", "carro_id>modelo_id>modelo"], []);
    const plan = planForeignWrites({
      columns,
      getRows,
      entries: [
        { index: 0, row: documentos[0], values: { "carro_id>chassi": "9BWNOVO", "carro_id>modelo_id>modelo": "ONIX PLUS" } },
        { index: 1, row: documentos[2], values: { "carro_id>chassi": "X" } },
        { index: 2, row: null, values: { "carro_id>chassi": "Y" } }
      ]
    });
    expect(Array.from(plan.byTable.get("carros")!.rows.values())).toEqual([{ id: "c1", chassi: "9BWNOVO" }]);
    expect(Array.from(plan.byTable.get("modelos")!.rows.values())).toEqual([{ id: "m1", modelo: "ONIX PLUS" }]);
    expect(plan.errors.map((error) => error.index)).toEqual([1, 2]);
  });

  it("estado_venda de carros não se edita por coluna estrangeira (tem fluxo de venda)", () => {
    const [estado, chassi] = validForeignColumns("documentos", ["carro_id>estado_venda", "carro_id>chassi"], []);
    expect(isForeignColumnReadOnly(estado)).toBe(true);
    expect(isForeignColumnReadOnly(chassi)).toBe(false);
  });
});
