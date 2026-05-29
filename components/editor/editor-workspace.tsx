"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useSearchParams } from "next/navigation";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { EditorCanvas } from "@/components/editor/editor-canvas";
import { EditorPropertiesPanel } from "@/components/editor/editor-properties-panel";
import { EditorSidebar } from "@/components/editor/editor-sidebar";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { useEditorFlows } from "@/components/editor/useEditorFlows";
import { useEditorFlowRuns, useFlowRunHeartbeat } from "@/components/editor/useEditorFlowRuns";
import { useEditorUserVariables } from "@/components/editor/useEditorUserVariables";
import {
  emptyFlowGraph,
  type DynamicOutputSocket,
  type EditorFlow,
  type FlowGraph,
  type FlowNode
} from "@/components/editor/types";
import { NodeActionsProvider } from "@/components/editor/nodes/node-actions-context";
import { getRegistryEntry } from "@/components/editor/node-registry";
import { SchemaProvider } from "@/components/editor/schema/schema-context";
import { inferGraphSchemas } from "@/components/editor/schema/socket-schema";
import {
  getGraphAtPath,
  updateGraphAtPath,
  type BodyPath
} from "@/components/editor/body-navigation";
import { EditorBreadcrumb } from "@/components/editor/editor-breadcrumb";
import { FlowInterpreter, MOCK_DATA_SOURCE } from "@/lib/domain/editor-flows/runtime/interpreter";
import type { RunResult } from "@/lib/domain/editor-flows/runtime/types";
import type { CurrentActor, Role } from "@/lib/domain/auth-session";
import type { RequestAuth } from "@/components/ui-grid/types";

type EditorWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role;
  onSignOut: () => Promise<void>;
};

function makeNodeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `node-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function EditorWorkspace({ actor, accessToken, devRole }: EditorWorkspaceProps) {
  const canEdit = actor.role === "GERENTE" || actor.role === "ADMINISTRADOR";
  const requestAuth = useMemo<RequestAuth>(() => ({ accessToken, devRole }), [accessToken, devRole]);
  const searchParams = useSearchParams();
  const initialFlowId = searchParams?.get("flow") ?? null;

  const flowsApi = useEditorFlows(requestAuth);
  const runsApi = useEditorFlowRuns(requestAuth);
  const userVarsApi = useEditorUserVariables(requestAuth);

  // Inicia null pra que o effect abaixo dispare loadFlowIntoEditor quando
  // initialFlowId vier do ?flow=...; iniciar com initialFlowId direto faria
  // o effect cair no early-return `activeFlowId === initialFlowId` no primeiro
  // render, deixando titulo/graph/sheetKey nos defaults vazios.
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunLockToken, setActiveRunLockToken] = useState<string | null>(null);

  useFlowRunHeartbeat(requestAuth, activeRunId, activeRunLockToken);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [graph, setGraph] = useState<FlowGraph>(() => emptyFlowGraph());
  const [originalSignature, setOriginalSignature] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "info" | "warn" | "error"; message: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  // Navegacao por subgraphs aninhados. Vazio = root.
  const [bodyPath, setBodyPath] = useState<BodyPath>([]);

  // Graph corrente a editar = graph apontado pelo bodyPath. Memoized pra que
  // o canvas receba a mesma referencia entre renders quando nada muda.
  const currentGraph = useMemo(() => getGraphAtPath(graph, bodyPath), [graph, bodyPath]);

  // Helper unico pra mutar o graph corrente preservando a estrutura aninhada.
  const setCurrentGraph = useCallback(
    (next: FlowGraph | ((prev: FlowGraph) => FlowGraph)) => {
      setGraph((prev) =>
        updateGraphAtPath(prev, bodyPath, (g) =>
          typeof next === "function" ? next(g) : next
        )
      );
    },
    [bodyPath]
  );

  // SchemaEnvironment computado a partir do graph RAIZ. Hoje a inferencia
  // ja eh sobre todo o grafo (recursividade vem na proxima fase) — pra editar
  // dentro de um body, o env do path corrente eh consumido via context.
  const schemaEnv = useMemo(() => inferGraphSchemas(graph), [graph]);

  const currentSignature = useMemo(
    () => JSON.stringify({ title, description, sheetKey, graph }),
    [title, description, sheetKey, graph]
  );
  const dirty = currentSignature !== originalSignature;

  const loadFlowIntoEditor = useCallback((flow: EditorFlow | null) => {
    if (!flow) {
      const blank = emptyFlowGraph();
      setActiveFlowId(null);
      setTitle("");
      setDescription(null);
      setSheetKey(null);
      setGraph(blank);
      setOriginalSignature(JSON.stringify({ title: "", description: null, sheetKey: null, graph: blank }));
      setSelectedNodeId(null);
      return;
    }
    setActiveFlowId(flow.id);
    setTitle(flow.title);
    setDescription(flow.description);
    setSheetKey(flow.sheet_key);
    setGraph(flow.graph);
    setOriginalSignature(
      JSON.stringify({
        title: flow.title,
        description: flow.description,
        sheetKey: flow.sheet_key,
        graph: flow.graph
      })
    );
    setSelectedNodeId(null);
  }, []);

  // Resolve initialFlowId quando a lista chega.
  useEffect(() => {
    if (!initialFlowId) return;
    if (activeFlowId === initialFlowId) return;
    const flow = flowsApi.flows.find((item) => item.id === initialFlowId);
    if (flow) loadFlowIntoEditor(flow);
  }, [initialFlowId, activeFlowId, flowsApi.flows, loadFlowIntoEditor]);

  // selectedNode procura no graph CORRENTE (pode ser body de algum ForEach).
  // Sem isso, ao editar um node dentro de um body, properties panel mostraria
  // "selecione um node" porque o lookup estava no graph raiz.
  const selectedNode: FlowNode | null = useMemo(
    () => currentGraph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [currentGraph.nodes, selectedNodeId]
  );

  function onConfigChange(nodeId: string, config: Record<string, unknown>) {
    setCurrentGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, config } : node))
    }));
  }

  function onAddDynamicOutput(nodeId: string, socket: DynamicOutputSocket) {
    setCurrentGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const existing = node.dynamicOutputs ?? [];
        if (existing.some((s) => s.id === socket.id)) return node;
        return { ...node, dynamicOutputs: [...existing, socket] };
      })
    }));
  }

  function onRemoveDynamicOutput(nodeId: string, socketId: string) {
    setCurrentGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const existing = node.dynamicOutputs ?? [];
        return { ...node, dynamicOutputs: existing.filter((s) => s.id !== socketId) };
      }),
      edges: prev.edges.filter(
        (edge) => !(edge.source === nodeId && (edge.sourceHandle ?? "") === socketId)
      )
    }));
  }

  function onUpdateConfigField(nodeId: string, fieldKey: string, value: unknown) {
    setCurrentGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === nodeId ? { ...node, config: { ...(node.config ?? {}), [fieldKey]: value } } : node
      )
    }));
  }

  function onDeleteNode(nodeId: string) {
    setCurrentGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((node) => node.id !== nodeId),
      edges: prev.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    }));
    setSelectedNodeId(null);
  }

  /**
   * Entra no body de um node estrutural. Empilha mais um step no bodyPath
   * fazendo o canvas re-render com o subgrafo do body. Voltar e via
   * breadcrumb (onNavigate).
   */
  function onEnterBody(nodeId: string, nodeLabel: string) {
    setBodyPath((curr) => [...curr, { nodeId, nodeLabel }]);
    setSelectedNodeId(null);
  }

  function onAddNode(type: string) {
    if (!canEdit) return;
    const id = makeNodeId();
    // Aplica defaultValues do registry pro novo node ja vir com sheet_key
    // etc. — sem isso, o popover do "+" nao conseguiria listar colunas
    // (depende de config.sheet_key).
    const entry = getRegistryEntry(type);
    const defaultConfig: Record<string, unknown> = {};
    if (entry) {
      for (const field of entry.configFields) {
        if (field.type !== "column-select" && "defaultValue" in field && field.defaultValue !== undefined) {
          defaultConfig[field.key] = field.defaultValue;
        }
      }
    }
    // Layout em grade pra evitar overlap: 4 colunas, 220px de passo horizontal
    // (180px do node + 40px de respiro), 160px vertical. Faz com que o source
    // handle de um nodo fique distante do target handle do proximo na mesma
    // linha — essencial pra drag-to-connect ser ergonomico.
    setCurrentGraph((prev) => {
      const idx = prev.nodes.length;
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const position = { x: 60 + col * 220, y: 80 + row * 160 };
      const newNode: FlowNode = {
        id,
        type,
        position,
        config: defaultConfig,
        // ForEach/While: ja inicia com body vazio pra que o double-click
        // sempre tenha pra onde ir. Outros nodes nao precisam.
        ...(entry?.supportsBody ? { body: emptyFlowGraph() } : {})
      };
      return {
        ...prev,
        nodes: [...prev.nodes, newNode]
      };
    });
    setSelectedNodeId(id);
  }

  async function onSave() {
    if (!activeFlowId || !canEdit) return;
    setSaving(true);
    setToast(null);
    try {
      const updated = await flowsApi.update(activeFlowId, {
        title: title.trim(),
        description: description ?? null,
        sheet_key: (sheetKey ?? null) as never,
        graph
      });
      loadFlowIntoEditor(updated);
      setToast({ kind: "info", message: "Fluxo salvo." });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAs() {
    if (!canEdit) return;
    const desiredTitle =
      typeof window !== "undefined"
        ? window.prompt("Titulo do novo fluxo:", title.trim() || "Novo fluxo")
        : null;
    if (!desiredTitle || !desiredTitle.trim()) return;
    setSaving(true);
    setToast(null);
    try {
      const created = await flowsApi.create({
        title: desiredTitle.trim(),
        description: description ?? null,
        sheet_key: (sheetKey ?? null) as never,
        graph
      });
      loadFlowIntoEditor(created);
      setToast({ kind: "info", message: "Fluxo criado." });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Falha ao criar." });
    } finally {
      setSaving(false);
    }
  }

  async function onDryRun() {
    if (running) return;
    setRunning(true);
    setLastRun(null);
    setToast(null);

    // Persiste a run no servidor quando o flow esta salvo e nao dirty.
    // Sem flow ativo OU com pendencias locais, dry-run roda so em memoria.
    const shouldPersist = Boolean(activeFlowId) && !dirty;
    let runId: string | null = null;
    let lockToken: string | null = null;

    if (shouldPersist && activeFlowId) {
      try {
        const created = await runsApi.start(activeFlowId);
        runId = created.id;
        lockToken = created.lock_token;
        setActiveRunId(runId);
        setActiveRunLockToken(lockToken);
      } catch (err) {
        setToast({
          kind: "warn",
          message:
            err instanceof Error ? `Run nao persistida: ${err.message}` : "Run nao persistida; rodando local."
        });
      }
    }

    let result;
    let interp: FlowInterpreter | null = null;
    try {
      // Fase 10: carrega variaveis do user pra o dry-run poder ler/setar.
      // Falha de fetch nao impede o dry-run (variaveis vazias).
      let userVariables: Record<string, import("@/lib/domain/editor-flows/runtime/types").RuntimeValue> | undefined;
      try {
        userVariables = await userVarsApi.loadAsRuntimeMap();
      } catch {
        userVariables = undefined;
      }
      interp = new FlowInterpreter(graph, MOCK_DATA_SOURCE, {
        limits: graph.runtimeLimits,
        userVariables
      });
      result = await interp.run();
      setLastRun(result);
      if (result.status === "failed") {
        setToast({ kind: "warn", message: `Dry-run falhou: ${result.error?.code ?? "erro"}.` });
      }
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Falha no dry-run." });
    } finally {
      setRunning(false);
    }

    // Fase 10: persiste variaveis mutadas (exceto se cancelled — aqui dry-run nao cancela).
    if (interp && result && result.status !== "failed") {
      const mutated = interp.getMutatedVariables();
      if (mutated.length > 0) {
        try {
          await userVarsApi.batchUpsert(mutated);
        } catch (err) {
          console.warn("Falha ao persistir variaveis mutadas:", err);
        }
      }
    }

    if (runId && lockToken && result) {
      try {
        const nextStatus: "paused_at_tag" | "completed" | "failed" =
          result.status === "paused"
            ? "paused_at_tag"
            : result.status === "completed"
              ? "completed"
              : "failed";
        await runsApi.patch(runId, {
          lock_token: lockToken,
          status: nextStatus,
          context: {
            graph_snapshot: graph,
            logs: result.logs,
            applied_tags: [],
            tag_paused: result.status === "paused" ? result.paused : null,
            result: {
              status: result.status,
              executionsCount: result.executionsCount,
              durationMs: result.durationMs,
              error: result.error ?? null
            }
          },
          current_node_id: result.status === "paused" ? result.paused?.node_id ?? null : null,
          paused_reason: result.status === "paused" ? result.paused?.tag_type ?? null : null,
          error: result.error ? `${result.error.code}: ${result.error.message}` : null
        });
        if (result.status === "paused") {
          setToast({
            kind: "info",
            message: `Fluxo pausado em ${result.paused?.tag_type ?? "TAG"}. Va ao grid e clique "Liberar" pra aplicar.`
          });
        }
      } catch (err) {
        // Lock pode ter expirado se a run foi muito longa; nao impede a UX local.
        if (err instanceof Error) {
          console.warn("Falha ao gravar resultado da run:", err.message);
        }
      } finally {
        setActiveRunId(null);
        setActiveRunLockToken(null);
        void runsApi.refresh();
      }
    }
  }

  async function onDelete() {
    if (!activeFlowId || !canEdit) return;
    if (typeof window !== "undefined" && !window.confirm("Excluir este fluxo?")) return;
    setSaving(true);
    setToast(null);
    try {
      await flowsApi.remove(activeFlowId);
      loadFlowIntoEditor(null);
      setToast({ kind: "info", message: "Fluxo excluido." });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Falha ao excluir." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-workspace">
      <WorkspaceHeader actor={actor} title="Editor de fluxos" />
      <ReactFlowProvider>
        <SchemaProvider value={schemaEnv}>
        <NodeActionsProvider
          value={{
            addDynamicOutput: onAddDynamicOutput,
            removeDynamicOutput: onRemoveDynamicOutput,
            updateConfigField: onUpdateConfigField
          }}
        >
        <div className="editor-workspace-shell">
          <EditorSidebar
            flows={flowsApi.flows}
            loading={flowsApi.loading}
            error={flowsApi.error}
            activeFlowId={activeFlowId}
            canEdit={canEdit}
            runs={runsApi.runs}
            onSelectFlow={loadFlowIntoEditor}
            onNewFlow={() => loadFlowIntoEditor(null)}
            onAddNode={onAddNode}
            onSelectRun={(run) => {
              const flow = flowsApi.flows.find((f) => f.id === run.flow_id);
              if (flow) loadFlowIntoEditor(flow);
            }}
          />
          <div className="editor-main">
            <EditorToolbar
              title={title}
              dirty={dirty}
              canEdit={canEdit}
              saving={saving}
              hasActiveFlow={Boolean(activeFlowId)}
              running={running}
              hasGraphNodes={currentGraph.nodes.length > 0}
              onTitleChange={setTitle}
              onSave={() => void onSave()}
              onSaveAs={() => void onSaveAs()}
              onDelete={() => void onDelete()}
              onDryRun={() => void onDryRun()}
            />
            {toast ? (
              <div className={`editor-toast editor-toast-${toast.kind}`} data-testid="editor-toast">
                {toast.message}
              </div>
            ) : null}
            <EditorBreadcrumb path={bodyPath} onNavigate={setBodyPath} />
            <EditorCanvas
              graph={currentGraph}
              readOnly={!canEdit}
              selectedNodeId={selectedNodeId}
              onGraphChange={setCurrentGraph}
              onSelectNode={setSelectedNodeId}
              onEnterBody={onEnterBody}
            />
            {lastRun ? (
              <div
                className={`editor-console editor-console-${lastRun.status}`}
                data-testid="editor-console"
              >
                <header className="editor-console-head">
                  <strong>Dry-run {lastRun.status === "completed" ? "OK" : "FALHOU"}</strong>
                  <span>
                    {lastRun.executionsCount} execucao(oes) em {lastRun.durationMs}ms
                  </span>
                  <button
                    type="button"
                    className="editor-icon-btn"
                    onClick={() => setLastRun(null)}
                    aria-label="Fechar console"
                    title="Fechar"
                  >
                    ×
                  </button>
                </header>
                <div className="editor-console-body">
                  {lastRun.error ? (
                    <p className="editor-console-error">
                      <strong>{lastRun.error.code}:</strong> {lastRun.error.message}
                    </p>
                  ) : null}
                  {lastRun.logs.length === 0 ? (
                    <p className="editor-console-empty">Nenhum log produzido.</p>
                  ) : (
                    lastRun.logs.map((log, idx) => (
                      <div key={idx} className={`editor-console-entry editor-console-entry-${log.level}`}>
                        {log.message}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <EditorPropertiesPanel
            selectedNode={selectedNode}
            canEdit={canEdit}
            onConfigChange={onConfigChange}
            onDeleteNode={onDeleteNode}
            onRemoveDynamicOutput={onRemoveDynamicOutput}
          />
        </div>
        </NodeActionsProvider>
        </SchemaProvider>
      </ReactFlowProvider>
    </div>
  );
}
