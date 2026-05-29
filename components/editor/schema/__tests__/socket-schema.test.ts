import { describe, expect, it } from "vitest";
import { inferGraphSchemas } from "@/components/editor/schema/socket-schema";
import type { FlowGraph } from "@/components/editor/types";

function makeGraph(partial: Partial<FlowGraph>): FlowGraph {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...partial
  };
}

describe("inferGraphSchemas", () => {
  it("Source AllRowsSource: rows ganha schema das colunas da sheet", () => {
    const graph = makeGraph({
      nodes: [
        {
          id: "src1",
          type: "AllRowsSource",
          position: { x: 0, y: 0 },
          config: { sheet_key: "carros" }
        }
      ]
    });
    const env = inferGraphSchemas(graph);
    const rowsSchema = env.bySocket.get("src1:rows");
    expect(rowsSchema).toBeDefined();
    expect(rowsSchema?.primarySheet).toBe("carros");
    const names = rowsSchema?.fields.map((f) => f.name) ?? [];
    expect(names).toContain("placa");
    expect(names).toContain("ano_fab");
    const placa = rowsSchema?.fields.find((f) => f.name === "placa");
    expect(placa?.type).toBe("string");
    expect(placa?.origin).toBe("sheet");
  });

  it("Source -> Filter: schema preservado no resultado", () => {
    const graph = makeGraph({
      nodes: [
        {
          id: "src1",
          type: "AllRowsSource",
          position: { x: 0, y: 0 },
          config: { sheet_key: "carros" }
        },
        {
          id: "flt1",
          type: "Filter",
          position: { x: 100, y: 0 },
          config: { column: "placa" }
        }
      ],
      edges: [
        {
          id: "e1",
          source: "src1",
          sourceHandle: "rows",
          target: "flt1",
          targetHandle: "input"
        }
      ]
    });
    const env = inferGraphSchemas(graph);
    const filtered = env.bySocket.get("flt1:result");
    expect(filtered?.primarySheet).toBe("carros");
    expect(filtered?.fields.some((f) => f.name === "placa")).toBe(true);
  });

  it("ColumnPick: reduz schema pra apenas a coluna escolhida", () => {
    const graph = makeGraph({
      nodes: [
        {
          id: "src1",
          type: "AllRowsSource",
          position: { x: 0, y: 0 },
          config: { sheet_key: "carros" }
        },
        {
          id: "pick1",
          type: "ColumnPick",
          position: { x: 200, y: 0 },
          config: { column: "placa" }
        }
      ],
      edges: [
        {
          id: "e1",
          source: "src1",
          sourceHandle: "rows",
          target: "pick1",
          targetHandle: "row"
        }
      ]
    });
    const env = inferGraphSchemas(graph);
    const out = env.bySocket.get("pick1:value");
    expect(out?.fields).toHaveLength(1);
    expect(out?.fields[0].name).toBe("placa");
    expect(out?.fields[0].type).toBe("string");
  });

  it("ForEach com dynamicOutputs column: schema da coluna", () => {
    const graph = makeGraph({
      nodes: [
        {
          id: "src1",
          type: "AllRowsSource",
          position: { x: 0, y: 0 },
          config: { sheet_key: "carros" }
        },
        {
          id: "fe1",
          type: "ForEach",
          position: { x: 200, y: 0 },
          config: {},
          dynamicOutputs: [
            {
              id: "col_placa",
              label: "placa",
              kind: "column",
              fieldName: "placa",
              type: { kind: "String" }
            },
            {
              id: "intrinsic_index",
              label: "Indice",
              kind: "intrinsic",
              intrinsicKey: "index",
              type: { kind: "Number" }
            }
          ]
        }
      ],
      edges: [
        {
          id: "e1",
          source: "src1",
          sourceHandle: "rows",
          target: "fe1",
          targetHandle: "rows"
        }
      ]
    });
    const env = inferGraphSchemas(graph);
    const colPlaca = env.bySocket.get("fe1:col_placa");
    expect(colPlaca?.fields).toHaveLength(1);
    expect(colPlaca?.fields[0].name).toBe("placa");
    expect(colPlaca?.fields[0].type).toBe("string");

    const intrinsicIndex = env.bySocket.get("fe1:intrinsic_index");
    expect(intrinsicIndex?.fields[0].origin).toBe("intrinsic");
    expect(intrinsicIndex?.fields[0].type).toBe("number");
  });

  it("byInput: schema acessivel pelo node consumidor", () => {
    const graph = makeGraph({
      nodes: [
        {
          id: "src1",
          type: "AllRowsSource",
          position: { x: 0, y: 0 },
          config: { sheet_key: "vendas" }
        },
        {
          id: "flt1",
          type: "Filter",
          position: { x: 100, y: 0 },
          config: { column: "estado_venda" }
        }
      ],
      edges: [
        {
          id: "e1",
          source: "src1",
          sourceHandle: "rows",
          target: "flt1",
          targetHandle: "input"
        }
      ]
    });
    const env = inferGraphSchemas(graph);
    const inputSchema = env.byInput.get("flt1:input");
    expect(inputSchema?.primarySheet).toBe("vendas");
    expect(inputSchema?.fields.some((f) => f.name === "estado_venda")).toBe(true);
  });

  it("ciclo: nao crasha, schemas ficam parcialmente vazios", () => {
    const graph = makeGraph({
      nodes: [
        { id: "a", type: "Filter", position: { x: 0, y: 0 }, config: {} },
        { id: "b", type: "Filter", position: { x: 100, y: 0 }, config: {} }
      ],
      edges: [
        { id: "e1", source: "a", sourceHandle: "result", target: "b", targetHandle: "input" },
        { id: "e2", source: "b", sourceHandle: "result", target: "a", targetHandle: "input" }
      ]
    });
    expect(() => inferGraphSchemas(graph)).not.toThrow();
    const env = inferGraphSchemas(graph);
    // Ambos os Filters tem schema vazio (ciclo nao deixa topoSort visitar).
    expect(env.bySocket.get("a:result")?.fields ?? []).toEqual([]);
    expect(env.bySocket.get("b:result")?.fields ?? []).toEqual([]);
  });

  it("grafo vazio: env vazio sem crashar", () => {
    const env = inferGraphSchemas(makeGraph({}));
    expect(env.bySocket.size).toBe(0);
    expect(env.byEdge.size).toBe(0);
    expect(env.byInput.size).toBe(0);
  });

  it("frameSchemaByNode: nodes dentro do ForEach veem schema da row iterada", () => {
    // Cenario: Source(carros) -> ForEach -> col_id -> Log
    // O Log recebe Value (col_id), mas frameSchemaByNode deve expor TODOS os
    // fields de carros pra que ${id}, ${placa} etc. apareçam como chips.
    const graph = makeGraph({
      nodes: [
        { id: "src", type: "AllRowsSource", position: { x: 0, y: 0 }, config: { sheet_key: "carros" } },
        {
          id: "fe",
          type: "ForEach",
          position: { x: 100, y: 0 },
          config: {},
          dynamicOutputs: [
            { id: "col_id", label: "id", kind: "column", fieldName: "id", type: { kind: "String" } }
          ]
        },
        { id: "log", type: "LogNode", position: { x: 200, y: 0 }, config: {} }
      ],
      edges: [
        { id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" },
        { id: "e2", source: "fe", sourceHandle: "col_id", target: "log", targetHandle: "input" }
      ]
    });
    const env = inferGraphSchemas(graph);
    // Input do Log e Value de 1 field (col_id).
    expect(env.byInput.get("log:input")?.fields).toHaveLength(1);
    // Mas frameSchema do Log expoe TODOS os campos de carros (placa, cor, ...).
    const frame = env.frameSchemaByNode.get("log");
    expect(frame).toBeDefined();
    expect(frame?.fields.length).toBeGreaterThan(10);
    expect(frame?.fields.some((f) => f.name === "placa")).toBe(true);
    expect(frame?.fields.some((f) => f.name === "cor")).toBe(true);
    expect(frame?.fields.some((f) => f.name === "ano_mod")).toBe(true);
  });

  it("frameSchemaByNode: vazio fora de ForEach", () => {
    const graph = makeGraph({
      nodes: [
        { id: "c", type: "ConstantNode", position: { x: 0, y: 0 }, config: {} },
        { id: "log", type: "LogNode", position: { x: 100, y: 0 }, config: {} }
      ],
      edges: [{ id: "e1", source: "c", sourceHandle: "value", target: "log", targetHandle: "input" }]
    });
    const env = inferGraphSchemas(graph);
    expect(env.frameSchemaByNode.has("log")).toBe(false);
  });

  it("schema propaga atraves de ForEach.dynamic(current_row) ate Log downstream", () => {
    // Reproduz o flow real: AllRowsSource(carros) -> ForEach -> Log,
    // com ForEach expondo current_row via "+". O TemplateField do Log deveria
    // ver os fields de carros como chips clicaveis (placa, id, ...).
    const graph = makeGraph({
      nodes: [
        { id: "src", type: "AllRowsSource", position: { x: 0, y: 0 }, config: { sheet_key: "carros" } },
        {
          id: "fe",
          type: "ForEach",
          position: { x: 100, y: 0 },
          config: {},
          dynamicOutputs: [
            {
              id: "intrinsic_current_row",
              label: "Linha atual",
              kind: "intrinsic",
              intrinsicKey: "current_row",
              type: { kind: "Row" }
            }
          ]
        },
        { id: "log", type: "LogNode", position: { x: 200, y: 0 }, config: {} }
      ],
      edges: [
        { id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" },
        {
          id: "e2",
          source: "fe",
          sourceHandle: "intrinsic_current_row",
          target: "log",
          targetHandle: "input"
        }
      ]
    });
    const env = inferGraphSchemas(graph);
    const logInput = env.byInput.get("log:input");
    expect(logInput).toBeDefined();
    expect(logInput?.fields.length).toBeGreaterThan(5);
    expect(logInput?.fields.some((f) => f.name === "id")).toBe(true);
    expect(logInput?.fields.some((f) => f.name === "placa")).toBe(true);
    expect(logInput?.fields.some((f) => f.name === "cor")).toBe(true);
  });
});
