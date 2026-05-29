import { describe, expect, it } from "vitest";
import {
  getGraphAtPath,
  getNodeAtPath,
  updateGraphAtPath,
  type BodyPath
} from "@/components/editor/body-navigation";
import { emptyFlowGraph, type FlowGraph } from "@/components/editor/types";

function rootWith2LevelBody(): FlowGraph {
  // Root: [src, fe]
  // fe.body: [pick, log] + nested fe2 com body proprio
  return {
    nodes: [
      { id: "src", type: "AllRowsSource", position: { x: 0, y: 0 }, config: {} },
      {
        id: "fe",
        type: "ForEach",
        position: { x: 100, y: 0 },
        config: {},
        body: {
          nodes: [
            { id: "pick", type: "ColumnPick", position: { x: 0, y: 0 }, config: {} },
            { id: "log", type: "LogNode", position: { x: 100, y: 0 }, config: {} },
            {
              id: "fe2",
              type: "ForEach",
              position: { x: 200, y: 0 },
              config: {},
              body: {
                nodes: [
                  { id: "innerLog", type: "LogNode", position: { x: 0, y: 0 }, config: {} }
                ],
                edges: []
              }
            }
          ],
          edges: [
            { id: "be1", source: "fe", sourceHandle: "current_row", target: "pick", targetHandle: "row" }
          ]
        }
      }
    ],
    edges: [{ id: "e1", source: "src", sourceHandle: "rows", target: "fe", targetHandle: "rows" }]
  };
}

describe("getGraphAtPath", () => {
  it("path vazio retorna a raiz", () => {
    const root = rootWith2LevelBody();
    expect(getGraphAtPath(root, [])).toBe(root);
  });

  it("path de 1 nivel retorna o body do node", () => {
    const root = rootWith2LevelBody();
    const path: BodyPath = [{ nodeId: "fe", nodeLabel: "ForEach" }];
    const body = getGraphAtPath(root, path);
    expect(body.nodes.map((n) => n.id).sort()).toEqual(["fe2", "log", "pick"]);
  });

  it("path de 2 niveis chega no body aninhado", () => {
    const root = rootWith2LevelBody();
    const path: BodyPath = [
      { nodeId: "fe", nodeLabel: "ForEach" },
      { nodeId: "fe2", nodeLabel: "ForEach" }
    ];
    const body = getGraphAtPath(root, path);
    expect(body.nodes.map((n) => n.id)).toEqual(["innerLog"]);
  });

  it("path apontando pra node inexistente: fallback pra raiz", () => {
    const root = rootWith2LevelBody();
    const path: BodyPath = [{ nodeId: "naoexiste", nodeLabel: "X" }];
    expect(getGraphAtPath(root, path)).toBe(root);
  });
});

describe("updateGraphAtPath", () => {
  it("path vazio: aplica updater na raiz", () => {
    const root: FlowGraph = { nodes: [], edges: [] };
    const next = updateGraphAtPath(root, [], (g) => ({
      ...g,
      nodes: [{ id: "n1", type: "X", position: { x: 0, y: 0 }, config: {} }]
    }));
    expect(next.nodes).toHaveLength(1);
    expect(next).not.toBe(root); // nova referencia
  });

  it("path de 1 nivel: muta apenas o body, preserva o resto da raiz", () => {
    const root = rootWith2LevelBody();
    const path: BodyPath = [{ nodeId: "fe", nodeLabel: "ForEach" }];
    const next = updateGraphAtPath(root, path, (body) => ({
      ...body,
      nodes: [...body.nodes, { id: "novo", type: "LogNode", position: { x: 0, y: 0 }, config: {} }]
    }));
    // Root tem 2 nodes (src, fe) sempre.
    expect(next.nodes).toHaveLength(2);
    // Body do fe ganhou 1 node (originalmente 3 -> 4).
    const fe = next.nodes.find((n) => n.id === "fe");
    expect(fe?.body?.nodes.map((n) => n.id).sort()).toEqual(["fe2", "log", "novo", "pick"]);
    // Imutabilidade: root original nao mudou.
    const feOriginal = root.nodes.find((n) => n.id === "fe");
    expect(feOriginal?.body?.nodes).toHaveLength(3);
  });

  it("path de 2 niveis: muta body aninhado, preserva ancestrais", () => {
    const root = rootWith2LevelBody();
    const path: BodyPath = [
      { nodeId: "fe", nodeLabel: "ForEach" },
      { nodeId: "fe2", nodeLabel: "ForEach" }
    ];
    const next = updateGraphAtPath(root, path, (body) => ({
      ...body,
      nodes: [
        ...body.nodes,
        { id: "innerNew", type: "LogNode", position: { x: 0, y: 0 }, config: {} }
      ]
    }));
    const fe = next.nodes.find((n) => n.id === "fe");
    const fe2 = fe?.body?.nodes.find((n) => n.id === "fe2");
    expect(fe2?.body?.nodes.map((n) => n.id).sort()).toEqual(["innerLog", "innerNew"]);
  });

  it("path com node inexistente: no-op (retorna raiz original)", () => {
    const root = rootWith2LevelBody();
    const path: BodyPath = [{ nodeId: "naoexiste", nodeLabel: "X" }];
    const next = updateGraphAtPath(root, path, (g) => ({ ...g, nodes: [] }));
    expect(next).toBe(root);
  });
});

describe("getNodeAtPath", () => {
  it("path vazio retorna null (sem node alvo)", () => {
    expect(getNodeAtPath(rootWith2LevelBody(), [])).toBeNull();
  });

  it("path de 1 step retorna o node no nivel raiz", () => {
    const node = getNodeAtPath(rootWith2LevelBody(), [{ nodeId: "fe", nodeLabel: "ForEach" }]);
    expect(node?.id).toBe("fe");
    expect(node?.body).toBeDefined();
  });

  it("path de 2 steps retorna node aninhado", () => {
    const node = getNodeAtPath(rootWith2LevelBody(), [
      { nodeId: "fe", nodeLabel: "ForEach" },
      { nodeId: "fe2", nodeLabel: "ForEach" }
    ]);
    expect(node?.id).toBe("fe2");
  });
});

describe("emptyFlowGraph", () => {
  it("retorna graph valido vazio", () => {
    const g = emptyFlowGraph();
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });
});
