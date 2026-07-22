"use client";

import { createPortal } from "react-dom";

import styles from "@/components/ui-grid/ui-grid.module.css";

/**
 * Selecionar por lista: cola-se uma lista (um valor por linha) e o grid
 * seleciona as linhas correspondentes, mostrando o que nao casou.
 *
 * Apresentacional: preview e resultado chegam prontos do HolisticSheet; as
 * acoes de "proximos passos" entram como callbacks.
 */
export type BulkSelectPreview = {
  rawCount: number;
  uniqueCount: number;
  hasIssues: boolean;
  duplicates: string[];
  malformed: string[];
};

export type BulkSelectResult = {
  matched: number;
  totalTokens: number;
  unmatched: string[];
};

type BulkSelectDialogProps = {
  open: boolean;
  /** Nome da coluna usada para casar (ex.: "placa"); null cai no rotulo generico. */
  columnLabel: string | null;
  input: string;
  preview: BulkSelectPreview;
  result: BulkSelectResult | null;
  canWrite: boolean;
  editableColumnsCount: number;
  onInputChange: (value: string) => void;
  onApply: () => void;
  onClose: () => void;
  onHideSelected: () => void;
  onConferenceMark: () => void;
  onConferenceUnmark: () => void;
  onMassUpdate: () => void;
};

export function BulkSelectDialog({
  open,
  columnLabel,
  input,
  preview,
  result,
  canWrite,
  editableColumnsCount,
  onInputChange,
  onApply,
  onClose,
  onHideSelected,
  onConferenceMark,
  onConferenceUnmark,
  onMassUpdate
}: BulkSelectDialogProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="sheet-focus-overlay" data-testid="bulk-select-overlay">
      <div className="sheet-focus-dialog is-compact" role="dialog" aria-modal="true" data-testid="bulk-select-dialog">
        <header className="sheet-focus-dialog-head">
          <div>
            <strong>Selecionar por lista</strong>
            <p>
              Cole uma lista (uma {columnLabel ?? "valor"} por linha) e o grid
              seleciona as linhas correspondentes. Os tokens nao encontrados aparecem abaixo.
            </p>
          </div>
          <button
            type="button"
            className="sheet-filter-clear-btn"
            onClick={onClose}
            data-testid="bulk-select-close"
          >
            Fechar
          </button>
        </header>
        <div className="sheet-focus-dialog-body">
          <label className="sheet-form-field">
            <span>Lista de {columnLabel ?? "valores"}</span>
            <textarea
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              rows={10}
              placeholder={`Exemplo:\nABC1A23\nDEF2B45\nGHI3C67`}
              data-testid="bulk-select-input"
              autoFocus
            />
          </label>
          {preview.rawCount > 0 ? (
            <div
              className={
                preview.hasIssues
                  ? "sheet-bulk-select-toast sheet-bulk-select-toast-warn"
                  : "sheet-bulk-select-toast sheet-bulk-select-toast-info"
              }
              data-testid="bulk-select-preview"
            >
              <div className="sheet-bulk-select-toast-summary">
                <strong>{preview.uniqueCount}</strong> token(s) unico(s)
                {preview.rawCount !== preview.uniqueCount ? ` (de ${preview.rawCount} colado(s))` : ""}.
              </div>
              {preview.duplicates.length > 0 ? (
                <div className="sheet-bulk-select-toast-unmatched">
                  <span>Duplicatas ignoradas ({preview.duplicates.length}):</span>
                  <code>{preview.duplicates.join(", ")}</code>
                </div>
              ) : null}
              {preview.malformed.length > 0 ? (
                <div className="sheet-bulk-select-toast-unmatched">
                  <span>Formato fora do padrao de placa ({preview.malformed.length}):</span>
                  <code>{preview.malformed.join(", ")}</code>
                </div>
              ) : null}
            </div>
          ) : null}
          {result ? (
            <div
              className={
                result.unmatched.length > 0
                  ? "sheet-bulk-select-toast sheet-bulk-select-toast-warn"
                  : "sheet-bulk-select-toast sheet-bulk-select-toast-ok"
              }
              data-testid="bulk-select-result"
            >
              <div className="sheet-bulk-select-toast-summary">
                <strong>{result.matched}</strong> linha(s) selecionada(s) de{" "}
                <strong>{result.totalTokens}</strong> token(s).
              </div>
              {result.unmatched.length > 0 ? (
                <div className="sheet-bulk-select-toast-unmatched">
                  <span>Nao encontrados ({result.unmatched.length}):</span>
                  <code>{result.unmatched.join(", ")}</code>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="sheet-dialog-actions">
            <button
              type="button"
              className="sheet-form-submit"
              onClick={onApply}
              data-testid="bulk-select-apply"
              disabled={input.trim().length === 0}
            >
              Selecionar
            </button>
          </div>
          {result && result.matched > 0 ? (
            <section
              className="sheet-bulk-select-actions"
              data-testid="bulk-select-next-actions"
              aria-labelledby="bulk-select-next-actions-title"
            >
              <div className="sheet-bulk-select-actions-head">
                <strong id="bulk-select-next-actions-title">Proximos passos</strong>
                <span>O que fazer com as {result.matched} linha(s) contemplada(s)?</span>
              </div>
              <div className="sheet-bulk-select-actions-grid">
                <button
                  type="button"
                  className={`${styles.btn} sheet-nav-btn`}
                  onClick={onHideSelected}
                  data-testid="bulk-select-action-hide"
                  title="Esconde as linhas contempladas (toggle se ja estavam ocultas)"
                >
                  Ocultar
                </button>
                <button
                  type="button"
                  className={`${styles.btn} sheet-nav-btn`}
                  onClick={onConferenceMark}
                  data-testid="bulk-select-action-conference-mark"
                >
                  Marcar conferencia
                </button>
                <button
                  type="button"
                  className={`${styles.btn} sheet-nav-btn`}
                  onClick={onConferenceUnmark}
                  data-testid="bulk-select-action-conference-unmark"
                >
                  Desmarcar conferencia
                </button>
                <button
                  type="button"
                  className={`${styles.btn} sheet-nav-btn`}
                  onClick={onMassUpdate}
                  data-testid="bulk-select-action-mass-update"
                  disabled={!canWrite || editableColumnsCount === 0}
                  title={
                    !canWrite
                      ? "Voce nao tem permissao de escrita neste grid"
                      : editableColumnsCount === 0
                        ? "Nao ha colunas editaveis neste grid"
                        : "Abre o dialog de alteracao em massa com estas linhas selecionadas"
                  }
                >
                  Alteracao em massa
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
