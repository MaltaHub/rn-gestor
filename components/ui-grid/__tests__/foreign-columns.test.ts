import { describe, expect, it } from "vitest";

import {
  findForeignPaths,
  foreignColumnShortLabel,
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
  ],
  notas_fiscais: [
    { id: "n1", carro_id: "c1", tipo: "ENTRADA", numero: "100", created_at: "2026-01-01" },
    { id: "n2", carro_id: "c1", tipo: "SAIDA", numero: "200", created_at: "2026-02-01" },
    { id: "n3", carro_id: "c1", tipo: "ENTRADA", numero: "101", created_at: "2026-03-01" }
  ],
  documentos: [{ carro_id: "c1", estado_transferencia: "VIRADO", created_at: "2026-01-01" }]
};
const getRows = (table: SheetKey) => tables[table] ?? null;
const primaryKeyOf = (table: SheetKey) => (table === "documentos" ? "carro_id" : "id");

const documentos = [
  { carro_id: "c1", envelope: "ABERTO" },
  { carro_id: "c2", envelope: "FECHADO" },
  { carro_id: null, envelope: "BRANCO" }
];

describe("colunas estrangeiras — caminho direto (N:1)", () => {
  it("reconhece e valida o caminho a partir de uma FK do sheet", () => {
    expect(isForeignColumnKey("carro_id>chassi")).toBe(true);
    expect(isForeignColumnKey("chassi")).toBe(false);
    expect(parseForeignColumn("documentos", "carro_id>modelo_id>modelo")?.displayTable).toBe("modelos");
    expect(parseForeignColumn("documentos", "envelope>x")).toBeNull();
    expect(parseForeignColumn("documentos", "carro_id>placa>x")).toBeNull();
  });

  it("descarta inválidas, repetidas e as que colidem com colunas reais", () => {
    const columns = validForeignColumns("documentos", ["carro_id>chassi", "carro_id > chassi", "x>y", "envelope"], ["carro_id", "envelope"]);
    expect(columns.map((column) => column.key)).toEqual(["carro_id>chassi"]);
  });

  it("materializa o valor em cada linha (1 e N saltos)", () => {
    const columns = validForeignColumns("documentos", ["carro_id>chassi", "carro_id>modelo_id>modelo"], []);
    const rows = materializeForeignColumns(documentos, columns, getRows);
    expect(rows.map((row) => [row["carro_id>chassi"], row["carro_id>modelo_id>modelo"]])).toEqual([
      ["9BWAAA", "ONIX"],
      [null, "HB20"],
      [null, null]
    ]);
    expect("carro_id>chassi" in documentos[0]).toBe(false);
  });

  it("sem tabela do caminho em cache, a coluna fica vazia (não inventa valor)", () => {
    const columns = validForeignColumns("documentos", ["carro_id>modelo_id>modelo"], []);
    const rows = materializeForeignColumns(documentos, columns, (table) => (table === "modelos" ? null : getRows(table)));
    expect(rows[0]["carro_id>modelo_id>modelo"]).toBeNull();
  });

  it("escrita vai para a linha de DESTINO, seguindo os saltos", () => {
    const [chassi, modelo] = validForeignColumns("documentos", ["carro_id>chassi", "carro_id>modelo_id>modelo"], []);
    expect(resolveForeignWriteTarget(chassi, documentos[0], getRows, primaryKeyOf)).toEqual({ table: "carros", keyColumn: "id", id: "c1", column: "chassi" });
    expect(resolveForeignWriteTarget(modelo, documentos[1], getRows, primaryKeyOf)).toEqual({ table: "modelos", keyColumn: "id", id: "m2", column: "modelo" });
    expect(resolveForeignWriteTarget(chassi, documentos[2], getRows, primaryKeyOf)).toBeNull();
  });

  it("estado_venda de carros não se edita por coluna estrangeira (tem fluxo de venda)", () => {
    const [estado, chassi] = validForeignColumns("documentos", ["carro_id>estado_venda", "carro_id>chassi"], []);
    expect(isForeignColumnReadOnly(estado)).toBe(true);
    expect(isForeignColumnReadOnly(chassi)).toBe(false);
  });
});

describe("colunas estrangeiras — caminho inverso (1:N) de qualquer tabela", () => {
  const carros = tables.carros ?? [];

  it("traz a última, a primeira, a lista ou a quantidade, com filtro opcional", () => {
    const keys = [
      "<notas_fiscais.carro_id[tipo=ENTRADA]>numero|ultimo",
      "<notas_fiscais.carro_id[tipo=ENTRADA]>numero|primeiro",
      "<notas_fiscais.carro_id>numero|lista",
      "<notas_fiscais.carro_id>numero|contagem"
    ];
    const columns = validForeignColumns("carros", keys, []);
    expect(columns).toHaveLength(4);
    const [row] = materializeForeignColumns(carros, columns, getRows);
    expect(keys.map((key) => row[key])).toEqual(["101", "100", "100, 200, 101", 3]);
    expect(foreignColumnShortLabel(columns[0])).toBe("notas_fiscais.numero · ENTRADA (último)");
  });

  it("caminho misto: documentos -> carros <- notas_fiscais", () => {
    const [column] = validForeignColumns("documentos", ["carro_id><notas_fiscais.carro_id[tipo=SAIDA]>numero|ultimo"], []);
    expect(column.tables).toEqual(["carros", "notas_fiscais"]);
    expect(materializeForeignColumns(documentos, [column], getRows)[0][column.key]).toBe("200");
  });

  it("inverso escreve na linha escolhida (último/primeiro) pelo PK; lista/quantidade são só leitura", () => {
    const [ultima, lista] = validForeignColumns("carros", ["<notas_fiscais.carro_id[tipo=ENTRADA]>numero|ultimo", "<notas_fiscais.carro_id>numero|lista"], []);
    expect(resolveForeignWriteTarget(ultima, carros[0], getRows, primaryKeyOf)).toEqual({ table: "notas_fiscais", keyColumn: "id", id: "n3", column: "numero" });
    expect(isForeignColumnReadOnly(lista)).toBe(true);
    const [situacao] = validForeignColumns("carros", ["<documentos.carro_id>estado_transferencia"], []);
    expect(resolveForeignWriteTarget(situacao, carros[0], getRows, primaryKeyOf)).toEqual({
      table: "documentos",
      keyColumn: "carro_id",
      id: "c1",
      column: "estado_transferencia"
    });
  });

  it("acha os caminhos mais curtos nos dois sentidos", () => {
    const paths = findForeignPaths({ from: "documentos", to: "notas_fiscais", readable: () => true });
    expect(paths.map((path) => path.segments.join(">"))).toContain("carro_id><notas_fiscais.carro_id");
    const direct = findForeignPaths({ from: "documentos", to: "carros", readable: () => true });
    expect(direct[0]).toMatchObject({ segments: ["carro_id"], multi: false });
    expect(findForeignPaths({ from: "documentos", to: "notas_fiscais", readable: (table) => table !== "carros" })).toEqual([]);
  });

  it("plano da escrita avançada agrupa por tabela e aponta linhas sem vínculo", () => {
    const columns = validForeignColumns("documentos", ["carro_id>chassi", "carro_id>modelo_id>modelo"], []);
    const plan = planForeignWrites({
      columns,
      getRows,
      primaryKeyOf,
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
});
