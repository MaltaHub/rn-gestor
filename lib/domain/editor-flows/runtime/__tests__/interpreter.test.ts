import { describe, expect, it } from "vitest";
import { FlowInterpreter, MOCK_DATA_SOURCE } from "@/lib/domain/editor-flows/runtime/interpreter";
import type { DynamicOutputSocket, FlowGraph, FlowNode } from "@/components/editor/types";
import type { DataSource } from "@/lib/domain/editor-flows/runtime/types";

function graph(nodes: FlowGraph["nodes"], edges: FlowGraph["edges"] = []): FlowGraph {
  return { nodes, edges };
}

function pos() {
  return { x: 0, y: 0 };
}

/**
 * Helper pra criar um ForEach com os 4 intrinsecos pre-expostos como
 * dynamicOutputs. Os ids casam com os keys antigos (current_row, index, total,
 * result). `body` define o subgrafo que roda por iteracao (substitui edges
 * per-iteration que antes ficavam no graph principal). Sem body, ForEach
 * itera mas nao executa nada (no-op).
 */
function foreachNode(
  id = "fe",
  config: Record<string, unknown> = {},
  body: FlowGraph = { nodes: [], edges: [] }
): FlowNode {
  const dynamicOutputs: DynamicOutputSocket[] = [
    { id: "current_row", label: "Linha atual", kind: "intrinsic", intrinsicKey: "current_row", type: { kind: "Row" } },
    { id: "index", label: "Indice", kind: "intrinsic", intrinsicKey: "index", type: { kind: "Number" } },
    { id: "total", label: "Total", kind: "intrinsic", intrinsicKey: "total", type: { kind: "Number" } },
    { id: "result", label: "Resultado", kind: "intrinsic", intrinsicKey: "result", type: { kind: "RowList" } }
  ];
  return {
    id,
    type: "ForEach",
    position: pos(),
    config,
    dynamicOutputs,
    body
  };
}

/**
 * Helper pra criar um While com body opcional. Sem body, itera enquanto
 * condition for true mas no-op.
 */
function whileNode(
  id = "wh",
  config: Record<string, unknown> = {},
  body: FlowGraph = { nodes: [], edges: [] }
): FlowNode {
  return { id, type: "While", position: pos(), config, body };
}

describe("FlowInterpreter — basico", () => {
  it("Constant -> Log imprime o valor", async () => {
    const g = graph(
      [
        { id: "c1", type: "ConstantNode", position: pos(), config: { value: "ola" } },
        { id: "l1", type: "LogNode", position: pos(), config: { prefix: "T1" } }
      ],
      [{ id: "e1", source: "c1", sourceHandle: "value", target: "l1", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs.map((l) => l.message)).toEqual(["[T1] ola"]);
  });

  it("BulkSelectSource -> Log: emite rowList do mock DataSource", async () => {
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23\nDEF2B45" }
        },
        { id: "log", type: "LogNode", position: pos(), config: {} }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toContain("2 row(s)");
    expect(result.logs[0]?.message).toContain("em carros");
  });

  it("Compare retorna boolean", async () => {
    const g = graph(
      [
        { id: "l", type: "ConstantNode", position: pos(), config: { value: 10 } },
        { id: "r", type: "ConstantNode", position: pos(), config: { value: 5 } },
        { id: "cmp", type: "Compare", position: pos(), config: { operator: "gt" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "CMP" } }
      ],
      [
        { id: "e1", source: "l", sourceHandle: "value", target: "cmp", targetHandle: "left" },
        { id: "e2", source: "r", sourceHandle: "value", target: "cmp", targetHandle: "right" },
        { id: "e3", source: "cmp", sourceHandle: "result", target: "log", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("[CMP] true");
  });
});

describe("FlowInterpreter — ForEach", () => {
  it("itera sobre RowList e log por iteracao", async () => {
    // Apos rewrite: body do ForEach tem pick + log; edges per-iteration vivem
    // em body.edges. Edge cross-scope (fe.current_row -> pick.row) ainda
    // valida — interpreter sobe stack pra achar fe no parent.
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23\nDEF2B45\nGHI3C67" }
        },
        foreachNode("fe", {}, {
          nodes: [
            { id: "pick", type: "ColumnPick", position: pos(), config: { column: "placa" } },
            { id: "log", type: "LogNode", position: pos(), config: { prefix: "ROW" } }
          ],
          edges: [
            { id: "be1", source: "fe", sourceHandle: "current_row", target: "pick", targetHandle: "row" },
            { id: "be2", source: "pick", sourceHandle: "value", target: "log", targetHandle: "input" }
          ]
        })
      ],
      [
        { id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    const placas = result.logs.map((l) => l.message);
    expect(placas).toEqual(["[ROW] ABC1A23", "[ROW] DEF2B45", "[ROW] GHI3C67"]);
  });

  it("respeita guardrail maxIterations", async () => {
    const lotsOfTokens = Array.from({ length: 50 }, (_, i) => `P${i}`).join("\n");
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: lotsOfTokens }
        },
        foreachNode("fe", {}, {
          nodes: [{ id: "log", type: "LogNode", position: pos(), config: {} }],
          edges: [{ id: "be1", source: "fe", sourceHandle: "current_row", target: "log", targetHandle: "input" }]
        })
      ],
      [
        { id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, { maxIterations: 10 });
    const result = await interp.run();
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("LIMIT_EXCEEDED_ITERATIONS");
  });

  it("guardrail maxTotalNodeExecutions tambem dispara", async () => {
    const g = graph(
      [
        { id: "c", type: "ConstantNode", position: pos(), config: { value: 1 } },
        { id: "log", type: "LogNode", position: pos(), config: {} }
      ],
      [{ id: "e", source: "c", sourceHandle: "value", target: "log", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, { maxTotalNodeExecutions: 1 });
    const result = await interp.run();
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("LIMIT_EXCEEDED_TOTAL_EXECUTIONS");
  });

  it("If encaminha valor para then quando condicao verdadeira", async () => {
    const g = graph(
      [
        { id: "cond", type: "ConstantNode", position: pos(), config: { value: "yes" } },
        { id: "valLit", type: "ConstantNode", position: pos(), config: { value: "ANYTHING" } },
        { id: "cmp", type: "Compare", position: pos(), config: { operator: "eq" } },
        { id: "ifn", type: "If", position: pos(), config: {} },
        { id: "logThen", type: "LogNode", position: pos(), config: { prefix: "THEN" } },
        { id: "logElse", type: "LogNode", position: pos(), config: { prefix: "ELSE" } }
      ],
      [
        { id: "e1", source: "cond", sourceHandle: "value", target: "cmp", targetHandle: "left" },
        { id: "e2", source: "cond", sourceHandle: "value", target: "cmp", targetHandle: "right" },
        { id: "e3", source: "cmp", sourceHandle: "result", target: "ifn", targetHandle: "condition" },
        { id: "e4", source: "valLit", sourceHandle: "value", target: "ifn", targetHandle: "value" },
        { id: "e5", source: "ifn", sourceHandle: "then_value", target: "logThen", targetHandle: "input" },
        { id: "e6", source: "ifn", sourceHandle: "else_value", target: "logElse", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs.map((l) => l.message)).toEqual(["[THEN] ANYTHING"]);
  });
});

describe("FlowInterpreter — TAGs (Fase 6)", () => {
  it("pausa quando encontra TagSelecionar nao-aplicada", async () => {
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23\nDEF2B45" }
        },
        { id: "tag", type: "TagSelecionar", position: pos(), config: {} }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "tag", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("paused");
    expect(result.paused?.node_id).toBe("tag");
    expect(result.paused?.tag_type).toBe("TagSelecionar");
    expect(result.paused?.rows_affected).toBe(2);
  });

  it("resume: appliedTags pula a TAG e completa o fluxo", async () => {
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23" }
        },
        { id: "tag", type: "TagSelecionar", position: pos(), config: {} }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "tag", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, {
      appliedTags: [{ node_id: "tag", frame_signature: "" }]
    });
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.paused).toBeUndefined();
  });

  it("ForEach + TAG pausa uma vez por iteracao (a primeira)", async () => {
    // TAG vive dentro do body do ForEach — pausa na iteracao 0.
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23\nDEF2B45\nGHI3C67" }
        },
        foreachNode("fe", {}, {
          nodes: [{ id: "tag", type: "TagOcultar", position: pos(), config: {} }],
          edges: [
            { id: "be1", source: "fe", sourceHandle: "current_row", target: "tag", targetHandle: "rows" }
          ]
        })
      ],
      [
        { id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("paused");
    expect(result.paused?.frame_signature).toMatch(/^fe:fe:0$/);
  });
});

describe("FlowInterpreter — Fase 11", () => {
  it("ForEach expoe socket index correto por iteracao", async () => {
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "A\nB\nC" }
        },
        foreachNode("fe", {}, {
          nodes: [{ id: "log", type: "LogNode", position: pos(), config: { prefix: "I" } }],
          edges: [{ id: "be1", source: "fe", sourceHandle: "index", target: "log", targetHandle: "input" }]
        })
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs.map((l) => l.message)).toEqual(["[I] 0", "[I] 1", "[I] 2"]);
  });

  it("ForEach expoe socket total", async () => {
    // Apos rewrite: log dentro do body roda N=4 vezes. Sem o "extra" log
    // pos-loop (porque o body so existe NO body, nao fora). Comportamento mais
    // limpo que o antigo (que tinha N+1 logs).
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "A\nB\nC\nD" }
        },
        foreachNode("fe", {}, {
          nodes: [{ id: "log", type: "LogNode", position: pos(), config: { prefix: "T" } }],
          edges: [{ id: "be1", source: "fe", sourceHandle: "total", target: "log", targetHandle: "input" }]
        })
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs.every((l) => l.message === "[T] 4")).toBe(true);
    expect(result.logs.length).toBe(4);
  });

  it("Switch roteia para case_0 quando match casa", async () => {
    const g = graph(
      [
        { id: "src", type: "ConstantNode", position: pos(), config: { value: "DISPONIVEL" } },
        {
          id: "sw",
          type: "Switch",
          position: pos(),
          config: { case_0: "NOVO", case_1: "DISPONIVEL", case_2: "VENDIDO" }
        },
        { id: "logNovo", type: "LogNode", position: pos(), config: { prefix: "NOVO" } },
        { id: "logDisp", type: "LogNode", position: pos(), config: { prefix: "DISPONIVEL" } },
        { id: "logVend", type: "LogNode", position: pos(), config: { prefix: "VENDIDO" } },
        { id: "logDef", type: "LogNode", position: pos(), config: { prefix: "DEFAULT" } }
      ],
      [
        { id: "e1", source: "src", sourceHandle: "value", target: "sw", targetHandle: "input" },
        { id: "e2", source: "sw", sourceHandle: "case_0", target: "logNovo", targetHandle: "input" },
        { id: "e3", source: "sw", sourceHandle: "case_1", target: "logDisp", targetHandle: "input" },
        { id: "e4", source: "sw", sourceHandle: "case_2", target: "logVend", targetHandle: "input" },
        { id: "e5", source: "sw", sourceHandle: "default", target: "logDef", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs.map((l) => l.message)).toEqual(["[DISPONIVEL] DISPONIVEL"]);
  });

  it("Switch roteia para default quando nenhum case casa", async () => {
    const g = graph(
      [
        { id: "src", type: "ConstantNode", position: pos(), config: { value: "OUTRO" } },
        {
          id: "sw",
          type: "Switch",
          position: pos(),
          config: { case_0: "NOVO", case_1: "DISPONIVEL" }
        },
        { id: "logDef", type: "LogNode", position: pos(), config: { prefix: "D" } }
      ],
      [
        { id: "e1", source: "src", sourceHandle: "value", target: "sw", targetHandle: "input" },
        { id: "e2", source: "sw", sourceHandle: "default", target: "logDef", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs.map((l) => l.message)).toEqual(["[D] OUTRO"]);
  });

  it("While: itera enquanto condition=true e estoura maxIterations quando preciso", async () => {
    // log dentro do body — roda por iteracao via subgraph.
    const g = graph(
      [
        { id: "c1", type: "ConstantNode", position: pos(), config: { value: 1 } },
        { id: "cmp", type: "Compare", position: pos(), config: { operator: "eq" } },
        whileNode("wh", {}, {
          nodes: [{ id: "log", type: "LogNode", position: pos(), config: { prefix: "W" } }],
          edges: [{ id: "be1", source: "wh", sourceHandle: "iteration", target: "log", targetHandle: "input" }]
        })
      ],
      [
        { id: "e1", source: "c1", sourceHandle: "value", target: "cmp", targetHandle: "left" },
        { id: "e2", source: "c1", sourceHandle: "value", target: "cmp", targetHandle: "right" },
        { id: "e3", source: "cmp", sourceHandle: "result", target: "wh", targetHandle: "condition" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, { maxIterations: 5 });
    const result = await interp.run();
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("LIMIT_EXCEEDED_ITERATIONS");
    expect(result.logs.length).toBeGreaterThanOrEqual(5);
  });

  it("While: termina graciosamente quando condition=false", async () => {
    const g = graph(
      [
        { id: "c1", type: "ConstantNode", position: pos(), config: { value: 1 } },
        { id: "c2", type: "ConstantNode", position: pos(), config: { value: 2 } },
        { id: "cmp", type: "Compare", position: pos(), config: { operator: "eq" } },
        { id: "wh", type: "While", position: pos(), config: {} }
      ],
      [
        { id: "e1", source: "c1", sourceHandle: "value", target: "cmp", targetHandle: "left" },
        { id: "e2", source: "c2", sourceHandle: "value", target: "cmp", targetHandle: "right" },
        { id: "e3", source: "cmp", sourceHandle: "result", target: "wh", targetHandle: "condition" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
  });
});

describe("FlowInterpreter — Fase 9 (TAGs dinamicas)", () => {
  it("requires_human=false + bridge: aplica inline e completa sem pause", async () => {
    const calls: string[] = [];
    const bridge = {
      async applyTagSelecionar() {
        calls.push("Selecionar");
      },
      async applyTagOcultar() {
        calls.push("Ocultar");
      },
      async applyTagMarcarConferencia() {
        calls.push("MarcarConferencia");
      },
      async applyTagDesmarcarConferencia() {
        calls.push("DesmarcarConferencia");
      },
      async applyTagAlteracaoEmMassa() {
        calls.push("AlteracaoEmMassa");
      },
      async applyTagImprimir() {
        calls.push("Imprimir");
      },
      async applyTagExcluir() {
        calls.push("Excluir");
      },
      async applyTagFinalizar() {
        calls.push("Finalizar");
      }
    };
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23" }
        },
        { id: "tag", type: "TagSelecionar", position: pos(), config: { requires_human: false } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "tag", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, { tagBridge: bridge });
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.paused).toBeUndefined();
    expect(calls).toEqual(["Selecionar"]);
  });

  it("requires_human=false sem bridge: simula como aplicada (warn log)", async () => {
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23" }
        },
        { id: "tag", type: "TagSelecionar", position: pos(), config: { requires_human: false } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "tag", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.paused).toBeUndefined();
    const warnEntry = result.logs.find((l) => l.level === "warn");
    expect(warnEntry?.message).toContain("simulada");
  });

  it("requires_human=true (default): comportamento atual de pause", async () => {
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "ABC1A23" }
        },
        { id: "tag", type: "TagSelecionar", position: pos(), config: { requires_human: true } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "tag", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("paused");
    expect(result.paused?.tag_type).toBe("TagSelecionar");
  });
});

describe("FlowInterpreter — Fase 10: variaveis user + system.*", () => {
  it("SetVariable + GetVariable: round-trip dentro da mesma run", async () => {
    const g = graph(
      [
        { id: "c_name", type: "ConstantNode", position: pos(), config: { value: "counter" } },
        { id: "c_val", type: "ConstantNode", position: pos(), config: { value: 42 } },
        { id: "set", type: "SetVariable", position: pos(), config: {} },
        { id: "c_name2", type: "ConstantNode", position: pos(), config: { value: "counter" } },
        { id: "get", type: "GetVariable", position: pos(), config: {} },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "V" } }
      ],
      [
        { id: "e1", source: "c_name", sourceHandle: "value", target: "set", targetHandle: "name" },
        { id: "e2", source: "c_val", sourceHandle: "value", target: "set", targetHandle: "value" },
        // set.value alimenta um sink fake (log) so pra forcar avaliacao do set.
        { id: "e3", source: "set", sourceHandle: "value", target: "log", targetHandle: "input" },
        // get apenas para validar que retorna o valor escrito.
        { id: "e4", source: "c_name2", sourceHandle: "value", target: "get", targetHandle: "name" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    // Log do SetVariable + log do LogNode encadeado.
    const setMsg = result.logs.find((l) => l.message.startsWith("[SetVariable]"));
    expect(setMsg?.message).toContain("counter = 42");
    // getMutatedVariables traz a mutacao.
    const mutated = interp.getMutatedVariables();
    expect(mutated.length).toBe(1);
    expect(mutated[0]?.name).toBe("counter");
    expect(mutated[0]?.value).toEqual({ kind: "number", value: 42 });
  });

  it("SetVariable rejeita prefixo 'system.' com erro INVALID_VALUE", async () => {
    const g = graph(
      [
        { id: "c_name", type: "ConstantNode", position: pos(), config: { value: "system.foo" } },
        { id: "c_val", type: "ConstantNode", position: pos(), config: { value: 1 } },
        { id: "set", type: "SetVariable", position: pos(), config: {} },
        { id: "log", type: "LogNode", position: pos(), config: {} }
      ],
      [
        { id: "e1", source: "c_name", sourceHandle: "value", target: "set", targetHandle: "name" },
        { id: "e2", source: "c_val", sourceHandle: "value", target: "set", targetHandle: "value" },
        { id: "e3", source: "set", sourceHandle: "value", target: "log", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("INVALID_VALUE");
    expect(result.error?.message).toContain("system.");
  });

  it("system.* eh populado via dataSource.getSystemContext() no run()", async () => {
    const customDS: DataSource = {
      ...MOCK_DATA_SOURCE,
      async getSystemContext() {
        return {
          active_sheet: "carros",
          selected_rows: [{ placa: "ABC1A23" }, { placa: "DEF2B45" }],
          hidden_rows: [],
          conference_rows: [],
          user_role: "GERENTE",
          user_id: "uid-1"
        };
      }
    };
    const g = graph(
      [
        { id: "c_name", type: "ConstantNode", position: pos(), config: { value: "system.selected_rows" } },
        { id: "get", type: "GetVariable", position: pos(), config: {} },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "S" } }
      ],
      [
        { id: "e1", source: "c_name", sourceHandle: "value", target: "get", targetHandle: "name" },
        { id: "e2", source: "get", sourceHandle: "value", target: "log", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, customDS);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    // Log exibe "2 row(s) em carros" pra rowList.
    expect(result.logs[0]?.message).toContain("2 row(s)");
    expect(result.logs[0]?.message).toContain("em carros");
  });

  it("system.* sao read-only — SetVariable rejeita mesmo se valor inicial existia", async () => {
    const customDS: DataSource = {
      ...MOCK_DATA_SOURCE,
      async getSystemContext() {
        return {
          active_sheet: "vendas",
          selected_rows: [],
          hidden_rows: [],
          conference_rows: [],
          user_role: "VENDEDOR",
          user_id: "uid-x"
        };
      }
    };
    const g = graph(
      [
        { id: "c_name", type: "ConstantNode", position: pos(), config: { value: "system.user_role" } },
        { id: "c_val", type: "ConstantNode", position: pos(), config: { value: "FAKE" } },
        { id: "set", type: "SetVariable", position: pos(), config: {} },
        { id: "log", type: "LogNode", position: pos(), config: {} }
      ],
      [
        { id: "e1", source: "c_name", sourceHandle: "value", target: "set", targetHandle: "name" },
        { id: "e2", source: "c_val", sourceHandle: "value", target: "set", targetHandle: "value" },
        { id: "e3", source: "set", sourceHandle: "value", target: "log", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, customDS);
    const result = await interp.run();
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("INVALID_VALUE");
  });

  it("getMutatedVariables nao inclui system.* mesmo se Set fosse tentado direto via API interna", async () => {
    // Cenario: variaveis inicializadas via userVariables NAO devem aparecer em getMutatedVariables;
    // apenas as escritas via SetVariable durante a run.
    const g = graph(
      [
        { id: "c_name", type: "ConstantNode", position: pos(), config: { value: "preexistente" } },
        { id: "get", type: "GetVariable", position: pos(), config: {} },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "G" } }
      ],
      [
        { id: "e1", source: "c_name", sourceHandle: "value", target: "get", targetHandle: "name" },
        { id: "e2", source: "get", sourceHandle: "value", target: "log", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE, {
      userVariables: { preexistente: { kind: "string", value: "hello" } }
    });
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("[G] hello");
    // Nao foi SetVariable: dirtyVars vazio.
    expect(interp.getMutatedVariables()).toEqual([]);
  });

  it("ForEach + SetVariable: ultimo write ganha (overwrite por iteracao)", async () => {
    const customDS: DataSource = {
      ...MOCK_DATA_SOURCE,
      async matchRowsForBulkSelect(_sheet, matchColumn, tokens) {
        return tokens.map((t, idx) => ({ [matchColumn]: t, num: idx }));
      }
    };
    // SetVariable + Log dentro do body. c_name pode ficar no parent (fonte
    // estatica) ou no body — escolho parent pra mostrar edge cross-scope.
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "A\nB\nC" }
        },
        { id: "c_name", type: "ConstantNode", position: pos(), config: { value: "last_idx" } },
        foreachNode("fe", {}, {
          nodes: [
            { id: "set", type: "SetVariable", position: pos(), config: {} },
            { id: "log", type: "LogNode", position: pos(), config: {} }
          ],
          edges: [
            { id: "be1", source: "c_name", sourceHandle: "value", target: "set", targetHandle: "name" },
            { id: "be2", source: "fe", sourceHandle: "index", target: "set", targetHandle: "value" },
            { id: "be3", source: "set", sourceHandle: "value", target: "log", targetHandle: "input" }
          ]
        })
      ],
      [
        { id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }
      ]
    );
    const interp = new FlowInterpreter(g, customDS);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    const mutated = interp.getMutatedVariables();
    expect(mutated.length).toBe(1);
    expect(mutated[0]?.name).toBe("last_idx");
    // Ultimo write eh idx=2 (3 elementos: 0,1,2).
    expect(mutated[0]?.value).toEqual({ kind: "number", value: 2 });
  });
});

describe("FlowInterpreter — Filter", () => {
  it("filtra rowList por coluna+operador+valor", async () => {
    const customDS: DataSource = {
      async listAllRowsForSheet() {
        return [
          { placa: "ABC1A23", local: "Loja 1" },
          { placa: "DEF2B45", local: "Loja 2" },
          { placa: "GHI3C67", local: "Loja 1" }
        ];
      },
      async listSelectedRowsForSheet() {
        return [];
      },
      async matchRowsForBulkSelect() {
        return [];
      }
    };
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        { id: "flt", type: "Filter", position: pos(), config: { column: "local", operator: "eq", value: "Loja 1" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "F" } }
      ],
      [
        { id: "e1", source: "src", sourceHandle: "rows", target: "flt", targetHandle: "input" },
        { id: "e2", source: "flt", sourceHandle: "result", target: "log", targetHandle: "input" }
      ]
    );
    const interp = new FlowInterpreter(g, customDS);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toContain("2 row(s)");
  });
});

describe("FlowInterpreter — mock data + log interpolation", () => {
  it("AllRowsSource(carros) -> ForEach -> Log interpola ${id}", async () => {
    // Log vive dentro do body; conecta cross-scope a fe.current_row.
    const g = graph(
      [
        {
          id: "src",
          type: "AllRowsSource",
          position: pos(),
          config: { sheet_key: "carros" }
        },
        foreachNode("fe", {}, {
          nodes: [{ id: "log", type: "LogNode", position: pos(), config: { prefix: "Veiculo ${id}" } }],
          edges: [{ id: "be1", source: "fe", sourceHandle: "current_row", target: "log", targetHandle: "input" }]
        })
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs).toHaveLength(3);
    expect(result.logs[0]?.message).toBe("Veiculo 00000000-0000-4000-8000-000000000001");
    expect(result.logs[1]?.message).toBe("Veiculo 00000000-0000-4000-8000-000000000002");
    expect(result.logs[2]?.message).toBe("Veiculo 00000000-0000-4000-8000-000000000003");
  });

  it("AllRowsSource(carros) com dynamicOutputs column ejeta id como Value, log interpola ${value}", async () => {
    const feNode = foreachNode("fe", {}, {
      nodes: [{ id: "log", type: "LogNode", position: pos(), config: { prefix: "ID = ${value}" } }],
      edges: [{ id: "be1", source: "fe", sourceHandle: "col_id", target: "log", targetHandle: "input" }]
    });
    feNode.dynamicOutputs?.push({
      id: "col_id",
      label: "id",
      kind: "column",
      fieldName: "id",
      type: { kind: "String" }
    });
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        feNode
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs).toHaveLength(3);
    expect(result.logs[0]?.message).toBe("ID = 00000000-0000-4000-8000-000000000001");
  });

  it("Log com multiplos placeholders + retrocompat: prefix sem ${} usa formato [PREFIX]", async () => {
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        foreachNode("fe", {}, {
          nodes: [
            { id: "logA", type: "LogNode", position: pos(), config: { prefix: "${placa} (${cor}) - ${ano_mod}" } },
            { id: "logB", type: "LogNode", position: pos(), config: { prefix: "DEBUG" } }
          ],
          edges: [
            { id: "be1", source: "fe", sourceHandle: "current_row", target: "logA", targetHandle: "input" },
            { id: "be2", source: "fe", sourceHandle: "current_row", target: "logB", targetHandle: "input" }
          ]
        })
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs).toHaveLength(6);
    const aMessages = result.logs.filter((l) => !l.message.startsWith("[DEBUG]")).map((l) => l.message);
    expect(aMessages[0]).toBe("ABC1A23 (Branco) - 2023");
    expect(aMessages[1]).toBe("DEF2B45 (Prata) - 2022");
    const bMessages = result.logs.filter((l) => l.message.startsWith("[DEBUG]"));
    expect(bMessages).toHaveLength(3);
    expect(bMessages[0]?.message).toContain("ABC1A23");
  });

  it("Log com ${count} e ${first.col} pra RowList", async () => {
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "modelos" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "Total: ${count}, primeiro: ${first.modelo}" } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("Total: 3, primeiro: Chevrolet Onix");
  });

  it("Placeholder nao resolvido fica literal (${unknown})", async () => {
    const g = graph(
      [
        { id: "c", type: "ConstantNode", position: pos(), config: { value: 42 } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "v=${value} u=${nao_existe}" } }
      ],
      [{ id: "e1", source: "c", sourceHandle: "value", target: "log", targetHandle: "input" }]
    );
    const interp = new FlowInterpreter(g, MOCK_DATA_SOURCE);
    const result = await interp.run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("v=42 u=${nao_existe}");
  });

  it("MOCK_DATA_SOURCE: listAllRowsForSheet retorna fixtures pra sheets conhecidas", async () => {
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "vendas" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "VENDAS" } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    // 2 vendas no mock.
    expect(result.logs[0]?.message).toContain("2 row(s)");
    expect(result.logs[0]?.message).toContain("em vendas");
  });

  it("frameContext: ${id} resolve mesmo quando Log recebe col_id (Value) como input", async () => {
    const feNode = foreachNode("fe", {}, {
      nodes: [{ id: "log", type: "LogNode", position: pos(), config: { prefix: "${id} -> ${placa}" } }],
      edges: [{ id: "be1", source: "fe", sourceHandle: "col_id", target: "log", targetHandle: "input" }]
    });
    feNode.dynamicOutputs?.push({
      id: "col_id",
      label: "id",
      kind: "column",
      fieldName: "id",
      type: { kind: "String" }
    });
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        feNode
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs).toHaveLength(3);
    expect(result.logs[0]?.message).toBe(
      "00000000-0000-4000-8000-000000000001 -> ABC1A23"
    );
    expect(result.logs[2]?.message).toBe(
      "00000000-0000-4000-8000-000000000003 -> GHI3C67"
    );
  });

  it("frameContext: multiplos ${var} resolvem juntos via row da iteracao", async () => {
    const feNode = foreachNode("fe", {}, {
      nodes: [{
        id: "log",
        type: "LogNode",
        position: pos(),
        config: { prefix: "${placa} | ${cor} | ${ano_mod} | ${hodometro}km | em ${local}" }
      }],
      edges: [{ id: "be1", source: "fe", sourceHandle: "col_id", target: "log", targetHandle: "input" }]
    });
    feNode.dynamicOutputs?.push({
      id: "col_id",
      label: "id",
      kind: "column",
      fieldName: "id",
      type: { kind: "String" }
    });
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        feNode
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs).toHaveLength(3);
    expect(result.logs[0]?.message).toBe("ABC1A23 | Branco | 2023 | 42000km | em Loja 1");
    expect(result.logs[1]?.message).toBe("DEF2B45 | Prata | 2022 | 58000km | em Loja 2");
    expect(result.logs[2]?.message).toBe("GHI3C67 | Preto | 2025 | 12000km | em Galpao");
  });

  it("frameContext: fora de ForEach, ${id} fica literal (sem iteracao = sem row)", async () => {
    const g = graph(
      [
        { id: "c", type: "ConstantNode", position: pos(), config: { value: "x" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "id=${id}" } }
      ],
      [{ id: "e1", source: "c", sourceHandle: "value", target: "log", targetHandle: "input" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    // Sem ForEach ancestral, frameContext esta vazio. ${id} nao resolve.
    expect(result.logs[0]?.message).toBe("id=${id}");
  });

  it("Masterizador: cria outputs custom com expression e tipos", async () => {
    // Source(carros) -> Masterizador -> 3 outputs custom -> Logs
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        {
          id: "mst",
          type: "Masterizador",
          position: pos(),
          config: {},
          dynamicOutputs: [
            {
              id: "mapper_resumo",
              label: "resumo",
              kind: "mapper",
              expression: "${first.placa} - ${count} carros",
              outputType: "string",
              type: { kind: "String" }
            },
            {
              id: "mapper_total",
              label: "total",
              kind: "mapper",
              expression: "${count}",
              outputType: "number",
              type: { kind: "Number" }
            }
          ]
        },
        { id: "logA", type: "LogNode", position: pos(), config: { prefix: "${value}" } },
        { id: "logB", type: "LogNode", position: pos(), config: { prefix: "Total: ${value}" } }
      ],
      [
        { id: "e1", source: "src", sourceHandle: "rows", target: "mst", targetHandle: "input" },
        { id: "e2", source: "mst", sourceHandle: "mapper_resumo", target: "logA", targetHandle: "input" },
        { id: "e3", source: "mst", sourceHandle: "mapper_total", target: "logB", targetHandle: "input" }
      ]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    const msgs = result.logs.map((l) => l.message).sort();
    expect(msgs).toContain("ABC1A23 - 3 carros");
    expect(msgs).toContain("Total: 3");
  });

  it("Masterizador: dotted paths em interpolacao (${input.field})", async () => {
    // Body do ForEach contem mst + log; mst recebe current_row do parent.
    const feNode = foreachNode("fe", {}, {
      nodes: [
        {
          id: "mst",
          type: "Masterizador",
          position: pos(),
          config: {},
          dynamicOutputs: [
            {
              id: "mapper_label",
              label: "label",
              kind: "mapper",
              expression: "Carro: ${input.placa}",
              outputType: "string",
              type: { kind: "String" }
            }
          ]
        },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "${value}" } }
      ],
      edges: [
        { id: "be1", source: "fe", sourceHandle: "current_row", target: "mst", targetHandle: "input" },
        { id: "be2", source: "mst", sourceHandle: "mapper_label", target: "log", targetHandle: "input" }
      ]
    });
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "AAA1\nBBB2" }
        },
        feNode
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs.map((l) => l.message)).toEqual(["Carro: AAA1", "Carro: BBB2"]);
  });

  it("Masterizador: cast pra number e boolean", async () => {
    const g = graph(
      [
        { id: "c", type: "ConstantNode", position: pos(), config: { value: "42" } },
        {
          id: "mst",
          type: "Masterizador",
          position: pos(),
          config: {},
          dynamicOutputs: [
            {
              id: "mapper_n",
              label: "n",
              kind: "mapper",
              expression: "${value}",
              outputType: "number",
              type: { kind: "Number" }
            },
            {
              id: "mapper_b",
              label: "b",
              kind: "mapper",
              expression: "true",
              outputType: "boolean",
              type: { kind: "Boolean" }
            }
          ]
        },
        { id: "logA", type: "LogNode", position: pos(), config: { prefix: "n=${value}" } },
        { id: "logB", type: "LogNode", position: pos(), config: { prefix: "b=${value}" } }
      ],
      [
        { id: "e1", source: "c", sourceHandle: "value", target: "mst", targetHandle: "input" },
        { id: "e2", source: "mst", sourceHandle: "mapper_n", target: "logA", targetHandle: "input" },
        { id: "e3", source: "mst", sourceHandle: "mapper_b", target: "logB", targetHandle: "input" }
      ]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    const msgs = result.logs.map((l) => l.message).sort();
    expect(msgs).toContain("n=42");
    expect(msgs).toContain("b=true");
  });

  it("interpolatePlaceholders: dotted path ${input.field}, ${input[0].field}", async () => {
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        {
          id: "log",
          type: "LogNode",
          position: pos(),
          // input e RowList; usa ${first.placa} pra primeiro e ${input[1].placa}
          // pra segundo (dotted+indexed).
          config: { prefix: "1o=${first.placa} 2o=${input[1].placa}" }
        }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("1o=ABC1A23 2o=DEF2B45");
  });

  it("If unificado: operator + right_literal (sem Compare), ramifica left", async () => {
    const g = graph(
      [
        { id: "c", type: "ConstantNode", position: pos(), config: { value: "ATIVO" } },
        // If compara left=c.value com right_literal="ATIVO". Match → ramifica pra then.
        { id: "iff", type: "If", position: pos(), config: { operator: "eq", right_literal: "ATIVO" } },
        { id: "logT", type: "LogNode", position: pos(), config: { prefix: "THEN ${value}" } },
        { id: "logE", type: "LogNode", position: pos(), config: { prefix: "ELSE ${value}" } }
      ],
      [
        { id: "e1", source: "c", sourceHandle: "value", target: "iff", targetHandle: "left" },
        { id: "e2", source: "iff", sourceHandle: "then_value", target: "logT", targetHandle: "input" },
        { id: "e3", source: "iff", sourceHandle: "else_value", target: "logE", targetHandle: "input" }
      ]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    const msgs = result.logs.map((l) => l.message);
    expect(msgs).toContain("THEN ATIVO");
    expect(msgs).not.toContain("ELSE ATIVO");
  });

  it("If unificado: result (boolean) tambem exposto", async () => {
    const g = graph(
      [
        { id: "c", type: "ConstantNode", position: pos(), config: { value: 10 } },
        { id: "iff", type: "If", position: pos(), config: { operator: "gt", right_literal: "5" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "10>5=${value}" } }
      ],
      [
        { id: "e1", source: "c", sourceHandle: "value", target: "iff", targetHandle: "left" },
        { id: "e2", source: "iff", sourceHandle: "result", target: "log", targetHandle: "input" }
      ]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("10>5=true");
  });

  it("If retrocompat: ainda aceita condition externa (fluxos antigos)", async () => {
    // Fluxo legado: Compare -> If.condition, If.value separado.
    const g = graph(
      [
        { id: "l", type: "ConstantNode", position: pos(), config: { value: 10 } },
        { id: "r", type: "ConstantNode", position: pos(), config: { value: 5 } },
        { id: "v", type: "ConstantNode", position: pos(), config: { value: "DADO" } },
        { id: "cmp", type: "Compare", position: pos(), config: { operator: "gt" } },
        { id: "iff", type: "If", position: pos(), config: {} },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "T=${value}" } }
      ],
      [
        { id: "e1", source: "l", sourceHandle: "value", target: "cmp", targetHandle: "left" },
        { id: "e2", source: "r", sourceHandle: "value", target: "cmp", targetHandle: "right" },
        { id: "e3", source: "cmp", sourceHandle: "result", target: "iff", targetHandle: "condition" },
        { id: "e4", source: "v", sourceHandle: "value", target: "iff", targetHandle: "value" },
        { id: "e5", source: "iff", sourceHandle: "then_value", target: "log", targetHandle: "input" }
      ]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("T=DADO");
  });

  it("body vazio: ForEach itera mas nao executa nada (no-op)", async () => {
    const g = graph(
      [
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "carros" } },
        foreachNode("fe", {}, { nodes: [], edges: [] })
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    // Nenhum log produzido (body vazio).
    expect(result.logs).toHaveLength(0);
    // Tickou 3x (uma por iter pra contabilizar limit).
    expect(result.executionsCount).toBeGreaterThanOrEqual(3);
  });

  it("body aninhado: ForEach dentro de ForEach itera M*N vezes", async () => {
    // Externo: 2 carros. Interno: 2 modelos. Total = 2*2 = 4 logs.
    const innerFe = foreachNode("inner", {}, {
      nodes: [
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "${placa}/${modelo}" } }
      ],
      edges: [
        { id: "be1", source: "inner", sourceHandle: "current_row", target: "log", targetHandle: "input" }
      ]
    });
    const outerFe = foreachNode("outer", {}, {
      nodes: [
        { id: "src2", type: "AllRowsSource", position: pos(), config: { sheet_key: "modelos" } },
        innerFe
      ],
      edges: [
        { id: "be1", source: "src2", sourceHandle: "rows", target: "inner", targetHandle: "rows" }
      ]
    });
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "AAA1\nBBB2" }
        },
        outerFe
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "outer", targetHandle: "rows" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    // 2 placas × 3 modelos (mock tem 3 modelos) = 6 logs.
    expect(result.logs).toHaveLength(6);
    // frameContext da iteracao mais proxima (inner = modelos) tem `modelo`.
    // Como o frameContext usa o ForEach ANCESTRAL mais proximo, ${placa} vem
    // do innerFe (modelos nao tem placa); pode ficar literal ou vazio.
    expect(result.logs[0]?.message).toContain("Chevrolet Onix");
  });

  it("body sem ForEach pai mas com Log + Constant funciona local", async () => {
    // Caso simples: ForEach com body {Constant->Log}, sem usar fe.current_row.
    const g = graph(
      [
        {
          id: "src",
          type: "BulkSelectSource",
          position: pos(),
          config: { sheet_key: "carros", match_column: "placa", tokens: "A\nB" }
        },
        foreachNode("fe", {}, {
          nodes: [
            { id: "c", type: "ConstantNode", position: pos(), config: { value: "tick" } },
            { id: "log", type: "LogNode", position: pos(), config: { prefix: "T" } }
          ],
          edges: [{ id: "be1", source: "c", sourceHandle: "value", target: "log", targetHandle: "input" }]
        })
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0]?.message).toBe("[T] tick");
  });

  it("MOCK_DATA_SOURCE: sheet sem fixture cai em [] (sem crash)", async () => {
    const g = graph(
      [
        // anuncios nao tem mock-data
        { id: "src", type: "AllRowsSource", position: pos(), config: { sheet_key: "anuncios" } },
        { id: "log", type: "LogNode", position: pos(), config: { prefix: "X" } }
      ],
      [{ id: "e1", source: "src", sourceHandle: "rows", target: "log", targetHandle: "input" }]
    );
    const result = await new FlowInterpreter(g, MOCK_DATA_SOURCE).run();
    expect(result.status).toBe("completed");
    expect(result.logs[0]?.message).toBe("[X] 0 row(s) em anuncios");
  });
});
