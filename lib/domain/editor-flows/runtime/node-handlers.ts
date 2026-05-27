/**
 * Handlers de execucao por tipo de node.
 *
 * Cada handler recebe os inputs ja resolvidos (RuntimeValue por socket-key) +
 * o config do node + o DataSource + um logger, e devolve o mapa de outputs
 * (socket-key -> RuntimeValue).
 *
 * Handlers de structural nodes (ForEach/While) NAO vivem aqui — eles dirigem
 * a propria iteracao no interpreter.ts.
 */

import type { DataSource, FlowRow, LogEntry, RuntimeValue } from "@/lib/domain/editor-flows/runtime/types";

export type NodeHandlerInput = {
  config: Record<string, unknown>;
  inputs: Record<string, RuntimeValue | undefined>;
  dataSource: DataSource;
  appendLog: (entry: Omit<LogEntry, "ts">) => void;
  nodeId: string;
  /**
   * Map de variaveis user-scoped + system.* (read-only).
   * Mutadas via SetVariable handler; pre-populadas no construtor do interpreter.
   */
  userVariables: Map<string, RuntimeValue>;
  /** Marca uma variavel como dirty pra batch-upsert futura. */
  markVariableDirty: (name: string) => void;
  /**
   * Sockets de saida dinamicos adicionados pelo usuario via "+". Sources com
   * `supportsColumnEject` leem aqui pra emitir RowList por coluna ejetada.
   */
  dynamicOutputs?: Array<{
    id: string;
    kind: "intrinsic" | "column" | "mapper";
    intrinsicKey?: string;
    fieldName?: string;
    expression?: string;
    outputType?: "string" | "number" | "boolean" | "value";
  }>;
  /**
   * Campos disponiveis no nivel atual da execucao: row da iteracao do ForEach
   * ancestral mais proximo. Usado por `interpolatePlaceholders` pra resolver
   * `${id}`, `${placa}` etc. mesmo quando o input do node nao e o Row inteiro.
   * Vazio quando o node nao esta dentro de nenhum ForEach.
   */
  frameContext?: Record<string, unknown>;
};

export type NodeHandlerOutput = Record<string, RuntimeValue>;

// --- utilitarios ---

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function unwrap(value: RuntimeValue | undefined): unknown {
  if (!value) return undefined;
  switch (value.kind) {
    case "value":
      return value.raw;
    case "boolean":
      return value.value;
    case "number":
      return value.value;
    case "string":
      return value.value;
    case "row":
      return value.data;
    case "rowList":
      return value.rows;
    case "void":
      return undefined;
  }
}

export function wrapValue(raw: unknown): RuntimeValue {
  if (typeof raw === "boolean") return { kind: "boolean", value: raw };
  if (typeof raw === "number") return { kind: "number", value: raw };
  if (typeof raw === "string") return { kind: "string", value: raw };
  return { kind: "value", raw };
}

function compareValues(left: unknown, right: unknown, operator: string): boolean {
  switch (operator) {
    case "eq":
      return String(left ?? "") === String(right ?? "");
    case "neq":
      return String(left ?? "") !== String(right ?? "");
    case "lt": {
      const l = asNumber(left);
      const r = asNumber(right);
      return l !== null && r !== null && l < r;
    }
    case "lte": {
      const l = asNumber(left);
      const r = asNumber(right);
      return l !== null && r !== null && l <= r;
    }
    case "gt": {
      const l = asNumber(left);
      const r = asNumber(right);
      return l !== null && r !== null && l > r;
    }
    case "gte": {
      const l = asNumber(left);
      const r = asNumber(right);
      return l !== null && r !== null && l >= r;
    }
    case "contains":
      return asString(left).toLowerCase().includes(asString(right).toLowerCase());
    case "starts_with":
      return asString(left).toLowerCase().startsWith(asString(right).toLowerCase());
    default:
      return false;
  }
}

// --- handlers ---

export async function handleConstantNode(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const raw = ctx.config.value;
  return { value: wrapValue(raw) };
}

/**
 * Pra Sources com `supportsColumnEject`: emite outputs adicionais por cada
 * coluna que o user adicionou via "+" no node. Cada output e um RowList<Row>
 * onde cada row tem apenas o campo da coluna ejetada — mantem shape RowList
 * consistente, permite alimentar ForEach/ColumnPick downstream.
 *
 * `dynamicOutputs` vive em ctx.config.__dynamicOutputs (injetado pelo
 * interpreter em evaluateRegular). Sources nao tem inputs, entao a unica
 * fonte da columna sao os `rows` ja resolvidos.
 */
function attachColumnEjectOutputs(
  ctx: NodeHandlerInput,
  rows: FlowRow[],
  sheet: string | undefined,
  baseOutputs: NodeHandlerOutput
): NodeHandlerOutput {
  const dynamicOutputs = ctx.dynamicOutputs;
  if (!dynamicOutputs || dynamicOutputs.length === 0) return baseOutputs;
  const out: NodeHandlerOutput = { ...baseOutputs };
  for (const dyno of dynamicOutputs) {
    if (dyno.kind !== "column" || !dyno.fieldName) continue;
    const column = dyno.fieldName;
    out[dyno.id] = {
      kind: "rowList",
      sheet,
      rows: rows.map((row) => ({ [column]: row[column] }))
    };
  }
  return out;
}

export async function handleBulkSelectSource(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const sheetKey = asString(ctx.config.sheet_key);
  const matchColumn = asString(ctx.config.match_column) || "placa";
  const tokensRaw = asString(ctx.config.tokens);
  const tokens = Array.from(
    new Set(
      tokensRaw
        .split(/[,;\s]+/)
        .map((token) => token.trim())
        .filter(Boolean)
    )
  );

  if (tokens.length === 0 || !sheetKey) {
    const empty: FlowRow[] = [];
    return attachColumnEjectOutputs(
      ctx,
      empty,
      sheetKey || undefined,
      { rows: { kind: "rowList", sheet: sheetKey || undefined, rows: empty } }
    );
  }

  const rows = await ctx.dataSource.matchRowsForBulkSelect(sheetKey, matchColumn, tokens);
  return attachColumnEjectOutputs(ctx, rows, sheetKey, {
    rows: { kind: "rowList", sheet: sheetKey, rows }
  });
}

export async function handleSelectedRowsSource(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const sheetKey = asString(ctx.config.sheet_key);
  if (!sheetKey) {
    return attachColumnEjectOutputs(ctx, [], undefined, {
      rows: { kind: "rowList", rows: [] }
    });
  }
  const rows = await ctx.dataSource.listSelectedRowsForSheet(sheetKey);
  return attachColumnEjectOutputs(ctx, rows, sheetKey, {
    rows: { kind: "rowList", sheet: sheetKey, rows }
  });
}

export async function handleAllRowsSource(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const sheetKey = asString(ctx.config.sheet_key);
  if (!sheetKey) {
    return attachColumnEjectOutputs(ctx, [], undefined, {
      rows: { kind: "rowList", rows: [] }
    });
  }
  const rows = await ctx.dataSource.listAllRowsForSheet(sheetKey);
  return attachColumnEjectOutputs(ctx, rows, sheetKey, {
    rows: { kind: "rowList", sheet: sheetKey, rows }
  });
}

export async function handleFilter(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const input = ctx.inputs["input"];
  if (!input || input.kind !== "rowList") {
    return { result: { kind: "rowList", rows: [] } };
  }
  const column = asString(ctx.config.column);
  const operator = asString(ctx.config.operator) || "eq";
  const targetValue = ctx.config.value;
  if (!column) {
    return { result: { kind: "rowList", sheet: input.sheet, rows: input.rows } };
  }
  const filtered = input.rows.filter((row: FlowRow) => compareValues(row[column], targetValue, operator));
  return { result: { kind: "rowList", sheet: input.sheet, rows: filtered } };
}

export async function handleColumnPick(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const input = ctx.inputs["row"];
  if (!input || input.kind !== "row") {
    return { value: { kind: "value", raw: undefined } };
  }
  const column = asString(ctx.config.column);
  if (!column) return { value: { kind: "value", raw: undefined } };
  return { value: wrapValue(input.data[column]) };
}

export async function handleCompare(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const left = unwrap(ctx.inputs["left"]);
  const right = unwrap(ctx.inputs["right"]);
  const operator = asString(ctx.config.operator) || "eq";
  return { result: { kind: "boolean", value: compareValues(left, right, operator) } };
}

/**
 * If poderoso: compara `left` com `right` (input ou literal config) usando
 * operator, e ramifica `value` (default = left) pra `then_value` ou `else_value`.
 * Tambem expoe `result` (boolean) pra debug. Substitui o uso de Compare + If
 * em sequencia.
 *
 * Retrocompat: se `inputs.condition` ainda vier conectado (flows antigos),
 * usamos ele como override direto da comparacao.
 */
export async function handleIf(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const conditionInput = ctx.inputs["condition"];
  let condBool: boolean;
  if (conditionInput && conditionInput.kind !== "void") {
    condBool =
      conditionInput.kind === "boolean" ? conditionInput.value : Boolean(unwrap(conditionInput));
  } else {
    const left = unwrap(ctx.inputs["left"]);
    const rightInput = ctx.inputs["right"];
    const right =
      rightInput && rightInput.kind !== "void" ? unwrap(rightInput) : ctx.config.right_literal;
    const operator = asString(ctx.config.operator) || "eq";
    condBool = compareValues(left, right, operator);
  }
  // value default = left input (permite usar If como filtro: passa o left adiante
  // pro lado correto sem precisar conectar value separadamente).
  const explicitValue = ctx.inputs["value"];
  const value: RuntimeValue =
    explicitValue && explicitValue.kind !== "void"
      ? explicitValue
      : ctx.inputs["left"] ?? { kind: "void" };

  return {
    then_value: condBool ? value : { kind: "void" },
    else_value: condBool ? { kind: "void" } : value,
    result: { kind: "boolean", value: condBool }
  };
}

export async function handleSwitch(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const input = ctx.inputs["input"];
  const rawInput = unwrap(input);
  const valueStr = asString(rawInput);
  // Tenta cada case configurado (case_0..case_3). O primeiro que casa ganha o
  // valor; demais (e default se houver match) recebem void.
  const out: NodeHandlerOutput = {
    default: { kind: "void" },
    case_0: { kind: "void" },
    case_1: { kind: "void" },
    case_2: { kind: "void" },
    case_3: { kind: "void" }
  };
  let matched = false;
  for (let i = 0; i < 4; i++) {
    const key = `case_${i}`;
    const match = asString(ctx.config[key]);
    if (!match) continue;
    if (!matched && valueStr === match) {
      out[key] = input ?? { kind: "void" };
      matched = true;
      break;
    }
  }
  if (!matched) {
    out.default = input ?? { kind: "void" };
  }
  return out;
}

// Reservado: variaveis `system.*` sao read-only (estado de grid/usuario).
const SYSTEM_VAR_PREFIX = "system.";

export async function handleSetVariable(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const name = asString(unwrap(ctx.inputs["name"]) ?? ctx.config.name).trim();
  if (!name) {
    ctx.appendLog({
      level: "warn",
      nodeId: ctx.nodeId,
      message: "SetVariable sem nome — ignorado."
    });
    return { value: { kind: "void" } };
  }
  if (name.toLowerCase().startsWith(SYSTEM_VAR_PREFIX)) {
    throw new Error(
      `SetVariable: nome '${name}' usa prefixo reservado 'system.' (read-only).`
    );
  }
  const value = ctx.inputs["value"];
  // Pula write se value e void/undefined — comum quando o SetVariable e
  // reavaliado no nivel externo depois de uma iteracao do ForEach. Sem isso,
  // o ultimo write da iteracao seria sobrescrito por void.
  if (!value || value.kind === "void") {
    return { value: { kind: "void" } };
  }
  ctx.userVariables.set(name, value);
  ctx.markVariableDirty(name);
  ctx.appendLog({
    level: "log",
    nodeId: ctx.nodeId,
    message: `[SetVariable] ${name} = ${JSON.stringify(unwrap(value))}`
  });
  return { value };
}

export async function handleGetVariable(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const name = asString(unwrap(ctx.inputs["name"]) ?? ctx.config.name).trim();
  if (!name) return { value: { kind: "void" } };
  const stored = ctx.userVariables.get(name);
  if (!stored) {
    // Variavel inexistente: retorna void. Logamos so para system.* (provavelmente erro do user).
    if (name.toLowerCase().startsWith(SYSTEM_VAR_PREFIX)) {
      ctx.appendLog({
        level: "warn",
        nodeId: ctx.nodeId,
        message: `[GetVariable] '${name}' nao populada — confira se DataSource expoe.`
      });
    }
    return { value: { kind: "void" } };
  }
  return { value: stored };
}

/**
 * Resolve `${expr}` em template. `expr` aceita:
 *   - `name` simples (lookup escalar)
 *   - `name.field` (acesso a campo de Row/objeto)
 *   - `name.field.nested` (chain)
 *   - `name[0]` (indice de array/RowList)
 *   - `name[0].field`, `name.field[0]` (combinacoes)
 *
 * Resolucao em ordem:
 *   1. `frameContext[name]` — row da iteracao do ForEach ancestral.
 *   2. `${value}` ou `${value.field}` — input bruto.
 *   3. `${count}` ou `${input.length}` pra RowList (tamanho).
 *   4. `${input.field}` se input e Row.
 *   5. `${first.<col>}` se input e RowList nao-vazia.
 *   6. `userVariables[name]`.
 *   7. Literal `${expr}` se nao resolveu nada.
 *
 * Suporta tambem `extraVars` (passado pelo Masterizador via inputs nomeados).
 */
function interpolatePlaceholders(
  template: string,
  input: RuntimeValue | undefined,
  userVariables: Map<string, RuntimeValue>,
  frameContext: Record<string, unknown> = {},
  extraVars: Record<string, unknown> = {}
): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, rawExpr: string) => {
    const expr = rawExpr.trim();
    const value = resolveExpression(expr, input, userVariables, frameContext, extraVars);
    if (value === undefined) return `\${${expr}}`;
    if (value === null) return "";
    return String(value);
  });
}

/**
 * Resolve uma expressao dotted/indexed contra os escopos disponiveis.
 * Devolve `undefined` se nao encontrou (caller substitui por literal).
 */
function resolveExpression(
  expr: string,
  input: RuntimeValue | undefined,
  userVariables: Map<string, RuntimeValue>,
  frameContext: Record<string, unknown>,
  extraVars: Record<string, unknown>
): unknown {
  const parts = parsePath(expr);
  if (parts.length === 0) return undefined;
  const [head, ...rest] = parts;
  // head sempre deve ser identificador (string) — paths nao podem comecar com [idx].
  if (typeof head !== "string") return undefined;

  // Resolve a "raiz" do path em algum escopo.
  let root: unknown;
  if (head in extraVars) {
    root = extraVars[head];
  } else if (head in frameContext) {
    root = frameContext[head];
  } else if (head === "value" && input && input.kind !== "void") {
    root = unwrap(input);
  } else if (head === "count" && input?.kind === "rowList") {
    root = input.rows.length;
  } else if (head === "input") {
    // Alias explicito pro input bruto. Pra RowList, mantem array iteravel
    // (input[0], input.length, etc.); pra row/escalar, unwrap normal.
    if (input?.kind === "rowList") root = input.rows;
    else root = input ? unwrap(input) : undefined;
  } else if (head === "first" && input?.kind === "rowList" && input.rows.length > 0) {
    root = input.rows[0];
  } else if (input?.kind === "row" && head in input.data) {
    root = input.data[head];
  } else if (userVariables.has(head)) {
    root = unwrap(userVariables.get(head));
  } else {
    return undefined;
  }

  // Walk pelas partes do path.
  let curr: unknown = root;
  for (const part of rest) {
    if (curr == null) return undefined;
    if (typeof part === "number") {
      if (!Array.isArray(curr)) return undefined;
      curr = curr[part];
    } else {
      if (typeof curr !== "object") return undefined;
      curr = (curr as Record<string, unknown>)[part];
    }
  }
  return curr;
}

/**
 * Parser simples pra `name.field[0].nested`. Retorna sequencia de strings (field)
 * e numbers (index). Falha graceful: tokens nao parseaveis viram strings literais.
 */
function parsePath(expr: string): Array<string | number> {
  const result: Array<string | number> = [];
  let i = 0;
  let token = "";
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ".") {
      if (token) result.push(token);
      token = "";
      i += 1;
      continue;
    }
    if (ch === "[") {
      if (token) result.push(token);
      token = "";
      i += 1;
      let idx = "";
      while (i < expr.length && expr[i] !== "]") {
        idx += expr[i];
        i += 1;
      }
      if (expr[i] === "]") i += 1;
      const n = Number(idx);
      if (Number.isFinite(n)) result.push(n);
      else result.push(idx);
      continue;
    }
    token += ch;
    i += 1;
  }
  if (token) result.push(token);
  return result;
}

/**
 * Masterizador: aplica `dynamicOutputs` com `kind: "mapper"` pra computar
 * cada output a partir de uma expression template (com `${input.field}` etc).
 * O tipo declarado (`outputType`) controla o cast do resultado.
 *
 * Quando o input e void E nao ha frameContext nem userVariables que poderiam
 * resolver placeholders, emite `void` em vez de string literal com `${...}`.
 * Isso evita o "extra log" pos-loop quando Masterizador esta dentro de body
 * de ForEach mas tambem e avaliado uma vez no escopo main (sem frame ativo).
 */
export async function handleMasterizador(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const input = ctx.inputs["input"];
  const out: NodeHandlerOutput = {};
  const hasContext = Boolean(
    (input && input.kind !== "void") ||
      (ctx.frameContext && Object.keys(ctx.frameContext).length > 0) ||
      ctx.userVariables.size > 0
  );
  for (const dyno of ctx.dynamicOutputs ?? []) {
    if (dyno.kind !== "mapper" || !dyno.expression) continue;
    // Expression sem placeholders: emite literal (string fixa, etc).
    if (!dyno.expression.includes("${")) {
      out[dyno.id] = castToOutput(dyno.expression, dyno.outputType ?? "value");
      continue;
    }
    // Expression com placeholders mas nenhum escopo disponivel: silencia.
    if (!hasContext) {
      out[dyno.id] = { kind: "void" };
      continue;
    }
    const interpolated = interpolatePlaceholders(
      dyno.expression,
      input,
      ctx.userVariables,
      ctx.frameContext
    );
    // Se TODOS os placeholders ficaram literais (nada resolveu), tambem
    // silencia — provavelmente avaliacao fora do escopo correto.
    if (interpolated.includes("${") && interpolated === dyno.expression) {
      out[dyno.id] = { kind: "void" };
      continue;
    }
    out[dyno.id] = castToOutput(interpolated, dyno.outputType ?? "value");
  }
  return out;
}

function castToOutput(raw: unknown, outputType: "string" | "number" | "boolean" | "value"): RuntimeValue {
  if (outputType === "string") return { kind: "string", value: raw == null ? "" : String(raw) };
  if (outputType === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return { kind: "number", value: Number.isFinite(n) ? n : 0 };
  }
  if (outputType === "boolean") {
    if (typeof raw === "boolean") return { kind: "boolean", value: raw };
    if (typeof raw === "string") {
      const lower = raw.trim().toLowerCase();
      return { kind: "boolean", value: lower === "true" || lower === "1" || lower === "yes" };
    }
    return { kind: "boolean", value: Boolean(raw) };
  }
  return wrapValue(raw);
}

export async function handleLogNode(ctx: NodeHandlerInput): Promise<NodeHandlerOutput> {
  const input = ctx.inputs["input"];
  const rawPrefix = asString(ctx.config.prefix) || "LOG";
  const hasTemplate = rawPrefix.includes("${");
  const hasContext =
    (ctx.frameContext && Object.keys(ctx.frameContext).length > 0) ||
    ctx.userVariables.size > 0;

  // Skip quando nao ha NADA pra logar:
  //  - input void/undefined E template nao resolve via frameContext/vars.
  // Se input e void mas template tem ${...} e ha contexto, segue pra
  // interpolar (caso comum: Log dentro do body sem edge cross-scope).
  if (!input || input.kind === "void") {
    if (!hasTemplate || !hasContext) return {};
  } else if (input.kind === "value" && (input.raw === undefined || input.raw === null)) {
    if (!hasTemplate || !hasContext) return {};
  }

  // Se prefix tem ${...}, interpola; senao usa literal (retrocompat).
  const prefix = hasTemplate
    ? interpolatePlaceholders(rawPrefix, input, ctx.userVariables, ctx.frameContext)
    : rawPrefix;

  let message: string;
  if (!input || input.kind === "void") {
    message = "";
  } else if (input.kind === "rowList") {
    message = `${input.rows.length} row(s)${input.sheet ? ` em ${input.sheet}` : ""}`;
    if (input.rows.length > 0 && input.rows.length <= 5) {
      message += `: ${JSON.stringify(input.rows)}`;
    }
  } else if (input.kind === "row") {
    message = JSON.stringify(input.data);
  } else {
    message = String(unwrap(input));
  }
  // Se prefix ja tem placeholders interpolados, nao adiciona "[prefix] ..." —
  // usa direto. Senao mantem formato [PREFIX] message classico.
  const finalMessage = rawPrefix.includes("${") ? prefix : `[${prefix}] ${message}`;
  ctx.appendLog({ level: "log", nodeId: ctx.nodeId, message: finalMessage });
  return {};
}

// --- registry de handlers ---

export type NodeHandler = (ctx: NodeHandlerInput) => Promise<NodeHandlerOutput>;

export const NODE_HANDLERS: Record<string, NodeHandler> = {
  ConstantNode: handleConstantNode,
  BulkSelectSource: handleBulkSelectSource,
  SelectedRowsSource: handleSelectedRowsSource,
  AllRowsSource: handleAllRowsSource,
  Filter: handleFilter,
  ColumnPick: handleColumnPick,
  Compare: handleCompare,
  If: handleIf,
  Switch: handleSwitch,
  SetVariable: handleSetVariable,
  GetVariable: handleGetVariable,
  Masterizador: handleMasterizador,
  LogNode: handleLogNode
};

export const STRUCTURAL_NODE_TYPES = new Set(["ForEach", "While"]);
