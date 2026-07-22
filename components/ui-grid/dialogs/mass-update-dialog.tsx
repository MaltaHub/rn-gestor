"use client";

import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

import { MassTransformEditor } from "@/components/ui-grid/mass-transform-editor";
import type { TransformStep } from "@/lib/domain/string-transform";

/**
 * Alteracao em massa: aplica o mesmo valor (ou um pipeline de transformacao)
 * a todas as linhas selecionadas em uma coluna.
 *
 * Apresentacional: o estado segue no HolisticSheet. `sampleValues` chega pronto
 * (o pai calcula a amostra das linhas selecionadas) e o editor de valor entra
 * como render prop, porque depende de relacoes/lookups que vivem no pai.
 */
export type MassUpdateValueEditorRenderer = (props: {
  column: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  disabled?: boolean;
  allowBlank?: boolean;
}) => ReactNode;

type MassUpdateDialogProps = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  selectedCount: number;
  editableColumns: string[];
  column: string;
  value: string;
  clearValue: boolean;
  transformOn: boolean;
  transformSteps: TransformStep[];
  /** Amostra (ate 5) dos valores atuais da coluna nas linhas selecionadas. */
  sampleValues: string[];
  onColumnChange: (column: string) => void;
  onValueChange: (value: string) => void;
  onClearValueChange: (checked: boolean) => void;
  onTransformOnChange: (checked: boolean) => void;
  onTransformStepsChange: (steps: TransformStep[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  renderValueEditor: MassUpdateValueEditorRenderer;
};

export function MassUpdateDialog({
  open,
  submitting,
  error,
  selectedCount,
  editableColumns,
  column,
  value,
  clearValue,
  transformOn,
  transformSteps,
  sampleValues,
  onColumnChange,
  onValueChange,
  onClearValueChange,
  onTransformOnChange,
  onTransformStepsChange,
  onSubmit,
  onClose,
  renderValueEditor
}: MassUpdateDialogProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="sheet-focus-overlay" data-testid="mass-update-overlay">
      <div className="sheet-focus-dialog" role="dialog" aria-modal="true" data-testid="mass-update-dialog">
        <form className="sheet-dialog-form" onSubmit={onSubmit}>
          <header className="sheet-focus-dialog-head">
            <div>
              <strong>Alteracao em massa</strong>
              <p>{selectedCount} linha(s) selecionada(s) receberao o mesmo valor em uma coluna.</p>
            </div>
            <button
              type="button"
              className="sheet-filter-clear-btn"
              onClick={onClose}
              data-testid="mass-update-close"
            >
              Fechar
            </button>
          </header>
          <div className="sheet-focus-dialog-body">
            <div className="sheet-dialog-grid">
              <label className="sheet-form-field">
                <span>Coluna</span>
                <select
                  value={column}
                  onChange={(event) => onColumnChange(event.target.value)}
                  data-testid="mass-update-column"
                >
                  {editableColumns.map((item) => (
                    <option key={`mass-column-${item}`} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sheet-form-field">
                <span>Linhas alvo</span>
                <div className="sheet-inline-static" data-testid="mass-update-count">
                  <strong>{selectedCount}</strong>
                  <span>linhas selecionadas</span>
                </div>
              </label>
            </div>
            <label className="sheet-dialog-checkbox">
              <input
                type="checkbox"
                checked={transformOn}
                onChange={(event) => onTransformOnChange(event.target.checked)}
                data-testid="mass-update-transform-toggle"
              />
              <span>Transformar valor (avancado): condicoes + concatenar/split</span>
            </label>
            {transformOn ? (
              <MassTransformEditor
                steps={transformSteps}
                onChange={onTransformStepsChange}
                sampleValues={sampleValues}
              />
            ) : (
              <>
                <label className="sheet-dialog-checkbox">
                  <input
                    type="checkbox"
                    checked={clearValue}
                    onChange={(event) => onClearValueChange(event.target.checked)}
                    data-testid="mass-update-clear"
                  />
                  <span>Limpar o valor atual desta coluna</span>
                </label>
                {!clearValue && column ? (
                  <label className="sheet-form-field">
                    <span>Novo valor</span>
                    {renderValueEditor({
                      column,
                      value,
                      onChange: onValueChange,
                      testId: "mass-update-value",
                      disabled: submitting,
                      allowBlank: true
                    })}
                  </label>
                ) : null}
              </>
            )}
            {error ? (
              <p className="sheet-error" data-testid="mass-update-error">
                {error}
              </p>
            ) : null}
            <div className="sheet-dialog-actions">
              <button
                type="submit"
                className="sheet-form-submit"
                data-testid="mass-update-submit"
                disabled={submitting}
              >
                {submitting ? "Aplicando..." : "Aplicar alteracao"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
