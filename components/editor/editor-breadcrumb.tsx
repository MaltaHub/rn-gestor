"use client";

import type { BodyPath } from "@/components/editor/body-navigation";

export type EditorBreadcrumbProps = {
  path: BodyPath;
  onNavigate: (next: BodyPath) => void;
};

/**
 * Breadcrumb exibido acima do canvas quando o user navegou pra dentro do body
 * de algum ForEach/While. Permite voltar pro nivel principal ou pra qualquer
 * nivel intermediario. Quando path esta vazio (root), nao renderiza.
 */
export function EditorBreadcrumb({ path, onNavigate }: EditorBreadcrumbProps) {
  if (path.length === 0) return null;
  return (
    <nav className="editor-breadcrumb" aria-label="Navegacao por subgraphs" data-testid="editor-breadcrumb">
      <button
        type="button"
        className="editor-breadcrumb-item"
        onClick={() => onNavigate([])}
        data-testid="editor-breadcrumb-root"
      >
        Fluxo principal
      </button>
      {path.map((step, idx) => {
        const isLast = idx === path.length - 1;
        const stepPath = path.slice(0, idx + 1);
        return (
          <span key={`${step.nodeId}-${idx}`} className="editor-breadcrumb-step">
            <span className="editor-breadcrumb-sep" aria-hidden>
              ›
            </span>
            <button
              type="button"
              className={
                isLast
                  ? "editor-breadcrumb-item editor-breadcrumb-current"
                  : "editor-breadcrumb-item"
              }
              onClick={() => onNavigate(stepPath)}
              disabled={isLast}
              data-testid={`editor-breadcrumb-step-${idx}`}
            >
              {step.nodeLabel} <code>#{step.nodeId.slice(0, 6)}</code>
            </button>
          </span>
        );
      })}
    </nav>
  );
}
