"use client";

import { getRegistryEntry } from "@/components/editor/node-registry";
import type { FlowNode } from "@/components/editor/types";
import { InNodeColumnDropdown } from "@/components/editor/nodes/in-node-dropdown";
import { TemplateField } from "@/components/editor/nodes/template-field";

export type EditorPropertiesPanelProps = {
  selectedNode: FlowNode | null;
  canEdit: boolean;
  onConfigChange: (nodeId: string, config: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onRemoveDynamicOutput?: (nodeId: string, socketId: string) => void;
};

export function EditorPropertiesPanel(props: EditorPropertiesPanelProps) {
  const { selectedNode, canEdit, onConfigChange, onDeleteNode, onRemoveDynamicOutput } = props;

  if (!selectedNode) {
    return (
      <aside className="editor-properties" data-testid="editor-properties">
        <p className="editor-properties-empty">Selecione um no para editar.</p>
      </aside>
    );
  }

  const entry = getRegistryEntry(selectedNode.type);
  if (!entry) {
    return (
      <aside className="editor-properties">
        <p className="editor-properties-empty">Tipo de no desconhecido: {selectedNode.type}</p>
      </aside>
    );
  }

  const config = selectedNode.config ?? {};

  function setField(key: string, value: unknown) {
    onConfigChange(selectedNode!.id, { ...config, [key]: value });
  }

  return (
    <aside className="editor-properties" data-testid="editor-properties">
      <header className="editor-properties-head">
        <strong>{entry.label}</strong>
        <span>{entry.description}</span>
      </header>
      <div className="editor-properties-body">
        {entry.configFields.length === 0 ? (
          <p className="editor-properties-empty">Este no nao tem configuracoes.</p>
        ) : (
          entry.configFields.map((field) => {
            const value = (config as Record<string, unknown>)[field.key];
            if (field.type === "boolean") {
              return (
                <label key={field.key} className="editor-properties-field editor-properties-field-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => setField(field.key, event.target.checked)}
                    disabled={!canEdit}
                  />
                  <span>{field.label}</span>
                </label>
              );
            }
            if (field.type === "toggle") {
              const checked = value === undefined ? Boolean(field.defaultValue ?? false) : Boolean(value);
              return (
                <div key={field.key} className="editor-properties-field editor-properties-field-toggle">
                  <span>{field.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    className={`editor-field-toggle${checked ? " is-on" : ""}`}
                    onClick={() => setField(field.key, !checked)}
                    disabled={!canEdit}
                    data-testid={`editor-field-${field.key}`}
                  >
                    <span className="editor-field-toggle-handle" />
                  </button>
                </div>
              );
            }
            if (field.type === "textarea") {
              return (
                <label key={field.key} className="editor-properties-field">
                  <span>{field.label}</span>
                  <textarea
                    rows={5}
                    value={value == null ? "" : String(value)}
                    placeholder={field.placeholder}
                    onChange={(event) => setField(field.key, event.target.value)}
                    disabled={!canEdit}
                    data-testid={`editor-field-${field.key}`}
                  />
                </label>
              );
            }
            if (field.type === "select") {
              return (
                <label key={field.key} className="editor-properties-field">
                  <span>{field.label}</span>
                  <select
                    value={value == null ? "" : String(value)}
                    onChange={(event) => setField(field.key, event.target.value)}
                    disabled={!canEdit}
                    data-testid={`editor-field-${field.key}`}
                  >
                    <option value="">—</option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (field.type === "column-select") {
              return (
                <div key={field.key} className="editor-properties-field">
                  <InNodeColumnDropdown
                    node={selectedNode}
                    sheetFrom={field.sheetFrom}
                    value={typeof value === "string" ? value : ""}
                    allowCustom={field.allowCustom}
                    label={field.label}
                    placeholder={field.placeholder}
                    disabled={!canEdit}
                    onChange={(next) => setField(field.key, next)}
                    testIdPrefix={`editor-field-${field.key}`}
                  />
                </div>
              );
            }
            if (field.type === "template") {
              return (
                <label key={field.key} className="editor-properties-field">
                  <span>{field.label}</span>
                  <TemplateField
                    node={selectedNode}
                    inputSocket={field.inputSocket}
                    value={typeof value === "string" ? value : ""}
                    placeholder={field.placeholder}
                    disabled={!canEdit}
                    onChange={(next) => setField(field.key, next)}
                    testIdPrefix={`editor-field-${field.key}`}
                  />
                </label>
              );
            }
            return (
              <label key={field.key} className="editor-properties-field">
                <span>{field.label}</span>
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={value == null ? "" : String(value)}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setField(field.key, field.type === "number" ? (raw === "" ? null : Number(raw)) : raw);
                  }}
                  disabled={!canEdit}
                  data-testid={`editor-field-${field.key}`}
                />
              </label>
            );
          })
        )}
      </div>
      {(selectedNode.dynamicOutputs?.length ?? 0) > 0 ? (
        <div className="editor-properties-dyn-outputs">
          <header className="editor-properties-dyn-head">
            <strong>Saidas adicionadas</strong>
          </header>
          <div className="editor-properties-dyn-list">
            {(selectedNode.dynamicOutputs ?? []).map((dyno) => (
              <div
                key={dyno.id}
                className="editor-properties-dyn-item"
                data-testid={`properties-dyn-${dyno.id}`}
              >
                <span className="editor-properties-dyn-label">
                  <strong>{dyno.label}</strong>
                  <small>{dyno.kind === "intrinsic" ? "intrinseco" : "coluna"} · {dyno.type.kind}</small>
                </span>
                {canEdit && onRemoveDynamicOutput ? (
                  <button
                    type="button"
                    className="editor-icon-btn"
                    onClick={() => onRemoveDynamicOutput(selectedNode.id, dyno.id)}
                    title="Remover saida"
                    data-testid={`properties-remove-dyn-${dyno.id}`}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <footer className="editor-properties-foot">
        {canEdit ? (
          <button
            type="button"
            className="editor-danger-btn"
            onClick={() => onDeleteNode(selectedNode.id)}
            data-testid="editor-delete-node"
          >
            Excluir no
          </button>
        ) : null}
      </footer>
    </aside>
  );
}
