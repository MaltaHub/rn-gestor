"use client";

export type EditorToolbarProps = {
  title: string;
  dirty: boolean;
  canEdit: boolean;
  saving: boolean;
  hasActiveFlow: boolean;
  running: boolean;
  hasGraphNodes: boolean;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDelete: () => void;
  onDryRun: () => void;
};

export function EditorToolbar(props: EditorToolbarProps) {
  const {
    title,
    dirty,
    canEdit,
    saving,
    hasActiveFlow,
    running,
    hasGraphNodes,
    onTitleChange,
    onSave,
    onSaveAs,
    onDelete,
    onDryRun
  } = props;

  return (
    <div className="editor-toolbar" data-testid="editor-toolbar">
      <input
        type="text"
        className="editor-title-input"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="Titulo do fluxo"
        disabled={!canEdit}
        data-testid="editor-title-input"
      />
      <div className="editor-toolbar-actions">
        {dirty ? <span className="editor-dirty-dot" title="Alteracoes nao salvas">●</span> : null}
        <button
          type="button"
          className="editor-toolbar-btn editor-toolbar-btn-secondary"
          onClick={onDryRun}
          disabled={running || !hasGraphNodes}
          data-testid="editor-dry-run"
          title="Executa o fluxo com DataSource mock (sem mutar o grid)"
        >
          {running ? "Executando..." : "Executar (dry-run)"}
        </button>
        <button
          type="button"
          className="editor-toolbar-btn"
          onClick={onSave}
          disabled={!canEdit || saving || !hasActiveFlow || title.trim().length === 0}
          data-testid="editor-save"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          className="editor-toolbar-btn"
          onClick={onSaveAs}
          disabled={!canEdit || saving || title.trim().length === 0}
          data-testid="editor-save-as"
        >
          Salvar como
        </button>
        {hasActiveFlow ? (
          <button
            type="button"
            className="editor-toolbar-btn editor-danger-btn"
            onClick={onDelete}
            disabled={!canEdit || saving}
            data-testid="editor-delete"
          >
            Excluir
          </button>
        ) : null}
      </div>
    </div>
  );
}
