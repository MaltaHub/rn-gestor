/**
 * Tipos do runtime do editor de fluxos.
 *
 * O runtime e pull-based recursivo com pilha de frames (`StackFrame`) para
 * suportar ForEach/While aninhados. Cada frame fixa o contexto de iteracao,
 * e o cache de avaliacao e chaveado por (nodeId, frame-stack-signature),
 * garantindo que um mesmo nodo seja reavaliado em cada iteracao com a row
 * corrente diferente.
 *
 * Os valores em transito sao `RuntimeValue`, uma uniao discriminada por
 * `kind`. Conversoes acontecem nos handlers individuais (`unwrapValue`,
 * `wrapBoolean`, etc.). O type-checker do canvas (Fase 3) ja garante que
 * sockets so conectam tipos compativeis, entao os handlers podem assumir
 * shape conhecido sem revalidar.
 *
 * Os guardrails (`RuntimeLimits`) sao verificados pela classe interpretadora
 * a cada avaliacao de node: estouro vira `RuntimeError` com `code=LIMIT_EXCEEDED`.
 */

export type FlowRow = Record<string, unknown>;

export type RuntimeValue =
  | { kind: "rowList"; sheet?: string; rows: FlowRow[] }
  | { kind: "row"; sheet?: string; data: FlowRow }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "value"; raw: unknown }
  | { kind: "void" };

export type StackFrame =
  | { kind: "foreach"; nodeId: string; iterationIndex: number; rows: FlowRow[] }
  | { kind: "while"; nodeId: string; iterationCount: number };

export type RuntimeLimits = {
  maxIterations: number;
  maxStackDepth: number;
  maxTotalNodeExecutions: number;
};

export const DEFAULT_LIMITS: RuntimeLimits = {
  maxIterations: 10_000,
  maxStackDepth: 64,
  maxTotalNodeExecutions: 100_000
};

export type LogEntry = {
  ts: number;
  level: "log" | "warn" | "error";
  nodeId?: string;
  message: string;
};

export type RuntimeError = {
  code:
    | "LIMIT_EXCEEDED_ITERATIONS"
    | "LIMIT_EXCEEDED_STACK"
    | "LIMIT_EXCEEDED_TOTAL_EXECUTIONS"
    | "MISSING_INPUT"
    | "UNKNOWN_NODE_TYPE"
    | "INVALID_VALUE"
    | "NOT_IMPLEMENTED";
  message: string;
  nodeId?: string;
};

/**
 * DataSource: o runtime delega leitura de rows reais (selectedRows, allRows
 * do grid) para uma implementacao externa. No dry-run, usamos um DataSource
 * mock que emite arrays vazios e loga aviso. Em runtime real (Fase 6+), o
 * TagBridge fornece um DataSource ancorado no grid corrente.
 *
 * Fase 11: estendido com getters de estado do grid (sheet ativa, linhas
 * ocultas/marcadas, role do user) usados para popular system.* variables.
 */
export type DataSource = {
  listAllRowsForSheet: (sheetKey: string) => Promise<FlowRow[]>;
  listSelectedRowsForSheet: (sheetKey: string) => Promise<FlowRow[]>;
  /** Resolve o token (ex.: placa) para um row real da sheet. */
  matchRowsForBulkSelect: (sheetKey: string, matchColumn: string, tokens: string[]) => Promise<FlowRow[]>;
  /** Aba atualmente ativa no grid (null no editor / dry-run). */
  getActiveSheet?: () => Promise<string | null>;
  /** Linhas ocultas na sheet informada. Default vazio. */
  getHiddenRowsForSheet?: (sheetKey: string) => Promise<FlowRow[]>;
  /** Linhas marcadas como conferidas na sheet informada. Default vazio. */
  getConferenceRowsForSheet?: (sheetKey: string) => Promise<FlowRow[]>;
  /** Role do usuario atual (VENDEDOR, GERENTE, ADMINISTRADOR, etc.). */
  getUserRole?: () => Promise<string | null>;
  /** auth.users.id do usuario atual. */
  getUserId?: () => Promise<string | null>;
  /**
   * Snapshot atomico do estado de sistema (mais barato que chamar metodos
   * individuais). Usado pra popular system.* no inicio do run() e no resume.
   */
  getSystemContext?: () => Promise<SystemContext>;
};

/**
 * Estado de sistema exposto via variaveis `system.*` durante a run.
 * Read-only — `SetVariable` recusa nomes com prefixo `system.`.
 */
export type SystemContext = {
  active_sheet: string | null;
  selected_rows: FlowRow[];
  hidden_rows: FlowRow[];
  conference_rows: FlowRow[];
  user_role: string | null;
  user_id: string | null;
};

export type RunStatus = "completed" | "failed" | "paused";

/**
 * Identifica univocamente uma aplicacao de TAG no contexto da execucao.
 * `node_id` + `frame_signature` (mesma assinatura usada como cache key) garante
 * que cada iteracao de ForEach pause separadamente.
 */
export type AppliedTag = {
  node_id: string;
  frame_signature: string;
};

/**
 * Quando o runtime encontra uma TAG nao-aplicada, ele persiste estes dados e
 * pausa. O grid usa `tag_type` + `inputs` para chamar o handler real e exibir
 * o banner com o numero de linhas afetadas.
 */
export type TagPauseInfo = {
  node_id: string;
  tag_type: string;
  frame_signature: string;
  inputs: Record<string, RuntimeValue>;
  rows_affected: number;
};

export type RunResult = {
  status: RunStatus;
  logs: LogEntry[];
  error?: RuntimeError;
  paused?: TagPauseInfo;
  executionsCount: number;
  durationMs: number;
};
