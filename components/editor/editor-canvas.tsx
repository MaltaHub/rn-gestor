"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange
} from "@xyflow/react";
import {
  buildReactFlowNodeTypes,
  getEffectiveOutputs,
  getRegistryEntry,
  isSocketCompatible,
  resolveOutputSocketType
} from "@/components/editor/node-registry";
import type { DynamicOutputSocket, FlowEdge, FlowGraph, FlowNode } from "@/components/editor/types";

type CanvasNodeData = {
  config?: Record<string, unknown>;
  dynamicOutputs?: DynamicOutputSocket[];
};
type CanvasNode = Node<CanvasNodeData>;
type CanvasEdge = Edge;

// React Flow @xyflow/react v12 mantem o wrapper do node com
// `visibility: hidden` ate `ResizeObserver` medir width/height
// (nodeHasDimensions). Passamos initialWidth/initialHeight pro node aparecer
// no primeiro frame; valores casam com .editor-node min-width/min-height.
const NODE_INITIAL_WIDTH = 180;
const NODE_INITIAL_HEIGHT = 64;

const DEFAULT_EDGE_OPTIONS = {
  type: "default",
  animated: false,
  style: { stroke: "#2563eb", strokeWidth: 2 }
} as const;

const CONNECTION_LINE_STYLE = {
  stroke: "#2563eb",
  strokeWidth: 2,
  strokeDasharray: "5,5"
} as const;

function toCanvasNodes(nodes: FlowNode[]): CanvasNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: { config: node.config ?? {}, dynamicOutputs: node.dynamicOutputs ?? [] },
    initialWidth: NODE_INITIAL_WIDTH,
    initialHeight: NODE_INITIAL_HEIGHT
  }));
}

function toCanvasEdges(edges: FlowEdge[]): CanvasEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? null,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null
  }));
}

function fromCanvasNodes(nodes: CanvasNode[]): FlowNode[] {
  return nodes.map((node) => {
    const data = node.data as CanvasNodeData | undefined;
    return {
      id: node.id,
      type: node.type ?? "Unknown",
      position: node.position,
      config: data?.config ?? {},
      dynamicOutputs: data?.dynamicOutputs ?? []
    };
  });
}

function fromCanvasEdges(edges: CanvasEdge[]): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? undefined,
    target: edge.target,
    targetHandle: edge.targetHandle ?? undefined
  }));
}

/**
 * Signature pra detectar mudancas estruturais no graph vindas de fora do
 * canvas (paleta, properties panel, carregamento de fluxo) vs as causadas pelo
 * proprio canvas (que ja foram absorvidas localmente). Sem isso, o useEffect
 * de sync entra em loop com nossos proprios commits.
 */
function signNodes(nodes: FlowNode[]): string {
  return nodes
    .map(
      (n) =>
        `${n.id}|${n.type}|${Math.round(n.position.x)}|${Math.round(n.position.y)}|${JSON.stringify(n.config ?? {})}|${JSON.stringify(n.dynamicOutputs ?? [])}`
    )
    .join("§");
}

function signEdges(edges: FlowEdge[]): string {
  return edges
    .map((e) => `${e.id}|${e.source}|${e.sourceHandle ?? ""}|${e.target}|${e.targetHandle ?? ""}`)
    .join("§");
}

/**
 * Filtra changes do React Flow que precisam ser comitadas pro parent.
 *  - position com dragging:true: drag em andamento, fica so local pra UX fluida.
 *  - dimensions: medicao do ResizeObserver, nao faz parte do FlowNode.
 *  - select: temos selecao propria via selectedNodeId no parent.
 *  - resto (position dragging:false, add, remove, replace): comita.
 */
function isCommittableNodeChange(change: NodeChange<CanvasNode>): boolean {
  if (change.type === "position") return change.dragging === false;
  if (change.type === "dimensions") return false;
  if (change.type === "select") return false;
  return true;
}

function isCommittableEdgeChange(change: EdgeChange<CanvasEdge>): boolean {
  if (change.type === "select") return false;
  return true;
}

export type EditorCanvasProps = {
  graph: FlowGraph;
  readOnly: boolean;
  selectedNodeId: string | null;
  onGraphChange: (next: FlowGraph) => void;
  onSelectNode: (nodeId: string | null) => void;
  /**
   * Disparado em double-click num node com `entry.supportsBody = true`
   * (ForEach, While). Workspace empilha o nodeId no bodyPath e re-render o
   * canvas com o subgrafo do body.
   */
  onEnterBody?: (nodeId: string, nodeLabel: string) => void;
};

export function EditorCanvas(props: EditorCanvasProps) {
  const { graph, readOnly, selectedNodeId, onGraphChange, onSelectNode, onEnterBody } = props;
  const reactFlow = useReactFlow();
  const prevSelectedRef = useRef<string | null>(null);
  const prevNodeCountRef = useRef<number>(graph.nodes.length);

  // Local draft state: absorve eventos transientes (drag em andamento, dimensions,
  // selecao interna do React Flow) sem round-trip pelo parent state. Commit so
  // em eventos significativos: drag-stop, add, remove, connect, disconnect.
  const [draftNodes, setDraftNodes] = useState<CanvasNode[]>(() => toCanvasNodes(graph.nodes));
  const [draftEdges, setDraftEdges] = useState<CanvasEdge[]>(() => toCanvasEdges(graph.edges));

  // graphRef garante que commits enfileirados via queueMicrotask usem o estado
  // mais recente do parent (evita race conditions com config edits concorrentes).
  const graphRef = useRef(graph);
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  // Signatures pra distinguir mudancas externas (re-sync local) das nossas
  // (no-op no useEffect). Sem isso, cada commit dispara o effect de sync que
  // sobrescreve o draft com o que acabamos de mandar — barato porem desnecessario.
  const lastSyncSigRef = useRef({
    nodes: signNodes(graph.nodes),
    edges: signEdges(graph.edges)
  });

  useEffect(() => {
    const sig = signNodes(graph.nodes);
    if (sig === lastSyncSigRef.current.nodes) return;
    lastSyncSigRef.current.nodes = sig;
    setDraftNodes(toCanvasNodes(graph.nodes));
  }, [graph.nodes]);

  useEffect(() => {
    const sig = signEdges(graph.edges);
    if (sig === lastSyncSigRef.current.edges) return;
    lastSyncSigRef.current.edges = sig;
    setDraftEdges(toCanvasEdges(graph.edges));
  }, [graph.edges]);

  // Centraliza viewport quando um novo node entra (via paleta) ou quando o
  // user seleciona um existente. Defer com setTimeout pra garantir que React
  // Flow processou a mudanca de nodes prop.
  useEffect(() => {
    const nodeCountGrew = graph.nodes.length > prevNodeCountRef.current;
    const selectionChanged =
      selectedNodeId !== null && selectedNodeId !== prevSelectedRef.current;
    prevNodeCountRef.current = graph.nodes.length;
    prevSelectedRef.current = selectedNodeId;

    if (!nodeCountGrew && !selectionChanged) return;
    const focusId = selectedNodeId ?? graph.nodes[graph.nodes.length - 1]?.id ?? null;
    if (!focusId) return;
    const focusNode = graph.nodes.find((n) => n.id === focusId);
    if (!focusNode) return;
    const timeoutId = window.setTimeout(() => {
      reactFlow.setCenter(focusNode.position.x + 90, focusNode.position.y + 40, {
        zoom: Math.max(reactFlow.getZoom(), 1),
        duration: 250
      });
    }, 50);
    return () => window.clearTimeout(timeoutId);
  }, [selectedNodeId, graph.nodes, reactFlow]);

  // Centralizar / Fit-to-view manual.
  const fitAll = useCallback(() => {
    if (graph.nodes.length === 0) {
      reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
      return;
    }
    reactFlow.fitView({ padding: 0.2, duration: 250 });
  }, [graph.nodes.length, reactFlow]);

  const nodes = useMemo(
    () =>
      draftNodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId
      })),
    [draftNodes, selectedNodeId]
  );

  const nodeTypes = useMemo(() => buildReactFlowNodeTypes(), []);

  const commitNodes = useCallback(
    (next: CanvasNode[]) => {
      const flowNodes = fromCanvasNodes(next);
      lastSyncSigRef.current.nodes = signNodes(flowNodes);
      onGraphChange({ ...graphRef.current, nodes: flowNodes });
    },
    [onGraphChange]
  );

  const commitEdges = useCallback(
    (next: CanvasEdge[]) => {
      const flowEdges = fromCanvasEdges(next);
      lastSyncSigRef.current.edges = signEdges(flowEdges);
      onGraphChange({ ...graphRef.current, edges: flowEdges });
    },
    [onGraphChange]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      setDraftNodes((curr) => {
        const next = applyNodeChanges(changes, curr);
        if (changes.some(isCommittableNodeChange)) {
          queueMicrotask(() => commitNodes(next));
        }
        return next;
      });
    },
    [commitNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      setDraftEdges((curr) => {
        const next = applyEdgeChanges(changes, curr);
        if (changes.some(isCommittableEdgeChange)) {
          queueMicrotask(() => commitEdges(next));
        }
        return next;
      });
    },
    [commitEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setDraftEdges((curr) => {
        const next = addEdge(connection, curr);
        queueMicrotask(() => commitEdges(next));
        return next;
      });
    },
    [commitEdges]
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { source, target, sourceHandle, targetHandle } = connection as Connection;
      if (!source || !target || source === target) return false;
      const sourceNode = draftNodes.find((node) => node.id === source);
      const targetNode = draftNodes.find((node) => node.id === target);
      if (!sourceNode || !targetNode) return false;
      const sourceType = sourceNode.type ?? "";
      const targetType = targetNode.type ?? "";
      const sourceEntry = getRegistryEntry(sourceType);
      const targetEntry = getRegistryEntry(targetType);
      if (!sourceEntry || !targetEntry) return false;
      // Inclui outputs DINAMICOS do sourceNode na resolucao do socket.
      const sourceConfig = (sourceNode.data as CanvasNodeData | undefined)?.config;
      const sourceDyn = (sourceNode.data as CanvasNodeData | undefined)?.dynamicOutputs ?? [];
      const flowSourceNode: FlowNode = {
        id: sourceNode.id,
        type: sourceType,
        position: { x: 0, y: 0 },
        config: sourceConfig,
        dynamicOutputs: sourceDyn
      };
      const effective = getEffectiveOutputs(sourceEntry, flowSourceNode);
      const sourceSocket = effective.find((s) => s.key === (sourceHandle ?? ""));
      const targetSocket = targetEntry.inputs.find((s) => s.key === (targetHandle ?? ""));
      if (!sourceSocket || !targetSocket) return false;
      // Bloqueia conexao duplicada no mesmo target socket (one-to-one).
      const alreadyHasEdge = draftEdges.some(
        (edge) => edge.target === target && (edge.targetHandle ?? "") === (targetHandle ?? "")
      );
      if (alreadyHasEdge) return false;
      // Resolve sheet do source com base no config (BulkSelectSource etc.).
      const resolvedSourceType = resolveOutputSocketType(sourceSocket.type, sourceConfig);
      return isSocketCompatible(resolvedSourceType, targetSocket.type);
    },
    [draftNodes, draftEdges]
  );

  return (
    <div className="editor-canvas" data-testid="editor-canvas">
      <button
        type="button"
        className="editor-canvas-fit-btn"
        onClick={fitAll}
        title="Centralizar / encaixar todos os nodes na viewport"
        data-testid="editor-canvas-fit"
      >
        Centralizar
      </button>
      <ReactFlow
        nodes={nodes}
        edges={draftEdges}
        nodeTypes={nodeTypes}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        isValidConnection={readOnly ? undefined : isValidConnection}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onNodeDoubleClick={(_, node) => {
          if (!onEnterBody) return;
          const entry = getRegistryEntry(node.type ?? "");
          if (entry?.supportsBody) onEnterBody(node.id, entry.label);
        }}
        onPaneClick={() => onSelectNode(null)}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={true}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
