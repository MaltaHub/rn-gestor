/**
 * Testes de guardrails e casos de borda do FlowInterpreter:
 * - maxStackDepth
 * - maxTotalNodeExecutions
 * - ForEach com RowList vazio
 * - ForEach com input nao-rowList
 * - SelectedRowsSource (retorna vazio, usa sheet_key)
 * - castToOutput (tipos e valores de borda)
 */
import { describe, expect, it, vi } from "vitest";
import { FlowInterpreter, MOCK_DATA_SOURCE } from "@/lib/domain/editor-flows/runtime/interpreter";
import type { DynamicOutputSocket, FlowGraph, FlowNode } from "@/components/editor/types";

function pos() { return { x: 0, y: 0 }; }

function graph(nodes: FlowGraph["nodes"], edges: FlowGraph["edges"] = []): FlowGraph {
  return { nodes, edges };
}

function foreachNode(
  id: string,
  body: FlowGraph = { nodes: [], edges: [] }
): FlowNode {
  const dynamicOutputs: DynamicOutputSocket[] = [
    { id: "current_row", label: "Linha atual", kind: "intrinsic", intrinsicKey: "current_row", type: { kind: "Row" } },
    { id: "index",       label: "Indice",      kind: "intrinsic", intrinsicKey: "index",       type: { kind: "Number" } },
    { id: "total",       label: "Total",       kind: "intrinsic", intrinsicKey: "total",       type: { kind: "Number" } },
    { id: "result",      label: "Resultado",   kind: "intrinsic", intrinsicKey: "result",      type: { kind: "RowList" } }
  ];
  return { id, type: "ForEach", position: pos(), config: {}, dynamicOutputs, body };
}

// ---------- maxStackDepth ----------

describe("FlowInterpreter — maxStackDepth", () => {
  /**
   * Cria n niveis de ForEach aninhados. Cada nivel tem um source fake como input.
   * O interpretador vai empilhar um frame por nivel de ForEach + by iteracao.
   * Com maxStackDepth baixo deve estourar.
   */
  function buildNestedForEach(depth: number): FlowGraph {
    // depth = 1: um ForEach com body vazio
    // depth > 1: ForEach cujo body tem outro ForEach recursivamente
    if (depth <= 0) return { nodes: [], edges: [] };

    const srcId = `src${depth}`;
    const feId = `fe${depth}`;

    const innerBody = buildNestedForEach(depth - 1);
    const body: FlowGraph = {
      nodes: [...innerBody.nodes, { id: srcId, type: "BulkSelectSource", position: pos(), config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23" } }],
      edges: innerBody.edges
    };

    const fe = foreachNode(feId, body);
    const outerSrcId = `outerSrc${depth}`;
    const outerSrc: FlowNode = {
      id: outerSrcId,
      type: "BulkSelectSource",
      position: pos(),
      config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23" }
    };

    return {
      nodes: [outerSrc, fe],
      edges: [{ id: `e${depth}`, source: outerSrcId, sourceHandle: "rows", target: feId, targetHandle: "rows" }]
    };
  }

  it("completa sem erro com profundidade abaixo do limite", async () => {
    // 2 niveis de ForEach, maxStackDepth=10: deve completar
    const g = buildNestedForEach(2);
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, { limits: { maxStackDepth: 10 } });
    const result = await interp.run();
    expect(result.status).toBe("completed");
  });

  it("lanca LIMIT_EXCEEDED_STACK quando profundidade excede o limite", async () => {
    // 4 niveis de ForEach, maxStackDepth=2: deve estourar
    const g = buildNestedForEach(4);
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, { limits: { maxStackDepth: 2, maxIterations: 100 } });
    const result = await interp.run();
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("LIMIT_EXCEEDED_STACK");
  });
});

// ---------- maxTotalNodeExecutions ----------

describe("FlowInterpreter — maxTotalNodeExecutions", () => {
  it("lanca LIMIT_EXCEEDED_TOTAL_EXECUTIONS quando execucoes acumuladas excedem o limite", async () => {
    // ForEach com 5 rows, maxTotalNodeExecutions=3: estoura antes de completar
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "A,B,C,D,E" }
        },
        foreachNode("fe")
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    // MOCK_DATA_SOURCE retorna rows para tokens conhecidos; override pra retornar 5 rows
    const ds = {
      ...MOCK_DATA_SOURCE,
      matchRowsForBulkSelect: vi.fn().mockResolvedValue([
        { id: "1", placa: "A" },
        { id: "2", placa: "B" },
        { id: "3", placa: "C" },
        { id: "4", placa: "D" },
        { id: "5", placa: "E" }
      ])
    };
    const interp = new FlowInterpreter(g, ds, { limits: { maxTotalNodeExecutions: 3 } });
    const result = await interp.run();
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("LIMIT_EXCEEDED_TOTAL_EXECUTIONS");
  });
});

// ---------- ForEach com RowList vazio ----------

describe("FlowInterpreter — ForEach com RowList vazio", () => {
  it("completa sem iteracoes e emite total=0 e result=[]", async () => {
    // BulkSelectSource sem tokens → emite rowList vazio
    const logNode: FlowNode = { id: "log_total", type: "LogNode", position: pos(), config: { prefix: "TOTAL" } };
    const fe = foreachNode("fe");
    const src: FlowNode = {
      id: "src",
      type: "BulkSelectSource",
      position: pos(),
      config: { sheet_key: "carros", match_column: "placa", tokens: "" }
    };

    const g = graph(
      [src, fe, logNode],
      [
        { id: "e1", source: "src",   sourceHandle: "rows",  target: "fe",        targetHandle: "rows"  },
        { id: "e2", source: "fe",    sourceHandle: "total", target: "log_total",  targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    // total deve ser 0
    const totalLog = result.logs.find((l) => l.message.includes("TOTAL"));
    expect(totalLog?.message).toBe("[TOTAL] 0");
  });
});

// ---------- ForEach com input nao-rowList ----------

describe("FlowInterpreter — ForEach input invalido", () => {
  it("trata input nao-rowList como zero iteracoes (emite outputs vazios)", async () => {
    // ConstantNode emite string, conectado como rows do ForEach
    const log: FlowNode = { id: "log", type: "LogNode", position: pos(), config: { prefix: "TOTAL" } };
    const fe = foreachNode("fe");
    const cst: FlowNode = { id: "cst", type: "ConstantNode", position: pos(), config: { value: "nao-e-lista" } };

    const g = graph(
      [cst, fe, log],
      [
        { id: "e1", source: "cst", sourceHandle: "value", target: "fe",  targetHandle: "rows"  },
        { id: "e2", source: "fe",  sourceHandle: "total", target: "log", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs.find((l) => l.message.includes("TOTAL"))?.message).toBe("[TOTAL] 0");
  });
});

// ---------- SelectedRowsSource ----------

describe("FlowInterpreter — SelectedRowsSource", () => {
  it("retorna rowList vazio quando dataSource.listSelectedRowsForSheet retorna []", async () => {
    const ds = { ...MOCK_DATA_SOURCE, listSelectedRowsForSheet: vi.fn().mockResolvedValue([]) };
    const g = graph(
      [
        { id: "src", type: "SelectedRowsSource", position: pos(), config: { sheet_key: "carros" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "SELECIONADOS" } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, ds);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toContain("0 row(s)");
  });

  it("retorna rowList vazio quando sheet_key nao configurado", async () => {
    const ds = { ...MOCK_DATA_SOURCE, listSelectedRowsForSheet: vi.fn() };
    const g = graph(
      [
        { id: "src", type: "SelectedRowsSource", position: pos(), config: {} },
        { id: "log", type: "LogNode", position: pos(), config: {} }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, ds);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    // sem sheet_key, listSelectedRowsForSheet nao deve ter sido chamado
    expect(ds.listSelectedRowsForSheet).not.toHaveBeenCalled();
  });

  it("retorna rows quando dataSource retorna dados", async () => {
    const mockRows = [{ id: "1", placa: "ABC1A23" }, { id: "2", placa: "DEF2B45" }];
    const ds = { ...MOCK_DATA_SOURCE, listSelectedRowsForSheet: vi.fn().mockResolvedValue(mockRows) };
    const g = graph(
      [
        { id: "src", type: "SelectedRowsSource", position: pos(), config: { sheet_key: "carros" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "SEL" } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, ds);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toContain("2 row(s)");
    expect(result.logs[0]?.message).toContain("em carros");
  });
});

// ---------- castToOutput (via Masterizador literal expressions) ----------
//
// Expressoes SEM ${} sao passadas diretamente a castToOutput sem interpolacao.
// Isso permite testar as regras de casting sem precisar de inputs conectados.

describe("FlowInterpreter — Masterizador castToOutput", () => {
  function literalMaster(expression: string, outputType: string, prefix = "OUT") {
    return graph(
      [
        {
          id: "m",
          type: "Masterizador",
          position: pos(),
          config: {},
          dynamicOutputs: [{ id: "out", kind: "mapper", expression, outputType: outputType as never }]
        },
        { id: "log", type: "LogNode", position: pos(), config: { prefix } }
      ],
      [{ id: "e1", source: "m", sourceHandle: "out", target: "log", targetHandle: "input" }]
    );
  }

  it("cast literal para number: '42' → 42", async () => {
    const result = await new FlowInterpreter(literalMaster("42", "number", "N"), MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("[N] 42");
  });

  it("cast literal para number: string nao-numerica → 0", async () => {
    const result = await new FlowInterpreter(literalMaster("nao-numero", "number", "N"), MOCK_DATA_SOURCE).run();
    expect(result.logs[0]?.message).toBe("[N] 0");
  });

  it("cast literal para string: string qualquer passada diretamente", async () => {
    const result = await new FlowInterpreter(literalMaster("ola mundo", "string", "S"), MOCK_DATA_SOURCE).run();
    expect(result.logs[0]?.message).toBe("[S] ola mundo");
  });

  it("cast literal para boolean: 'true' → true", async () => {
    const result = await new FlowInterpreter(literalMaster("true", "boolean", "B"), MOCK_DATA_SOURCE).run();
    expect(result.logs[0]?.message).toBe("[B] true");
  });

  it("cast literal para boolean: 'YES' (case-insensitive) → true", async () => {
    const result = await new FlowInterpreter(literalMaster("YES", "boolean", "B"), MOCK_DATA_SOURCE).run();
    expect(result.logs[0]?.message).toBe("[B] true");
  });

  it("cast literal para boolean: '0' → false ('0' nao e true/1/yes)", async () => {
    const result = await new FlowInterpreter(literalMaster("0", "boolean", "B"), MOCK_DATA_SOURCE).run();
    expect(result.logs[0]?.message).toBe("[B] false");
  });

  it("cast via placeholder ${value}: resolve input e entao cast (edge targetHandle=input)", async () => {
    // targetHandle: "input" e o socket correto do Masterizador
    const g = graph(
      [
        { id: "cst", type: "ConstantNode", position: pos(), config: { value: "YES" } },
        {
          id: "m",
          type: "Masterizador",
          position: pos(),
          config: {},
          dynamicOutputs: [{ id: "out", kind: "mapper", expression: "${value}", outputType: "boolean" as never }]
        },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "B" } }
      ],
      [
        { id: "e1", source: "cst", sourceHandle: "value", target: "m",   targetHandle: "input" },
        { id: "e2", source: "m",   sourceHandle: "out",   target: "log", targetHandle: "input" }
      ]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("[B] true");
  });
});
