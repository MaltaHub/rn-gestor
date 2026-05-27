/**
 * Registry de tipos de no.
 *
 *   - Fase 2 (anterior): ConstantNode, LogNode — stubs.
 *   - Fase 3 (atual): type system de sockets + biblioteca basica.
 *       Sources: BulkSelectSource, SelectedRowsSource, AllRowsSource
 *       Computacionais: Filter, ColumnPick, Compare, If
 *   - Fase 4: estruturais (ForEach, While) + runtime.
 *   - Fase 6-8: TAGs.
 *
 * Cada entry e usada por:
 *   - canvas pra render (`component`) — usa o `RegistryNode` generico.
 *   - paleta de "+ Adicionar no" (`category`, `label`).
 *   - properties panel pra editar config (`configFields`).
 *   - type checker (`inputs`, `outputs` com `FlowSocketType`).
 */

import { SHEETS } from "@/components/ui-grid/config";
import { RegistryNode } from "@/components/editor/nodes/registry-node";
import type { ComponentType } from "react";
import type { FlowSocketType } from "@/components/editor/types";

export type NodeCategory = "source" | "structural" | "computation" | "tag";

export type ConfigField =
  | { key: string; label: string; type: "text"; placeholder?: string; defaultValue?: string }
  | { key: string; label: string; type: "textarea"; placeholder?: string; defaultValue?: string }
  | { key: string; label: string; type: "number"; placeholder?: string; defaultValue?: number }
  | { key: string; label: string; type: "boolean"; defaultValue?: boolean }
  | { key: string; label: string; type: "toggle"; defaultValue?: boolean }
  | { key: string; label: string; type: "select"; options: Array<{ value: string; label: string }>; defaultValue?: string }
  | {
      key: string;
      label: string;
      type: "column-select";
      /**
       * Origem das opcoes de coluna:
       *  - "node-config": le `node.config.sheet_key` (pra Sources).
       *  - { inputSocket: "row" | "input" | ... }: le o schema do input socket
       *    via SchemaContext (pra ColumnPick.row, Filter.input, etc).
       */
      sheetFrom: "node-config" | { inputSocket: string };
      /** Permite digitar valor literal (modo "custom") se a coluna nao existe no schema. */
      allowCustom?: boolean;
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      type: "template";
      /**
       * Qual input socket inspecionar pra montar a lista de placeholders
       * sugeridos. O TemplateField consulta o SchemaContext em
       * `byInput.get(`${nodeId}:${inputSocket}`)` e oferece ${name} pra cada
       * field disponivel, alem de ${value}/${count}/${first.col} convenientes.
       */
      inputSocket: string;
      placeholder?: string;
    };

/**
 * Config padrao para TAGs (Fase 9). Todas as TAGs ganham o toggle
 * `requires_human` — quando off, a TAG roda inline; quando on (default),
 * pausa esperando "Liberar".
 */
const TAG_BASE_CONFIG_FIELDS: ConfigField[] = [
  {
    key: "requires_human",
    label: "Exige intervencao humana (pausa)",
    type: "toggle",
    defaultValue: true
  }
];

export type NodeSocket = {
  key: string;
  label: string;
  type: FlowSocketType;
};

/**
 * Output "intrinseco" disponivel pra adicao via "+" no node. Esses sockets nao
 * existem por padrao — o usuario opta por expor cada um conforme precisa.
 * Ex.: ForEach expoe `current_row`, `index`, `total`, `result`.
 */
export type IntrinsicOutputDef = {
  key: string;
  label: string;
  type: FlowSocketType;
  description?: string;
};

export type NodeRegistryEntry = {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  inputs: NodeSocket[];
  outputs: NodeSocket[];
  configFields: ConfigField[];
  /**
   * Outputs disponiveis no "+" do node alem dos estaticos. ForEach declara
   * aqui current_row/index/total/result; user opta quais expor.
   */
  intrinsicOutputs?: IntrinsicOutputDef[];
  /**
   * Permite "+" no lado de saida pra adicionar outputs DINAMICOS (intrinsecos
   * + colunas do schema do input). Default false.
   */
  supportsDynamicOutputs?: boolean;
  /**
   * Source nodes: permite "+" pra ejetar colunas individuais como sockets
   * RowList<column> separados. Default false.
   */
  supportsColumnEject?: boolean;
  /**
   * Masterizador: permite "+" pra criar outputs CUSTOM com nome/tipo/expression
   * livres. UI mostra form em vez de lista pre-definida. Default false.
   */
  supportsCustomOutputs?: boolean;
  /**
   * ForEach, While: tem `body: FlowGraph` editavel via double-click. Indicador
   * visual no header + double-click handler abrem o sub-canvas. Default false.
   */
  supportsBody?: boolean;
};

// --- Helpers para opcoes dos selects ---

const SHEET_OPTIONS = SHEETS.map((sheet) => ({ value: sheet.key, label: sheet.label }));

const COMPARE_OPERATORS: Array<{ value: string; label: string }> = [
  { value: "eq", label: "= (igual)" },
  { value: "neq", label: "<> (diferente)" },
  { value: "lt", label: "< (menor)" },
  { value: "lte", label: "<= (menor ou igual)" },
  { value: "gt", label: "> (maior)" },
  { value: "gte", label: ">= (maior ou igual)" },
  { value: "contains", label: "contem (texto)" },
  { value: "starts_with", label: "comeca com (texto)" }
];

// --- Type checker ---

/**
 * Resolve o tipo concreto de um socket de SAIDA, levando em conta o config
 * do no. Para Source nodes (BulkSelectSource/SelectedRowsSource/AllRowsSource)
 * cujo socket de saida e RowList, preenche a sheet a partir de `config.sheet_key`.
 *
 * Filter/ColumnPick/etc nao tem sheet no config — output fica untyped (sheet
 * indefinida). Phase 4+ pode propagar sheet pelo grafo se virar necessario.
 */
export function resolveOutputSocketType(
  socketType: FlowSocketType,
  nodeConfig: Record<string, unknown> | undefined
): FlowSocketType {
  if ((socketType.kind === "RowList" || socketType.kind === "Row") && !socketType.sheet) {
    const sheet = nodeConfig?.sheet_key;
    if (typeof sheet === "string" && sheet.length > 0) {
      return { ...socketType, sheet } as FlowSocketType;
    }
  }
  return socketType;
}

/**
 * Regras de compatibilidade entre socket de saida (source) e socket de entrada (target):
 * - Value e o "top" para inputs: aceita qualquer kind.
 * - Mesmo kind sempre compatibilizam (Number<->Number, etc.).
 * - RowList<S> casa com RowList<S> ou RowList<undefined> (target untyped aceita qualquer).
 * - RowList<undefined> NAO casa com RowList<S> (source untyped nao satisfaz target tipado).
 * - Idem para Row<S>.
 */
export function isSocketCompatible(source: FlowSocketType, target: FlowSocketType): boolean {
  // Value como input aceita tudo.
  if (target.kind === "Value") return true;

  // Diferentes kinds e target nao e Value: incompatible.
  if (source.kind !== target.kind) return false;

  // Mesma kind: para RowList/Row, valida sheet.
  if (source.kind === "RowList" || source.kind === "Row") {
    const sourceSheet = (source as { sheet?: string }).sheet;
    const targetSheet = (target as { sheet?: string }).sheet;
    if (targetSheet === undefined) return true; // target untyped aceita qualquer
    if (sourceSheet === undefined) return false; // source untyped nao satisfaz target tipado
    return sourceSheet === targetSheet;
  }

  // Outros tipos primitivos: kind ja igual, basta.
  return true;
}

// --- Registry entries ---

export const NODE_REGISTRY: Record<string, NodeRegistryEntry> = {
  // ============================ SOURCES ============================
  ConstantNode: {
    type: "ConstantNode",
    label: "Constante",
    description: "Produz um valor literal (string, numero, booleano).",
    category: "source",
    component: RegistryNode,
    inputs: [],
    outputs: [{ key: "value", label: "Valor", type: { kind: "Value" } }],
    configFields: [
      { key: "value", label: "Valor", type: "text", placeholder: "ex.: 42" }
    ]
  },
  BulkSelectSource: {
    type: "BulkSelectSource",
    label: "Source: Lista de placas",
    description: "Cola uma lista de tokens (placas, modelos) e o source emite os rows correspondentes na aba escolhida.",
    category: "source",
    component: RegistryNode,
    inputs: [],
    outputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    configFields: [
      { key: "sheet_key", label: "Aba", type: "select", options: SHEET_OPTIONS, defaultValue: "carros" },
      {
        key: "match_column",
        label: "Coluna de match",
        type: "column-select",
        sheetFrom: "node-config",
        allowCustom: true,
        placeholder: "ex.: placa"
      },
      { key: "tokens", label: "Tokens (um por linha)", type: "textarea", placeholder: "ABC1A23\nDEF2B45" }
    ],
    supportsColumnEject: true
  },
  SelectedRowsSource: {
    type: "SelectedRowsSource",
    label: "Source: Selecao atual",
    description: "Emite as linhas selecionadas no grid no momento da execucao.",
    category: "source",
    component: RegistryNode,
    inputs: [],
    outputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    configFields: [
      { key: "sheet_key", label: "Aba", type: "select", options: SHEET_OPTIONS, defaultValue: "carros" }
    ],
    supportsColumnEject: true
  },
  AllRowsSource: {
    type: "AllRowsSource",
    label: "Source: Todas as linhas",
    description: "Emite todas as linhas visiveis (ou filtradas) do grid.",
    category: "source",
    component: RegistryNode,
    inputs: [],
    outputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    configFields: [
      { key: "sheet_key", label: "Aba", type: "select", options: SHEET_OPTIONS, defaultValue: "carros" }
    ],
    supportsColumnEject: true
  },

  // ========================= STRUCTURAL ===========================
  ForEach: {
    type: "ForEach",
    label: "ForEach",
    description: "Itera sobre uma RowList. Adicione saidas via '+' pra expor `current_row`, `index`, `total`, `result` ou colunas especificas do schema.",
    category: "structural",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    // Rewrite total: sem outputs estaticos. Tudo via "+" (intrinsicos + colunas).
    outputs: [],
    intrinsicOutputs: [
      {
        key: "current_row",
        label: "Linha atual",
        type: { kind: "Row" },
        description: "A linha sendo iterada (Row)"
      },
      {
        key: "index",
        label: "Indice",
        type: { kind: "Number" },
        description: "0-based index da iteracao"
      },
      {
        key: "total",
        label: "Total",
        type: { kind: "Number" },
        description: "Tamanho total da lista"
      },
      {
        key: "result",
        label: "Resultado",
        type: { kind: "RowList" },
        description: "RowList completa apos o for"
      }
    ],
    supportsDynamicOutputs: true,
    supportsBody: true,
    configFields: []
  },
  While: {
    type: "While",
    label: "While",
    description: "Repete o body enquanto a condicao for verdadeira. Pulamos a primeira iteracao se condition=false.",
    category: "structural",
    component: RegistryNode,
    inputs: [
      { key: "condition", label: "Condicao", type: { kind: "Boolean" } }
    ],
    outputs: [
      { key: "iteration", label: "Iteracao", type: { kind: "Number" } }
    ],
    supportsBody: true,
    configFields: []
  },
  Switch: {
    type: "Switch",
    label: "Switch / Case",
    description: "Roteia o valor de entrada para o case_N cujo match casa, ou para default. Substitui If em N-way (object-calisthenics).",
    category: "structural",
    component: RegistryNode,
    inputs: [{ key: "input", label: "Valor", type: { kind: "Value" } }],
    outputs: [
      { key: "default", label: "Default", type: { kind: "Value" } },
      { key: "case_0", label: "Case 0", type: { kind: "Value" } },
      { key: "case_1", label: "Case 1", type: { kind: "Value" } },
      { key: "case_2", label: "Case 2", type: { kind: "Value" } },
      { key: "case_3", label: "Case 3", type: { kind: "Value" } }
    ],
    configFields: [
      { key: "case_0", label: "Match Case 0", type: "text", placeholder: "ex.: NOVO" },
      { key: "case_1", label: "Match Case 1", type: "text", placeholder: "ex.: DISPONIVEL" },
      { key: "case_2", label: "Match Case 2", type: "text", placeholder: "ex.: VENDIDO" },
      { key: "case_3", label: "Match Case 3", type: "text" }
    ]
  },

  // ========================== COMPUTACAO ===========================
  Filter: {
    type: "Filter",
    label: "Filtro por coluna",
    description: "Mantem apenas as linhas onde a coluna casa com o operador e o valor.",
    category: "computation",
    component: RegistryNode,
    inputs: [{ key: "input", label: "Entrada", type: { kind: "RowList" } }],
    outputs: [{ key: "result", label: "Resultado", type: { kind: "RowList" } }],
    configFields: [
      {
        key: "column",
        label: "Coluna",
        type: "column-select",
        sheetFrom: { inputSocket: "input" },
        allowCustom: true,
        placeholder: "ex.: local"
      },
      { key: "operator", label: "Operador", type: "select", options: COMPARE_OPERATORS, defaultValue: "eq" },
      { key: "value", label: "Valor", type: "text", placeholder: "ex.: Loja 1" }
    ]
  },
  ColumnPick: {
    type: "ColumnPick",
    label: "Extrair coluna",
    description: "Extrai o valor de uma coluna especifica de uma linha. Use dentro de ForEach.",
    category: "computation",
    component: RegistryNode,
    inputs: [{ key: "row", label: "Linha", type: { kind: "Row" } }],
    outputs: [{ key: "value", label: "Valor", type: { kind: "Value" } }],
    configFields: [
      {
        key: "column",
        label: "Coluna",
        type: "column-select",
        sheetFrom: { inputSocket: "row" },
        allowCustom: true,
        placeholder: "ex.: placa"
      }
    ]
  },
  Compare: {
    type: "Compare",
    label: "Comparar (legado)",
    description:
      "Compara dois valores e devolve um booleano. PREFERIR If — que tem comparacao embutida + ramificacao. Mantido pra retrocompat de fluxos antigos.",
    category: "computation",
    component: RegistryNode,
    inputs: [
      { key: "left", label: "Esquerda", type: { kind: "Value" } },
      { key: "right", label: "Direita", type: { kind: "Value" } }
    ],
    outputs: [{ key: "result", label: "Resultado", type: { kind: "Boolean" } }],
    configFields: [
      { key: "operator", label: "Operador", type: "select", options: COMPARE_OPERATORS, defaultValue: "eq" }
    ]
  },
  If: {
    type: "If",
    label: "If (comparar e ramificar)",
    description:
      "Compara `left` com `right` (literal ou input) usando o operador. Encaminha `value` (default = left) pra 'then' se verdadeiro, pra 'else' se falso. Substitui o antigo If + Compare separados.",
    category: "computation",
    component: RegistryNode,
    inputs: [
      { key: "left", label: "Esquerda", type: { kind: "Value" } },
      { key: "right", label: "Direita (opcional)", type: { kind: "Value" } },
      { key: "value", label: "Valor a ramificar (opcional)", type: { kind: "Value" } }
    ],
    outputs: [
      { key: "then_value", label: "Then", type: { kind: "Value" } },
      { key: "else_value", label: "Else", type: { kind: "Value" } },
      { key: "result", label: "Resultado (bool)", type: { kind: "Boolean" } }
    ],
    configFields: [
      { key: "operator", label: "Operador", type: "select", options: COMPARE_OPERATORS, defaultValue: "eq" },
      { key: "right_literal", label: "Valor de comparacao (se input direita nao ligado)", type: "text", placeholder: 'ex.: "ATIVO" ou 100' }
    ]
  },
  SetVariable: {
    type: "SetVariable",
    label: "SetVariable",
    description: "Grava 'value' na variavel 'name' do user. Persiste cross-flow ao final da run. Recusa nomes com prefixo 'system.'.",
    category: "computation",
    component: RegistryNode,
    inputs: [
      { key: "name", label: "Nome", type: { kind: "String" } },
      { key: "value", label: "Valor", type: { kind: "Value" } }
    ],
    outputs: [{ key: "value", label: "Valor", type: { kind: "Value" } }],
    configFields: [
      { key: "name", label: "Nome (se input nao ligado)", type: "text", placeholder: "ex.: contador_geral" }
    ]
  },
  GetVariable: {
    type: "GetVariable",
    label: "GetVariable",
    description: "Le a variavel 'name' do user. Inclui namespace 'system.*' (read-only: selected_rows, hidden_rows, active_sheet, user_role, user_id).",
    category: "computation",
    component: RegistryNode,
    inputs: [{ key: "name", label: "Nome", type: { kind: "String" } }],
    outputs: [{ key: "value", label: "Valor", type: { kind: "Value" } }],
    configFields: [
      { key: "name", label: "Nome (se input nao ligado)", type: "text", placeholder: "ex.: system.selected_rows" }
    ]
  },

  // ============================ TAGs ===============================
  TagSelecionar: {
    type: "TagSelecionar",
    label: "TAG: Selecionar",
    description: "Seleciona as linhas no grid. Pausa o fluxo aguardando 'Liberar' do usuario.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },
  TagOcultar: {
    type: "TagOcultar",
    label: "TAG: Ocultar",
    description: "Oculta as linhas no grid (toggle hide). Pausa o fluxo aguardando 'Liberar'.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },
  TagMarcarConferencia: {
    type: "TagMarcarConferencia",
    label: "TAG: Marcar conferencia",
    description: "Marca as linhas como conferidas. Pausa o fluxo aguardando 'Liberar'.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },
  TagDesmarcarConferencia: {
    type: "TagDesmarcarConferencia",
    label: "TAG: Desmarcar conferencia",
    description: "Desmarca as linhas de conferencia. Pausa o fluxo aguardando 'Liberar'.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },
  TagAlteracaoEmMassa: {
    type: "TagAlteracaoEmMassa",
    label: "TAG: Alteracao em massa",
    description: "Abre o dialog de alteracao em massa com as linhas como selecao. Pausa ate o usuario submeter ou cancelar.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },
  TagImprimir: {
    type: "TagImprimir",
    label: "TAG: Imprimir",
    description: "Abre o print composer com as linhas pre-selecionadas via filtro ancora. Pausa ate o usuario imprimir ou fechar.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },
  TagExcluir: {
    type: "TagExcluir",
    label: "TAG: Excluir (DESTRUTIVA)",
    description: "Exclui as linhas via /api/v1/grid/[table]. Revalida canDelete a cada execucao. Pausa antes pra confirmacao.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },
  TagFinalizar: {
    type: "TagFinalizar",
    label: "TAG: Finalizar (carros, GERENTE+)",
    description: "Finaliza os carros (snapshot historico em finalizados). Exige role GERENTE+ revalidada a cada execucao.",
    category: "tag",
    component: RegistryNode,
    inputs: [{ key: "rows", label: "Linhas", type: { kind: "RowList" } }],
    outputs: [],
    configFields: [...TAG_BASE_CONFIG_FIELDS]
  },

  // =========================== MASTERIZADOR ========================
  Masterizador: {
    type: "Masterizador",
    label: "Masterizador",
    description:
      "Transforma dados: cria saidas custom com nome/tipo/expression livres. Use ${input.field}, ${input[0]}, ${var.nested} pra acessar dados; tipos string/number/boolean controlam o cast.",
    category: "computation",
    component: RegistryNode,
    inputs: [{ key: "input", label: "Entrada", type: { kind: "Value" } }],
    outputs: [],
    supportsCustomOutputs: true,
    configFields: []
  },

  // ============================== UTIL =============================
  LogNode: {
    type: "LogNode",
    label: "Log (dry-run)",
    description:
      "Imprime no console do dry-run. Prefixo aceita placeholders: ${value} pra Value/primitivo, ${col} pra campo de Row, ${count}/${first.col} pra RowList, ${var} pra variavel user.",
    category: "computation",
    component: RegistryNode,
    inputs: [{ key: "input", label: "Entrada", type: { kind: "Value" } }],
    outputs: [],
    configFields: [
      {
        key: "prefix",
        label: "Prefixo / Template",
        type: "template",
        inputSocket: "input",
        placeholder: 'ex.: "Veiculo ${id} (${placa})"'
      }
    ]
  }
};

export function getRegistryEntry(type: string): NodeRegistryEntry | undefined {
  return NODE_REGISTRY[type];
}

/**
 * Combina outputs estaticos + dynamicOutputs num array linear pra
 * renderizacao/conexao. Usado pelo registry-node, isValidConnection, etc.
 * Cada item tem `kind: "static"` ou `kind: "dynamic"` pra UI diferenciar.
 */
export type ResolvedOutput = {
  key: string;
  label: string;
  type: FlowSocketType;
  kind: "static" | "dynamic";
  dynamicMeta?: import("@/components/editor/types").DynamicOutputSocket;
};

export function getEffectiveOutputs(
  entry: NodeRegistryEntry,
  node: import("@/components/editor/types").FlowNode
): ResolvedOutput[] {
  const out: ResolvedOutput[] = entry.outputs.map((s) => ({
    key: s.key,
    label: s.label,
    type: s.type,
    kind: "static"
  }));
  if (node.dynamicOutputs) {
    for (const dyno of node.dynamicOutputs) {
      out.push({
        key: dyno.id,
        label: dyno.label,
        type: dyno.type,
        kind: "dynamic",
        dynamicMeta: dyno
      });
    }
  }
  return out;
}

export function listRegistryByCategory() {
  const groups: Record<NodeCategory, NodeRegistryEntry[]> = {
    source: [],
    structural: [],
    computation: [],
    tag: []
  };
  for (const entry of Object.values(NODE_REGISTRY)) {
    groups[entry.category].push(entry);
  }
  return groups;
}

// Map shape esperado por <ReactFlow nodeTypes={...} />.
// Todos os nos usam o mesmo componente generico RegistryNode.
export function buildReactFlowNodeTypes() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, ComponentType<any>> = {};
  for (const entry of Object.values(NODE_REGISTRY)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out[entry.type] = entry.component as ComponentType<any>;
  }
  return out;
}
