"use client";

import type { PrintTemplate } from "@/components/ui-grid/print-composer/types";

export type PrintComposerSidebarProps = {
  templates: PrintTemplate[];
  loading: boolean;
  activeTemplateId: string | null;
  title: string;
  hasActiveTemplate: boolean;
  onTitleChange: (title: string) => void;
  onSelectTemplate: (template: PrintTemplate) => void;
  onClickNew: () => void;
  onClickReset: () => void;
  onClickDelete: () => void;
};

export function PrintComposerSidebar(props: PrintComposerSidebarProps) {
  const {
    templates,
    loading,
    activeTemplateId,
    title,
    hasActiveTemplate,
    onTitleChange,
    onSelectTemplate,
    onClickNew,
    onClickReset,
    onClickDelete
  } = props;

  return (
    <aside className="print-composer-sidebar" data-testid="print-composer-sidebar">
      <div className="print-composer-sidebar-head">
        <div className="print-composer-sidebar-actions">
          <button
            type="button"
            className="print-composer-icon-btn"
            onClick={onClickNew}
            title="Novo template"
            aria-label="Novo template"
            data-testid="print-composer-new"
          >
            +
          </button>
          <button
            type="button"
            className="print-composer-icon-btn"
            onClick={onClickDelete}
            title="Excluir template selecionado"
            aria-label="Excluir template selecionado"
            disabled={!hasActiveTemplate}
            data-testid="print-composer-delete"
          >
            ×
          </button>
          <button
            type="button"
            className="print-composer-icon-btn"
            onClick={onClickReset}
            title="Resetar configuracoes"
            aria-label="Resetar configuracoes"
            data-testid="print-composer-reset"
          >
            o
          </button>
        </div>
        <input
          type="text"
          className="print-composer-title-input"
          placeholder="Titulo do template"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          data-testid="print-composer-title-input"
        />
      </div>

      <div className="print-composer-template-list" data-testid="print-composer-template-list">
        {loading && templates.length === 0 ? (
          <p className="print-composer-template-empty">Carregando templates...</p>
        ) : templates.length === 0 ? (
          <p className="print-composer-template-empty">Nenhum template salvo.</p>
        ) : (
          templates.map((template) => {
            const isActive = template.id === activeTemplateId;
            return (
              <button
                key={template.id}
                type="button"
                className={`print-composer-template-item${isActive ? " print-composer-template-item-active" : ""}`}
                onClick={() => onSelectTemplate(template)}
                data-testid={`print-composer-template-${template.id}`}
                aria-pressed={isActive}
              >
                <span className="print-composer-template-title">{template.title}</span>
                <span className="print-composer-template-meta">
                  {template.anchor_filter && Object.keys(template.anchor_filter.values).length > 0
                    ? "filtro ancora"
                    : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
