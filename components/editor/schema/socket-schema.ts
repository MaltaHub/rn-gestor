/**
 * Schema propagation pelo grafo do editor.
 *
 * Caminha o grafo em ordem topologica, computa o schema de cada output de
 * cada node aplicando regras (`schema-rules.ts`) + outputs dinamicos
 * (`dynamicOutputs` do FlowNode). O resultado e um `SchemaEnvironment` com
 * indices por socket, por edge e por input — consumido pela UI pra preencher
 * dropdowns de coluna, validar tipos, etc.
 *
 * **Ciclos:** o grafo do editor e teoricamente DAG, mas o usuario pode criar
 * ciclos via UI. O topological sort detecta e devolve ordem parcial — nodes
 * em ciclo recebem schemas vazios sem crashar.
 */

import type { FlowGraph, FlowNode } from "@/components/editor/types";
import {
  getSchemaRule,
  inferDynamicOutputSchema,
  type SchemaInputs,
  type SocketSchema
} from "@/components/editor/schema/schema-rules";

export type { SocketSchema, SchemaField } from "@/components/editor/schema/schema-rules";

export type SchemaEnvironment = {
  /** schema do output de um socket — key = `${nodeId}:${outputKey}` */
  bySocket: Map<string, SocketSchema>;
  /** schema vista por uma edge — key = edge.id */
  byEdge: Map<string, SocketSchema>;
  /** schema disponivel em cada input do node — key = `${nodeId}:${inputKey}` */
  byInput: Map<string, SocketSchema>;
  /**
   * Schema da row iterada pelo ForEach ANCESTRAL mais proximo. Usado pelo
   * TemplateField pra listar TODOS os campos disponiveis no contexto da
   * iteracao, mesmo quando o node so recebe um Value (col-eject) como input.
   * Casa com `frameContext` do runtime.
   */
  frameSchemaByNode: Map<string, SocketSchema>;
};

function socketKey(nodeId: string, outputKey: string): string {
  return `${nodeId}:${outputKey}`;
}

function inputKey(nodeId: string, inputKey: string): string {
  return `${nodeId}:${inputKey}`;
}

/**
 * Kahn's algorithm. Devolve ordem topologica dos nodes; se ha ciclo, nodes
 * que nao foram visitados ficam de fora — schemas pra eles caem em vazio.
 */
function topologicalSort(graph: FlowGraph): FlowNode[] {
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adj.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    adj.get(edge.source)?.push(edge.target);
  }
  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }
  const order: FlowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const node = graph.nodes.find((n) => n.id === id);
    if (node) order.push(node);
    for (const next of adj.get(id) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }
  return order;
}

/**
 * Computa schemas pra todo o grafo. Custo: O(V + E) + custo das regras.
 * Resultado deve ser memoizado por hash(nodes + edges) no consumidor.
 */
export function inferGraphSchemas(graph: FlowGraph): SchemaEnvironment {
  const bySocket = new Map<string, SocketSchema>();
  const order = topologicalSort(graph);

  // Index pra edges entrantes — O(E) lookup amortizado.
  const incomingByNode = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    const list = incomingByNode.get(edge.target) ?? [];
    list.push(edge);
    incomingByNode.set(edge.target, list);
  }

  for (const node of order) {
    // 1. Resolve input schemas via edges entrantes.
    const inputs: SchemaInputs = {};
    for (const edge of incomingByNode.get(node.id) ?? []) {
      const upstreamKey = socketKey(edge.source, edge.sourceHandle ?? "default");
      const upstream = bySocket.get(upstreamKey);
      inputs[edge.targetHandle ?? "default"] = upstream;
    }

    // 2. Aplica regra estatica do registry.
    const rule = getSchemaRule(node.type);
    const staticOutputs = rule(node, inputs);
    for (const [key, schema] of Object.entries(staticOutputs)) {
      bySocket.set(socketKey(node.id, key), schema);
    }

    // 3. Aplica dynamicOutputs do node.
    if (node.dynamicOutputs) {
      for (const dyno of node.dynamicOutputs) {
        const schema = inferDynamicOutputSchema(dyno, inputs, node);
        bySocket.set(socketKey(node.id, dyno.id), schema);
      }
    }
  }

  // 4. Indices auxiliares pra UI.
  const byEdge = new Map<string, SocketSchema>();
  const byInput = new Map<string, SocketSchema>();
  for (const edge of graph.edges) {
    const upstream = bySocket.get(socketKey(edge.source, edge.sourceHandle ?? "default"));
    if (upstream) {
      byEdge.set(edge.id, upstream);
      byInput.set(inputKey(edge.target, edge.targetHandle ?? "default"), upstream);
    }
  }

  // 5. Frame schema por node: pra cada node, descobre o ForEach ancestral mais
  // proximo (walking edges entrantes em BFS) e copia o schema da row iterada
  // (= schema do input "rows" do ForEach).
  const frameSchemaByNode = buildFrameSchemas(graph, bySocket, incomingByNode);

  return { bySocket, byEdge, byInput, frameSchemaByNode };
}

function buildFrameSchemas(
  graph: FlowGraph,
  bySocket: Map<string, SocketSchema>,
  incomingByNode: Map<string, typeof graph.edges>
): Map<string, SocketSchema> {
  const result = new Map<string, SocketSchema>();
  const forEachNodes = new Set(graph.nodes.filter((n) => n.type === "ForEach").map((n) => n.id));

  for (const node of graph.nodes) {
    if (forEachNodes.has(node.id)) continue; // Proprio ForEach nao tem ancestral relevante.
    const ancestor = findAncestralForEach(node.id, incomingByNode, forEachNodes, new Set());
    if (!ancestor) continue;
    // Schema da row iterada = schema da edge entrante no ForEach.rows.
    const feEdges = incomingByNode.get(ancestor) ?? [];
    for (const edge of feEdges) {
      const targetKey = edge.targetHandle ?? "default";
      if (targetKey !== "rows") continue;
      const upstream = bySocket.get(`${edge.source}:${edge.sourceHandle ?? "default"}`);
      if (upstream) {
        result.set(node.id, upstream);
        break;
      }
    }
  }
  return result;
}

function findAncestralForEach(
  nodeId: string,
  incomingByNode: Map<string, FlowGraph["edges"]>,
  forEachNodes: Set<string>,
  visited: Set<string>
): string | null {
  if (visited.has(nodeId)) return null;
  visited.add(nodeId);
  const edges = incomingByNode.get(nodeId) ?? [];
  for (const edge of edges) {
    if (forEachNodes.has(edge.source)) return edge.source;
    const found = findAncestralForEach(edge.source, incomingByNode, forEachNodes, visited);
    if (found) return found;
  }
  return null;
}

export const EMPTY_SCHEMA_ENV: SchemaEnvironment = {
  bySocket: new Map(),
  byEdge: new Map(),
  byInput: new Map(),
  frameSchemaByNode: new Map()
};
