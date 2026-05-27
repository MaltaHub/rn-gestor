/**
 * Tipos compartilhados do editor de fluxos.
 *
 * O `graph` jsonb tem este shape no MVP — vai crescer com nós novos.
 * Validacao estrutural fica no client; backend so trata como jsonb permissivo.
 */

import type { SheetKey } from "@/components/ui-grid/types";

export type FlowNodeId = string;
export type FlowEdgeId = string;

export type FlowSocketType =
  | { kind: "Value" }
  | { kind: "Number" }
  | { kind: "Boolean" }
  | { kind: "String" }
  | { kind: "RowList"; sheet?: SheetKey }
  | { kind: "Row"; sheet?: SheetKey };

export type FlowNodePosition = { x: number; y: number };

/**
 * Socket de saida dinamica adicionado pelo usuario via "+" no node.
 *  - `kind: "intrinsic"` reusa um output bem-conhecido do node (ex: `index`,
 *    `total`, `current_row` do ForEach). `intrinsicKey` mapeia pro contrato
 *    daquele node type.
 *  - `kind: "column"` extrai uma coluna especifica do schema do input
 *    (ex: `placa` quando o input e RowList<carros>). `fieldName` e o nome
 *    da coluna no row, `type` reflete o tipo dela.
 *  - `kind: "mapper"` (Masterizador) computa o output a partir de uma
 *    expression template (ex: "Ano: ${input.ano_mod}"). `expression`,
 *    `outputType` controlam o resultado.
 */
export type DynamicOutputSocket = {
  id: string;
  label: string;
  kind: "intrinsic" | "column" | "mapper";
  intrinsicKey?: string;
  fieldName?: string;
  expression?: string;
  outputType?: "string" | "number" | "boolean" | "value";
  type: FlowSocketType;
};

export type FlowNode = {
  id: FlowNodeId;
  type: string; // chave do registry de nodes (ex: "BulkSelectSource", "TagSelecionar")
  position: FlowNodePosition;
  // Config por instancia: literais, expressoes, parametros do node.
  config?: Record<string, unknown>;
  /**
   * Outputs adicionados pelo usuario via "+" no node. Suportado em sources
   * (com `supportsColumnEject`) e nodes logicos como ForEach
   * (com `supportsDynamicOutputs`). Vazio/undefined = node so expoe outputs
   * estaticos do registry.
   */
  dynamicOutputs?: DynamicOutputSocket[];
  /**
   * Subgrafo aninhado pra nodes estruturais (ForEach, While). Toda logica
   * que deve rodar por iteracao fica AQUI, num canvas separado acessivel via
   * double-click. Acessa o escopo do parent via frameContext (campos da row
   * corrente, index, etc.). Recursivo — nodes dentro do body podem ter seus
   * proprios bodies.
   */
  body?: FlowGraph;
};

export type FlowEdge = {
  id: FlowEdgeId;
  source: FlowNodeId;
  sourceHandle?: string;
  target: FlowNodeId;
  targetHandle?: string;
};

export type FlowViewport = { x: number; y: number; zoom: number };

export type FlowRuntimeLimits = {
  maxIterations?: number;
  maxStackDepth?: number;
  maxTotalNodeExecutions?: number;
};

export type FlowGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: FlowViewport;
  runtimeLimits?: FlowRuntimeLimits;
};

export type EditorFlow = {
  id: string;
  title: string;
  description: string | null;
  sheet_key: SheetKey | null;
  graph: FlowGraph;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type EditorFlowPersistInput = {
  title: string;
  description?: string | null;
  sheet_key?: SheetKey | null;
  graph: FlowGraph;
};

export type EditorFlowUpdateInput = {
  title?: string;
  description?: string | null;
  sheet_key?: SheetKey | null;
  graph?: FlowGraph;
};

export const DEFAULT_RUNTIME_LIMITS: Required<FlowRuntimeLimits> = {
  maxIterations: 10_000,
  maxStackDepth: 64,
  maxTotalNodeExecutions: 100_000
};

export function emptyFlowGraph(): FlowGraph {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    runtimeLimits: DEFAULT_RUNTIME_LIMITS
  };
}
