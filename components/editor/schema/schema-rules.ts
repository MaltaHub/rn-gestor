/**
 * Regras de inferencia de schema por node type.
 *
 * Cada regra recebe:
 *   - `node`: o FlowNode com config + dynamicOutputs
 *   - `inputs`: schemas resolvidos pra cada socket de entrada (`Record<inputKey, SocketSchema | undefined>`)
 *
 * E devolve um Record `outputKey -> SocketSchema` pros outputs ESTATICOS
 * (do registry). Outputs dinamicos sao tratados a parte pelo `inferGraphSchemas`
 * usando `inferDynamicOutputSchema`.
 *
 * Regra default (`defaultPassthroughRule`): nao infere nada (Record vazio),
 * usada quando nao ha conhecimento especifico sobre o node.
 */

import type { FlowNode } from "@/components/editor/types";
import type { SheetKey } from "@/components/ui-grid/types";
import { getSheetSchema, type ColumnType } from "@/components/editor/schema/sheet-schema";

export type SchemaField = {
  name: string;
  type: ColumnType;
  origin: "sheet" | "intrinsic" | "user-variable";
  sourceNodeId?: string;
  sourceSocket?: string;
};

export type SocketSchema = {
  fields: SchemaField[];
  primarySheet?: SheetKey;
};

export type SchemaInputs = Record<string, SocketSchema | undefined>;

export type SchemaRule = (node: FlowNode, inputs: SchemaInputs) => Record<string, SocketSchema>;

function buildSheetSchema(node: FlowNode, outputKey: string): SocketSchema {
  const sheet = node.config?.sheet_key as SheetKey | undefined;
  if (!sheet) return { fields: [] };
  const sheetSchema = getSheetSchema(sheet);
  if (!sheetSchema) return { fields: [] };
  return {
    primarySheet: sheet,
    fields: sheetSchema.columns.map((col) => ({
      name: col.name,
      type: col.type,
      origin: "sheet",
      sourceNodeId: node.id,
      sourceSocket: outputKey
    }))
  };
}

const sourceRule: SchemaRule = (node) => ({
  rows: buildSheetSchema(node, "rows")
});

const filterRule: SchemaRule = (_node, inputs) => ({
  result: inputs.input ?? { fields: [] }
});

const columnPickRule: SchemaRule = (node, inputs) => {
  const col = (node.config?.column as string | undefined) ?? "";
  const inputSchema = inputs.row;
  const field = inputSchema?.fields.find((f) => f.name === col);
  if (!col || !field) {
    return { value: { fields: [] } };
  }
  return {
    value: {
      primarySheet: inputSchema?.primarySheet,
      fields: [
        {
          name: col,
          type: field.type,
          origin: "sheet",
          sourceNodeId: node.id,
          sourceSocket: "value"
        }
      ]
    }
  };
};

const constantRule: SchemaRule = () => ({
  value: { fields: [] } // Constant nao carrega schema de aba.
});

/**
 * ForEach: nao tem outputs estaticos (rewrite total). Tudo vira intrinseco
 * exposto via inferDynamicOutputSchema quando o user adiciona via "+".
 */
const forEachRule: SchemaRule = () => ({});

/**
 * Default: nada inferido. Usado pra Compare, If, Switch, Tags etc. — outputs
 * desses nodes nao carregam fields de schema (sao booleans ou propagam Value
 * generico). Refinaveis em fases futuras.
 */
const defaultPassthroughRule: SchemaRule = () => ({});

export const SCHEMA_RULES: Record<string, SchemaRule> = {
  BulkSelectSource: sourceRule,
  SelectedRowsSource: sourceRule,
  AllRowsSource: sourceRule,
  Filter: filterRule,
  ColumnPick: columnPickRule,
  ConstantNode: constantRule,
  ForEach: forEachRule
};

export function getSchemaRule(nodeType: string): SchemaRule {
  return SCHEMA_RULES[nodeType] ?? defaultPassthroughRule;
}

/**
 * Schema dos outputs DINAMICOS (adicionados via "+").
 *
 * Para `kind: "column"`: pega o field correspondente dos input schemas.
 * Para `kind: "intrinsic"`: retorna schema "intrinseco" — pra ForEach.current_row
 * o schema vem do input rows; pra index/total e number sem fields ricos.
 */
export function inferDynamicOutputSchema(
  socket: {
    kind: "intrinsic" | "column" | "mapper";
    intrinsicKey?: string;
    fieldName?: string;
    expression?: string;
    outputType?: string;
    id: string;
  },
  inputs: SchemaInputs,
  node: FlowNode
): SocketSchema {
  if (socket.kind === "mapper") {
    // Mapper output: schema reflete o tipo declarado pelo user. Sem fields ricos
    // (resultado e escalar). primarySheet do input herda como pista de origem.
    const inputCandidate = inputs.input ?? inputs.rows ?? inputs.row;
    const rawOutputType = (socket as { outputType?: string }).outputType;
    const colType: ColumnType =
      rawOutputType === "string"
        ? "string"
        : rawOutputType === "number"
          ? "number"
          : rawOutputType === "boolean"
            ? "boolean"
            : "unknown";
    return {
      primarySheet: inputCandidate?.primarySheet,
      fields: [
        {
          name: socket.id,
          type: colType,
          origin: "intrinsic",
          sourceNodeId: node.id,
          sourceSocket: socket.id
        }
      ]
    };
  }
  if (socket.kind === "column") {
    // Usa o primeiro input "row-like" (ForEach: input "rows"; Source: schema da sheet do config).
    const inputCandidate = inputs.rows ?? inputs.input ?? inputs.row;
    const fromInput = inputCandidate?.fields.find((f) => f.name === socket.fieldName);
    if (fromInput) {
      return {
        primarySheet: inputCandidate?.primarySheet,
        fields: [
          {
            name: socket.fieldName ?? "value",
            type: fromInput.type,
            origin: "sheet",
            sourceNodeId: node.id,
            sourceSocket: socket.id
          }
        ]
      };
    }
    // Fallback: source nodes sem input — derivar da sheet do config.
    const sheet = node.config?.sheet_key as SheetKey | undefined;
    if (sheet && socket.fieldName) {
      const sheetSchema = getSheetSchema(sheet);
      const col = sheetSchema?.columns.find((c) => c.name === socket.fieldName);
      if (col) {
        return {
          primarySheet: sheet,
          fields: [
            {
              name: col.name,
              type: col.type,
              origin: "sheet",
              sourceNodeId: node.id,
              sourceSocket: socket.id
            }
          ]
        };
      }
    }
    return { fields: [] };
  }
  // intrinsic
  if (socket.intrinsicKey === "current_row") {
    // current_row preserva o schema do input rows.
    const inputSchema = inputs.rows ?? inputs.input;
    return {
      primarySheet: inputSchema?.primarySheet,
      fields: inputSchema?.fields ?? []
    };
  }
  if (socket.intrinsicKey === "result") {
    // result do ForEach = RowList igual ao input.
    const inputSchema = inputs.rows ?? inputs.input;
    return {
      primarySheet: inputSchema?.primarySheet,
      fields: inputSchema?.fields ?? []
    };
  }
  if (socket.intrinsicKey === "index" || socket.intrinsicKey === "total") {
    return {
      fields: [
        {
          name: socket.intrinsicKey,
          type: "number",
          origin: "intrinsic",
          sourceNodeId: node.id,
          sourceSocket: socket.id
        }
      ]
    };
  }
  return { fields: [] };
}
