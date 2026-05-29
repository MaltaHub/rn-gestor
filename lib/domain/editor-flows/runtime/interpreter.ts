/**
 * Interpretador do editor de fluxos.
 *
 * Modelo: pull-based recursivo com pilha de frames.
 *   - O run() identifica os sinks (nodos sem outputs ou cuja saida nao alimenta ninguem) e os avalia.
 *   - Cada nodo, ao ser avaliado, puxa recursivamente seus inputs pelas edges.
 *   - Structural nodes (ForEach/While) dirigem a propria iteracao: ForEach
 *     itera o RowList de entrada e re-avalia o subgrafo "do body" (todos os
 *     nodos alcancaveis a partir de seu output `current_row`) por iteracao,
 *     empurrando um frame para o stack.
 *   - O cache de outputs e chaveado por (nodeId + signature do stack), entao
 *     o mesmo nodo dentro de uma ForEach e reavaliado por iteracao mas
 *     mantem cache nos demais contextos.
 *
 * Guardrails:
 *   - maxIterations por loop estrutural,
 *   - maxStackDepth do frame stack,
 *   - maxTotalNodeExecutions cumulativo da run.
 *   Estourando algum vira RuntimeError code=LIMIT_EXCEEDED_*.
 *
 * Phase 4: While esta marcado mas o handler nao implementa avancos de iteracao
 * (necessita state externo / persistencia, vem na Phase 5). ForEach funciona.
 */

import {
  DEFAULT_LIMITS,
  type AppliedTag,
  type DataSource,
  type FlowRow,
  type LogEntry,
  type RunResult,
  type RuntimeError,
  type RuntimeLimits,
  type RuntimeValue,
  type StackFrame,
  type TagPauseInfo
} from "@/lib/domain/editor-flows/runtime/types";
import { NODE_HANDLERS, STRUCTURAL_NODE_TYPES, wrapValue } from "@/lib/domain/editor-flows/runtime/node-handlers";
import { getMockRowsForSheet } from "@/lib/domain/editor-flows/runtime/mock-data";
import { TAG_NODE_TYPES, type TagBridge } from "@/lib/domain/editor-flows/runtime/tag-bridge";
import type { FlowEdge, FlowGraph, FlowNode } from "@/components/editor/types";

class InterpreterError extends Error {
  constructor(public readonly runtimeError: RuntimeError) {
    super(runtimeError.message);
  }
}

/**
 * Sinal interno: lancado quando o interpretador encontra uma TAG que ainda
 * nao foi aplicada nesta execucao (nao consta em `appliedTags`). O `run()`
 * captura e devolve `status="paused"` com os dados pra UI/bridge aplicar.
 */
class TagPauseSignal {
  constructor(public readonly info: TagPauseInfo) {}
}

type EvaluationOutputs = Record<string, RuntimeValue>;

export type InterpreterOptions = {
  limits?: Partial<RuntimeLimits>;
  appliedTags?: AppliedTag[];
  /**
   * Bridge para aplicar TAGs inline quando `requires_human=false`.
   * No editor dry-run e null; no grid (holistic-sheet) e injetado.
   */
  tagBridge?: TagBridge | null;
  /**
   * Variaveis pre-existentes do user (Set inicial). Populado por
   * startFlowRun/claimFlowRun a partir de `editor_user_variables`. As do
   * namespace `system.*` sao sobrescritas no run() via dataSource.getSystemContext().
   */
  userVariables?: Record<string, RuntimeValue>;
};

export class FlowInterpreter {
  /**
   * Pilha de graphs aninhados. Topo = graph corrente sendo avaliado (pode ser
   * a raiz OU um body de algum ForEach/While). Base = graph raiz, sempre
   * presente. Empilhado/desempilhado via `withBody()` durante iteracao.
   */
  private graphStack: FlowGraph[];
  private dataSource: DataSource;
  private limits: RuntimeLimits;
  private logs: LogEntry[] = [];
  private executionsCount = 0;
  /**
   * Cache global de outputs por (nodeId + frameSignature + bodyDepth).
   * Embaixo profundidade entra no key porque o mesmo nodeId pode existir em
   * bodies diferentes — sem distinguir por depth haveria colisao.
   */
  private cache = new Map<string, EvaluationOutputs>();
  /** TAGs ja aplicadas nesta run (do contexto persistido). */
  private appliedTagsSet: Set<string>;
  /** Bridge pra TAG dinamica (requires_human=false). Null no dry-run. */
  private tagBridge: TagBridge | null;
  /** Map de variaveis user-scoped + system.*. Pre-populadas + mutadas durante run. */
  private userVariables: Map<string, RuntimeValue>;
  /** Set de nomes mutados via SetVariable nesta run. Lido por holistic-sheet ao final. */
  private dirtyVars: Set<string> = new Set();

  constructor(graph: FlowGraph, dataSource: DataSource, options?: Partial<RuntimeLimits> | InterpreterOptions) {
    this.graphStack = [graph];
    this.dataSource = dataSource;
    // Compat: a assinatura aceita `Partial<RuntimeLimits>` direto (Phase 4) ou um objeto `InterpreterOptions`.
    const opts: InterpreterOptions =
      options &&
      ("appliedTags" in options ||
        "limits" in options ||
        "tagBridge" in options ||
        "userVariables" in options)
        ? (options as InterpreterOptions)
        : { limits: (options ?? {}) as Partial<RuntimeLimits> };
    this.limits = { ...DEFAULT_LIMITS, ...(opts.limits ?? {}) };
    this.appliedTagsSet = new Set((opts.appliedTags ?? []).map((tag) => `${tag.node_id}@${tag.frame_signature}`));
    this.tagBridge = opts.tagBridge ?? null;
    this.userVariables = new Map(Object.entries(opts.userVariables ?? {}));
  }

  /**
   * Variaveis mutadas via SetVariable nesta run. Snapshot pra flush em batch.
   * Filtra system.* (read-only, nao persistir).
   */
  getMutatedVariables(): Array<{ name: string; value: RuntimeValue }> {
    const out: Array<{ name: string; value: RuntimeValue }> = [];
    for (const name of this.dirtyVars) {
      if (name.toLowerCase().startsWith("system.")) continue;
      const value = this.userVariables.get(name);
      if (value) out.push({ name, value });
    }
    return out;
  }

  async run(): Promise<RunResult> {
    const startedAt = Date.now();
    try {
      await this.populateSystemVariables();
      const sinks = this.findSinks();
      for (const sink of sinks) {
        await this.evaluateNode(sink.id, []);
      }
      return {
        status: "completed",
        logs: this.logs,
        executionsCount: this.executionsCount,
        durationMs: Date.now() - startedAt
      };
    } catch (err) {
      if (err instanceof TagPauseSignal) {
        return {
          status: "paused",
          logs: this.logs,
          paused: err.info,
          executionsCount: this.executionsCount,
          durationMs: Date.now() - startedAt
        };
      }
      if (err instanceof InterpreterError) {
        return {
          status: "failed",
          logs: this.logs,
          error: err.runtimeError,
          executionsCount: this.executionsCount,
          durationMs: Date.now() - startedAt
        };
      }
      const message = err instanceof Error ? err.message : "Erro desconhecido.";
      return {
        status: "failed",
        logs: this.logs,
        error: { code: "INVALID_VALUE", message },
        executionsCount: this.executionsCount,
        durationMs: Date.now() - startedAt
      };
    }
  }

  /**
   * Popula system.* via dataSource.getSystemContext() no inicio do run().
   * Sobrescreve qualquer valor previamente injetado em userVariables — system.*
   * sao read-only, sempre refletem o estado atual.
   */
  private async populateSystemVariables(): Promise<void> {
    if (!this.dataSource.getSystemContext) return;
    const sys = await this.dataSource.getSystemContext();
    this.userVariables.set("system.active_sheet", { kind: "value", raw: sys.active_sheet });
    this.userVariables.set("system.selected_rows", {
      kind: "rowList",
      sheet: sys.active_sheet ?? undefined,
      rows: sys.selected_rows
    });
    this.userVariables.set("system.hidden_rows", {
      kind: "rowList",
      sheet: sys.active_sheet ?? undefined,
      rows: sys.hidden_rows
    });
    this.userVariables.set("system.conference_rows", {
      kind: "rowList",
      sheet: sys.active_sheet ?? undefined,
      rows: sys.conference_rows
    });
    this.userVariables.set("system.user_role", { kind: "value", raw: sys.user_role });
    this.userVariables.set("system.user_id", { kind: "value", raw: sys.user_id });
  }

  /** Graph corrente sendo avaliado (topo da pilha). */
  private get currentGraph(): FlowGraph {
    return this.graphStack[this.graphStack.length - 1];
  }

  /**
   * Empilha um body durante avaliacao da iteracao, garantindo desempilhamento
   * mesmo em caso de erro/pause. Permite a `findSinks`/`getEdgesIntoNode`/
   * `evaluateNode` operarem no graph correto.
   */
  private async withBody<T>(body: FlowGraph, fn: () => Promise<T>): Promise<T> {
    this.graphStack.push(body);
    try {
      return await fn();
    } finally {
      this.graphStack.pop();
    }
  }

  private findSinks(): FlowNode[] {
    const g = this.currentGraph;
    const hasOutgoing = new Set(g.edges.map((edge) => edge.source));
    return g.nodes.filter((node) => !hasOutgoing.has(node.id));
  }

  private getEdgesIntoNode(targetId: string): FlowEdge[] {
    // Edges sao buscadas no graph ONDE O NODE VIVE (respeitando escopo lexical).
    // Se o node esta no parent (acessado via edge cross-scope do body), as edges
    // entrantes dele estao no parent tambem — nao no currentGraph.
    const located = this.findNodeInScope(targetId);
    if (!located) return [];
    return this.graphStack[located.graphIndex].edges.filter(
      (edge) => edge.target === targetId
    );
  }

  /**
   * Busca um node no graph corrente; se nao acha, sobe a pilha de graphs ate
   * achar (escopo lexical). Permite edges DENTRO de um body referenciarem
   * nodes do parent (ex.: ColumnPick.row <- ForEach.current_row, com pick
   * dentro do body e ForEach no parent). Retorna `[graphIndex, node]` ou null.
   */
  private findNodeInScope(nodeId: string): { graphIndex: number; node: FlowNode } | null {
    for (let i = this.graphStack.length - 1; i >= 0; i -= 1) {
      const found = this.graphStack[i].nodes.find((n) => n.id === nodeId);
      if (found) return { graphIndex: i, node: found };
    }
    return null;
  }

  private frameSignature(frames: StackFrame[]): string {
    return frames
      .map((frame) => {
        if (frame.kind === "foreach") return `fe:${frame.nodeId}:${frame.iterationIndex}`;
        return `wh:${frame.nodeId}:${frame.iterationCount}`;
      })
      .join("|");
  }

  private cacheKey(nodeId: string, frames: StackFrame[]): string {
    // Inclui graphStack depth pra evitar colisao entre nodes com mesmo id em
    // bodies diferentes. Frame signature ja garante isolamento por iteracao.
    return `d${this.graphStack.length}|${nodeId}@${this.frameSignature(frames)}`;
  }

  private checkLimits(frames: StackFrame[], nodeId: string) {
    if (frames.length > this.limits.maxStackDepth) {
      throw new InterpreterError({
        code: "LIMIT_EXCEEDED_STACK",
        message: `Stack profundidade excedeu o limite (${this.limits.maxStackDepth}).`,
        nodeId
      });
    }
  }

  private tickExecution(nodeId: string) {
    if (this.executionsCount >= this.limits.maxTotalNodeExecutions) {
      throw new InterpreterError({
        code: "LIMIT_EXCEEDED_TOTAL_EXECUTIONS",
        message: `Total de execucoes de nodes excedeu o limite (${this.limits.maxTotalNodeExecutions}).`,
        nodeId
      });
    }
    this.executionsCount += 1;
  }

  private async resolveInput(
    targetNodeId: string,
    inputKey: string,
    frames: StackFrame[]
  ): Promise<RuntimeValue | undefined> {
    const edges = this.getEdgesIntoNode(targetNodeId);
    const edge = edges.find((e) => (e.targetHandle ?? "") === inputKey);
    if (!edge) return undefined;
    const sourceOutputs = await this.evaluateNode(edge.source, frames);
    return sourceOutputs[edge.sourceHandle ?? ""];
  }

  private async evaluateNode(nodeId: string, frames: StackFrame[]): Promise<EvaluationOutputs> {
    this.checkLimits(frames, nodeId);

    // Busca node no escopo lexical (currentGraph primeiro, sobe stack se preciso).
    // Permite edges no body referenciarem nodes do parent — essencial pra que
    // ColumnPick dentro do body possa ler ForEach.current_row do parent.
    const located = this.findNodeInScope(nodeId);
    if (!located) {
      throw new InterpreterError({ code: "UNKNOWN_NODE_TYPE", message: `Node ${nodeId} nao encontrado.` });
    }
    const { graphIndex, node } = located;

    // Cache key inclui depth onde o NODE vive (graphIndex), nao depth corrente.
    // Sem isso, avaliar ForEach do parent dentro do body cacheia com depth do
    // body — proxima leitura do mesmo ForEach (em outra iteracao do body) faria
    // miss errado.
    const cacheKey = `d${graphIndex}|${nodeId}@${this.frameSignature(frames)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let outputs: EvaluationOutputs;

    if (STRUCTURAL_NODE_TYPES.has(node.type)) {
      outputs = await this.evaluateStructural(node, frames);
    } else if (TAG_NODE_TYPES.has(node.type)) {
      outputs = await this.evaluateTag(node, frames);
    } else {
      outputs = await this.evaluateRegular(node, frames);
    }

    this.cache.set(cacheKey, outputs);
    return outputs;
  }

  private async evaluateTag(node: FlowNode, frames: StackFrame[]): Promise<EvaluationOutputs> {
    const frameSig = this.frameSignature(frames);
    const tagKey = `${node.id}@${frameSig}`;

    // TAG ja aplicada nesta run (resume) → curto-circuito.
    if (this.appliedTagsSet.has(tagKey)) {
      this.tickExecution(node.id);
      return {};
    }

    // Ainda nao aplicada: resolve inputs.
    const inputs: Record<string, RuntimeValue | undefined> = {};
    const inputKeys = this.getEntryInputKeys(node);
    for (const inputKey of inputKeys) {
      inputs[inputKey] = await this.resolveInput(node.id, inputKey, frames);
    }

    const rowsInput = inputs["rows"];
    const rowsAffected = rowsInput && rowsInput.kind === "rowList" ? rowsInput.rows.length : 0;

    const cleanInputs: Record<string, RuntimeValue> = {};
    for (const [k, v] of Object.entries(inputs)) {
      if (v) cleanInputs[k] = v;
    }

    // Fase 9: TAG dinamica. Se requires_human=false e bridge disponivel,
    // aplica inline e continua. Se bridge null (dry-run), gera warn e simula
    // como aplicada (nao pausa).
    const requiresHuman = node.config?.requires_human;
    const isDynamic = requiresHuman === false;
    if (isDynamic) {
      if (this.tagBridge) {
        try {
          await this.applyTagInline(node.type, rowsInput);
          this.appliedTagsSet.add(tagKey);
          this.tickExecution(node.id);
          this.logs.push({
            ts: Date.now(),
            level: "log",
            nodeId: node.id,
            message: `[TAG ${node.type}] aplicada inline (requires_human=false, ${rowsAffected} row(s))`
          });
          return {};
        } catch (err) {
          throw new InterpreterError({
            code: "INVALID_VALUE",
            message: err instanceof Error ? err.message : "Falha ao aplicar TAG inline.",
            nodeId: node.id
          });
        }
      }
      // Dry-run: simula como aplicada (nao chama bridge).
      this.appliedTagsSet.add(tagKey);
      this.tickExecution(node.id);
      this.logs.push({
        ts: Date.now(),
        level: "warn",
        nodeId: node.id,
        message: `[TAG ${node.type}] simulada (sem bridge, dry-run) — ${rowsAffected} row(s)`
      });
      return {};
    }

    // Default: pausa esperando intervencao humana.
    throw new TagPauseSignal({
      node_id: node.id,
      tag_type: node.type,
      frame_signature: frameSig,
      inputs: cleanInputs,
      rows_affected: rowsAffected
    });
  }

  /**
   * Aplica uma TAG inline via o bridge. Roteia pelo tag_type pro metodo
   * correspondente. Usado quando `requires_human=false` durante a run.
   */
  private async applyTagInline(tagType: string, rowsInput: RuntimeValue | undefined): Promise<void> {
    if (!this.tagBridge) throw new Error("TagBridge nao disponivel.");
    const rows = rowsInput && rowsInput.kind === "rowList" ? rowsInput.rows : [];
    const sheet_key = rowsInput && rowsInput.kind === "rowList" ? rowsInput.sheet ?? null : null;
    switch (tagType) {
      case "TagSelecionar":
        return this.tagBridge.applyTagSelecionar({ rows, sheet_key });
      case "TagOcultar":
        return this.tagBridge.applyTagOcultar({ rows, sheet_key });
      case "TagMarcarConferencia":
        return this.tagBridge.applyTagMarcarConferencia({ rows, sheet_key });
      case "TagDesmarcarConferencia":
        return this.tagBridge.applyTagDesmarcarConferencia({ rows, sheet_key });
      case "TagAlteracaoEmMassa":
        return this.tagBridge.applyTagAlteracaoEmMassa({ rows, sheet_key });
      case "TagImprimir":
        return this.tagBridge.applyTagImprimir({ rows, sheet_key });
      case "TagExcluir":
        return this.tagBridge.applyTagExcluir({ rows, sheet_key });
      case "TagFinalizar":
        return this.tagBridge.applyTagFinalizar({ rows, sheet_key });
      default:
        throw new Error(`TAG type desconhecido: ${tagType}`);
    }
  }

  private async evaluateRegular(node: FlowNode, frames: StackFrame[]): Promise<EvaluationOutputs> {
    const handler = NODE_HANDLERS[node.type];
    if (!handler) {
      throw new InterpreterError({
        code: "UNKNOWN_NODE_TYPE",
        message: `Sem handler para tipo '${node.type}'.`,
        nodeId: node.id
      });
    }

    // Se o nodo for um output do ForEach (current_row), resolvemos do frame ativo.
    // ForEach injeta `current_row` via override no cache: o frame conhece a row,
    // e quando o nodo ForEach for avaliado neste contexto, retorna a row do frame.
    // (Isso e tratado em evaluateStructural; aqui apenas resolve normais.)

    const inputs: Record<string, RuntimeValue | undefined> = {};
    const entrySockets = this.getEntryInputKeys(node);
    for (const inputKey of entrySockets) {
      inputs[inputKey] = await this.resolveInput(node.id, inputKey, frames);
    }

    this.tickExecution(node.id);
    return handler({
      config: node.config ?? {},
      inputs,
      dataSource: this.dataSource,
      appendLog: (entry) => this.logs.push({ ...entry, ts: Date.now() }),
      nodeId: node.id,
      userVariables: this.userVariables,
      markVariableDirty: (name) => this.dirtyVars.add(name),
      dynamicOutputs: node.dynamicOutputs?.map((dyno) => ({
        id: dyno.id,
        kind: dyno.kind,
        intrinsicKey: dyno.intrinsicKey,
        fieldName: dyno.fieldName,
        expression: dyno.expression,
        outputType: dyno.outputType
      })),
      frameContext: this.buildFrameContext(frames)
    });
  }

  /**
   * Pega a row da iteracao do ForEach ancestral mais proximo. Permite que nodes
   * dentro de um body acessem campos da iteracao corrente via interpolacao
   * `${name}` — independente do que esta conectado no input do node.
   */
  private buildFrameContext(frames: StackFrame[]): Record<string, unknown> {
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const frame = frames[i];
      if (frame.kind === "foreach") {
        return frame.rows[frame.iterationIndex] ?? {};
      }
    }
    return {};
  }

  private getEntryInputKeys(node: FlowNode): string[] {
    // Lista as inputHandles que tem aresta entrando.
    // Phase 4 nao consulta o registry aqui pra evitar dependencia circular;
    // confiamos nas edges presentes no graph.
    const edges = this.getEdgesIntoNode(node.id);
    const keys = new Set<string>();
    for (const edge of edges) keys.add(edge.targetHandle ?? "");
    return Array.from(keys);
  }

  // --- structural ---

  private async evaluateStructural(node: FlowNode, frames: StackFrame[]): Promise<EvaluationOutputs> {
    if (node.type === "ForEach") return this.evaluateForEach(node, frames);
    if (node.type === "While") return this.evaluateWhile(node, frames);
    throw new InterpreterError({
      code: "UNKNOWN_NODE_TYPE",
      message: `Structural desconhecido: ${node.type}`,
      nodeId: node.id
    });
  }

  private async evaluateWhile(node: FlowNode, frames: StackFrame[]): Promise<EvaluationOutputs> {
    // While ativo: devolve a iteracao corrente do frame.
    const activeFrame = frames.find(
      (f): f is StackFrame & { kind: "while" } => f.kind === "while" && f.nodeId === node.id
    );
    if (activeFrame) {
      return { iteration: { kind: "number", value: activeFrame.iterationCount } };
    }

    // Primeira avaliacao: iteracao zero. Body vive em node.body.
    const body = node.body;
    const hasBody = body && body.nodes.length > 0;

    let iterationCount = 0;
    while (true) {
      const iterFrames: StackFrame[] = [
        ...frames,
        { kind: "while", nodeId: node.id, iterationCount }
      ];
      // Limpa cache de iteracoes anteriores deste while pra que GetVariable
      // dentro da condition leia state mutado.
      this.invalidateCacheForFrame(node.id, iterationCount);
      const condition = await this.resolveInput(node.id, "condition", iterFrames);
      const condBool =
        condition?.kind === "boolean"
          ? condition.value
          : condition !== undefined && condition.kind !== "void";

      if (!condBool) break;

      if (iterationCount >= this.limits.maxIterations) {
        throw new InterpreterError({
          code: "LIMIT_EXCEEDED_ITERATIONS",
          message: `While excedeu maxIterations (${this.limits.maxIterations}).`,
          nodeId: node.id
        });
      }

      this.tickExecution(node.id);
      if (hasBody && body) {
        await this.withBody(body, async () => {
          const bodySinks = this.findSinks();
          for (const sink of bodySinks) {
            await this.evaluateNode(sink.id, iterFrames);
          }
        });
      }
      iterationCount += 1;
    }

    return { iteration: { kind: "number", value: iterationCount } };
  }

  /**
   * Limpa entradas do cache cujo frame_signature contenha o frame deste while
   * com qualquer iterationCount diferente do atual. Sem isso, GetVariable
   * leria valor da iteracao anterior em iteracoes subsequentes.
   */
  private invalidateCacheForFrame(whileNodeId: string, currentIter: number) {
    const prefix = `wh:${whileNodeId}:`;
    for (const key of Array.from(this.cache.keys())) {
      const idx = key.indexOf(prefix);
      if (idx < 0) continue;
      const iterStr = key.slice(idx + prefix.length).split("|")[0];
      const iterNum = Number(iterStr);
      if (!Number.isNaN(iterNum) && iterNum !== currentIter) {
        this.cache.delete(key);
      }
    }
  }

  private async evaluateForEach(node: FlowNode, frames: StackFrame[]): Promise<EvaluationOutputs> {
    // Subgraph rewrite: body LIVE como FlowGraph proprio em node.body.
    // - Sem node.body OU body.nodes vazio: itera mas nao executa nada interno.
    // - Outputs do ForEach: dynamicOutputs (intrinsic current_row/index/total/result
    //   ou column ejetada). Per-iteration outputs sao resolvidos via active frame
    //   detection; pos-loop emite total/result.
    const sheet = (node.config?.sheet_key as string | undefined) ?? undefined;
    const dynamicOutputs = node.dynamicOutputs ?? [];

    // Se ja existe um frame ATIVO para este ForEach, devolve outputs per-iteration.
    const activeFrame = frames.find(
      (f): f is StackFrame & { kind: "foreach" } => f.kind === "foreach" && f.nodeId === node.id
    );
    if (activeFrame) {
      const row = activeFrame.rows[activeFrame.iterationIndex];
      const outputs: EvaluationOutputs = {};
      for (const dyno of dynamicOutputs) {
        if (dyno.kind === "intrinsic") {
          if (dyno.intrinsicKey === "current_row") {
            outputs[dyno.id] = { kind: "row", sheet, data: row };
          } else if (dyno.intrinsicKey === "index") {
            outputs[dyno.id] = { kind: "number", value: activeFrame.iterationIndex };
          } else if (dyno.intrinsicKey === "total") {
            outputs[dyno.id] = { kind: "number", value: activeFrame.rows.length };
          } else if (dyno.intrinsicKey === "result") {
            outputs[dyno.id] = { kind: "rowList", sheet, rows: activeFrame.rows };
          }
        } else if (dyno.kind === "column" && dyno.fieldName) {
          outputs[dyno.id] = wrapValue(row?.[dyno.fieldName]);
        }
      }
      return outputs;
    }

    // Primeira avaliacao: puxa input rows e itera o body.
    const input = await this.resolveInput(node.id, "rows", frames);
    if (!input || input.kind !== "rowList") {
      this.tickExecution(node.id);
      return this.emitEmptyForEachOutputs(dynamicOutputs);
    }

    if (input.rows.length > this.limits.maxIterations) {
      throw new InterpreterError({
        code: "LIMIT_EXCEEDED_ITERATIONS",
        message: `ForEach com ${input.rows.length} iteracoes excede o limite (${this.limits.maxIterations}).`,
        nodeId: node.id
      });
    }

    const body = node.body;
    if (body && body.nodes.length > 0) {
      // Entra no body: empilha graph, descobre sinks do BODY, avalia cada um
      // por iteracao. Frames cumulativos garantem isolamento de cache.
      for (let i = 0; i < input.rows.length; i++) {
        const iterFrames: StackFrame[] = [
          ...frames,
          { kind: "foreach", nodeId: node.id, iterationIndex: i, rows: input.rows }
        ];
        this.tickExecution(node.id);
        await this.withBody(body, async () => {
          const bodySinks = this.findSinks();
          for (const sink of bodySinks) {
            await this.evaluateNode(sink.id, iterFrames);
          }
        });
      }
    } else {
      // Body vazio: ainda contabiliza iteracoes pra limites/output, mas no-op.
      for (let i = 0; i < input.rows.length; i++) {
        this.tickExecution(node.id);
      }
    }

    // Pos-loop: emite os outputs nao-per-iteration.
    const postOutputs: EvaluationOutputs = {};
    for (const dyno of dynamicOutputs) {
      if (dyno.kind === "intrinsic" && dyno.intrinsicKey === "total") {
        postOutputs[dyno.id] = { kind: "number", value: input.rows.length };
      } else if (dyno.kind === "intrinsic" && dyno.intrinsicKey === "result") {
        postOutputs[dyno.id] = { kind: "rowList", sheet: input.sheet, rows: input.rows };
      } else {
        // current_row, index, column — invalido fora de iteracao.
        postOutputs[dyno.id] = { kind: "void" };
      }
    }
    return postOutputs;
  }

  private emitEmptyForEachOutputs(
    dynamicOutputs: NonNullable<FlowNode["dynamicOutputs"]>
  ): EvaluationOutputs {
    const outputs: EvaluationOutputs = {};
    for (const dyno of dynamicOutputs) {
      if (dyno.kind === "intrinsic" && dyno.intrinsicKey === "result") {
        outputs[dyno.id] = { kind: "rowList", rows: [] };
      } else if (dyno.kind === "intrinsic" && dyno.intrinsicKey === "total") {
        outputs[dyno.id] = { kind: "number", value: 0 };
      } else {
        outputs[dyno.id] = { kind: "void" };
      }
    }
    return outputs;
  }
}

/**
 * DataSource mock para dry-run no editor:
 *  - listAllRowsForSheet / listSelectedRowsForSheet → fixtures de
 *    `mock-data.ts` (~3 rows realistas por sheet conhecida). Sem isso,
 *    AllRowsSource(carros) emitiria [] em dry-run e ForEach iteraria 0 vezes.
 *  - BulkSelectSource → emite uma row sintetica por token (matchColumn=token).
 *  - Sheets sem fixture (anuncios, lookups, etc.) caem em [] silenciosamente.
 *
 * Fase 11: implementa os novos getters de system context com defaults vazios.
 */
export const MOCK_DATA_SOURCE: DataSource = {
  async listAllRowsForSheet(sheetKey): Promise<FlowRow[]> {
    return getMockRowsForSheet(sheetKey);
  },
  async listSelectedRowsForSheet(sheetKey): Promise<FlowRow[]> {
    return getMockRowsForSheet(sheetKey);
  },
  async matchRowsForBulkSelect(_sheet, matchColumn, tokens) {
    return tokens.map((token) => ({ [matchColumn]: token }));
  },
  async getActiveSheet() {
    return null;
  },
  async getHiddenRowsForSheet() {
    return [];
  },
  async getConferenceRowsForSheet() {
    return [];
  },
  async getUserRole() {
    return null;
  },
  async getUserId() {
    return null;
  },
  async getSystemContext() {
    return {
      active_sheet: null,
      selected_rows: [],
      hidden_rows: [],
      conference_rows: [],
      user_role: null,
      user_id: null
    };
  }
};
