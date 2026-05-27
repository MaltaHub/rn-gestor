/**
 * Helpers de navegacao por subgraphs aninhados (body de ForEach/While).
 *
 * O graph principal e um FlowGraph. Nodes estruturais (supportsBody=true) podem
 * ter um campo `body: FlowGraph` proprio, formando uma arvore recursiva. O
 * usuario navega entrando (double-click) e saindo (breadcrumb) desses bodies.
 *
 * Estes helpers sao puros e imutaveis — sempre retornam novas referencias
 * pra que o React detecte mudancas via identity check.
 */

import type { FlowGraph, FlowNode } from "@/components/editor/types";
import { emptyFlowGraph } from "@/components/editor/types";

export type BodyPathStep = {
  nodeId: string;
  nodeLabel: string;
};

export type BodyPath = BodyPathStep[];

/**
 * Resolve o FlowGraph corrente seguindo `path` desde a raiz. Se algum passo
 * aponta pra um node sem body (inconsistencia), retorna a raiz como fallback.
 */
export function getGraphAtPath(root: FlowGraph, path: BodyPath): FlowGraph {
  let curr: FlowGraph = root;
  for (const step of path) {
    const node = curr.nodes.find((n) => n.id === step.nodeId);
    if (!node?.body) return root;
    curr = node.body;
  }
  return curr;
}

/**
 * Aplica `updater` no graph apontado por `path`, retornando uma nova raiz
 * imutavel. Path vazio = updater na raiz direto. Se algum passo nao acha o
 * node, retorna a raiz original (no-op).
 */
export function updateGraphAtPath(
  root: FlowGraph,
  path: BodyPath,
  updater: (g: FlowGraph) => FlowGraph
): FlowGraph {
  if (path.length === 0) return updater(root);
  const [head, ...rest] = path;
  let found = false;
  const nextNodes: FlowNode[] = root.nodes.map((node) => {
    if (node.id !== head.nodeId) return node;
    found = true;
    const body = node.body ?? emptyFlowGraph();
    return { ...node, body: updateGraphAtPath(body, rest, updater) };
  });
  if (!found) return root;
  return { ...root, nodes: nextNodes };
}

/**
 * Resolve o node referenciado por um path. Util pra obter `node.body` ou
 * propriedades do parent dentro do qual estamos editando.
 */
export function getNodeAtPath(root: FlowGraph, path: BodyPath): FlowNode | null {
  if (path.length === 0) return null;
  let curr: FlowGraph = root;
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const node = curr.nodes.find((n) => n.id === step.nodeId);
    if (!node) return null;
    if (i === path.length - 1) return node;
    if (!node.body) return null;
    curr = node.body;
  }
  return null;
}
