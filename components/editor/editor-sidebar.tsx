"use client";

import type { EditorFlow } from "@/components/editor/types";
import { listRegistryByCategory, type NodeRegistryEntry } from "@/components/editor/node-registry";
import type { EditorFlowRun } from "@/components/editor/useEditorFlowRuns";

const CATEGORY_LABELS: Record<NodeRegistryEntry["category"], string> = {
  source: "Sources",
  structural: "Estruturais",
  computation: "Computacionais",
  tag: "TAGs"
};

export type EditorSidebarProps = {
  flows: EditorFlow[];
  loading: boolean;
  error: string | null;
  activeFlowId: string | null;
  canEdit: boolean;
  runs?: EditorFlowRun[];
  onSelectFlow: (flow: EditorFlow) => void;
  onNewFlow: () => void;
  onAddNode: (type: string) => void;
  onSelectRun?: (run: EditorFlowRun) => void;
};

export function EditorSidebar(props: EditorSidebarProps) {
  const { flows, loading, error, activeFlowId, canEdit, runs, onSelectFlow, onNewFlow, onAddNode, onSelectRun } = props;
  const grouped = listRegistryByCategory();
  const recentRuns = (runs ?? []).slice(0, 5);

  return (
    <aside className="editor-sidebar" data-testid="editor-sidebar">
      <section className="editor-sidebar-section">
        <header className="editor-sidebar-section-head">
          <strong>Fluxos da organizacao</strong>
          {canEdit ? (
            <button
              type="button"
              className="editor-icon-btn"
              onClick={onNewFlow}
              title="Novo fluxo"
              aria-label="Novo fluxo"
              data-testid="editor-new-flow"
            >
              +
            </button>
          ) : null}
        </header>
        {error ? <p className="editor-sidebar-error">{error}</p> : null}
        {loading && flows.length === 0 ? (
          <p className="editor-sidebar-empty">Carregando...</p>
        ) : flows.length === 0 ? (
          <p className="editor-sidebar-empty">Nenhum fluxo ainda.</p>
        ) : (
          <div className="editor-sidebar-list">
            {flows.map((flow) => (
              <button
                key={flow.id}
                type="button"
                className={`editor-sidebar-item${flow.id === activeFlowId ? " is-active" : ""}`}
                onClick={() => onSelectFlow(flow)}
                data-testid={`editor-flow-${flow.id}`}
              >
                <strong>{flow.title}</strong>
                {flow.sheet_key ? <span>{flow.sheet_key}</span> : <span className="editor-multi">multi-aba</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {recentRuns.length > 0 ? (
        <section className="editor-sidebar-section">
          <header className="editor-sidebar-section-head">
            <strong>Runs recentes</strong>
          </header>
          <div className="editor-sidebar-list">
            {recentRuns.map((run) => {
              const ts = run.started_at ? new Date(run.started_at).toLocaleTimeString() : "";
              return (
                <button
                  key={run.id}
                  type="button"
                  className="editor-sidebar-item"
                  onClick={() => onSelectRun?.(run)}
                  data-testid={`editor-run-${run.id}`}
                >
                  <strong>{run.status}</strong>
                  <span>{ts}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="editor-sidebar-section">
        <header className="editor-sidebar-section-head">
          <strong>Paleta de nos</strong>
        </header>
        {(Object.keys(grouped) as Array<NodeRegistryEntry["category"]>).map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="editor-palette-group">
              <span className="editor-palette-cat">{CATEGORY_LABELS[cat]}</span>
              {items.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  className="editor-palette-btn"
                  onClick={() => onAddNode(entry.type)}
                  title={entry.description}
                  disabled={!canEdit}
                  data-testid={`editor-add-${entry.type}`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          );
        })}
      </section>
    </aside>
  );
}
