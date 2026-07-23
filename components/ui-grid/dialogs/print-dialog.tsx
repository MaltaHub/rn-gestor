"use client";

import type { ComponentProps, FormEvent, MutableRefObject } from "react";
import { createPortal } from "react-dom";

import { PrintHighlightEditor } from "@/components/ui-grid/print-highlight-editor";
import { PrintComposerSidebar } from "@/components/ui-grid/print-composer/print-composer-sidebar";
import { AnchorFilterTrigger, AnchorFilterPopover } from "@/components/ui-grid/print-composer/anchor-filter";
import type { useGridPrintExport } from "@/components/ui-grid/hooks/useGridPrintExport";
import { toDisplay } from "@/components/ui-grid/value-format";
import type { PrintScope } from "@/components/ui-grid/types";

/**
 * Compositor de impressao (colunas, ordem, titulo, seccionamento, destaques,
 * preview) + gestao de templates.
 *
 * Apresentacional. O estado de impressao chega inteiro em `printExport` (o
 * proprio retorno de useGridPrintExport) e e desestruturado aqui de volta para
 * os nomes originais — foi assim que o JSX pode ser movido VERBATIM do
 * HolisticSheet, sem reescrever referencia nenhuma.
 *
 * Os demais valores (derivados, refs e handlers) ainda vivem no HolisticSheet e
 * entram como props. Quando a logica de impressao virar um hook proprio
 * (useGridPrintComposer), essa lista colapsa.
 */

const PRINT_SCOPE_OPTIONS: Array<{ value: PrintScope; label: string }> = [
  { value: "table", label: "Tabela completa" },
  { value: "filtered", label: "Tabela filtrada" },
  { value: "selected", label: "Somente linhas selecionadas" }
];

function toTestIdFragment(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

/** Move um valor uma posicao para cima/baixo preservando o resto da ordem. */
export function moveOrderedValue(values: string[], value: string, direction: "up" | "down") {
  const index = values.indexOf(value);
  if (index === -1) return values;
  if (direction === "up" && index === 0) return values;
  if (direction === "down" && index === values.length - 1) return values;

  const next = [...values];
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

/** Liga/desliga um valor mantendo a ordem de `referenceOrder`. */
export function toggleOrderedValue(
  values: string[],
  value: string,
  enabled: boolean,
  referenceOrder = values
) {
  if (enabled) {
    if (values.includes(value)) return values;
    if (!referenceOrder.includes(value)) return [...values, value];

    const next = values.filter((entry) => referenceOrder.includes(entry));
    const insertIndex = next.findIndex(
      (entry) => referenceOrder.indexOf(entry) > referenceOrder.indexOf(value)
    );
    if (insertIndex === -1) {
      return [...next, value];
    }
    return [...next.slice(0, insertIndex), value, ...next.slice(insertIndex)];
  }

  return values.filter((entry) => entry !== value);
}

type SidebarProps = ComponentProps<typeof PrintComposerSidebar>;
type HighlightEditorProps = ComponentProps<typeof PrintHighlightEditor>;
type AnchorTriggerProps = ComponentProps<typeof AnchorFilterTrigger>;

export type PrintSectionOption = { literal: string; label: string; count: number };
export type PrintPreviewColumn = { key: string; label: string };

type PrintDialogProps = {
  /** Retorno completo de useGridPrintExport (estado + setters). */
  printExport: ReturnType<typeof useGridPrintExport>;

  printTemplatesApi: {
    templates: SidebarProps["templates"];
    loading: boolean;
    error: string | null;
  };
  printActiveTemplateId: string | null;

  printAnchorFilter: AnchorTriggerProps["filter"];
  setPrintAnchorFilter: (filter: AnchorTriggerProps["filter"]) => void;
  printAnchorPopoverOpen: boolean;
  setPrintAnchorPopoverOpen: (update: boolean | ((prev: boolean) => boolean)) => void;

  printColumnReferenceOrder: string[];
  printFilterTriggerRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  printSectionOptions: PrintSectionOption[];
  printHighlightPreview: HighlightEditorProps["previews"];
  printableRows: Array<Record<string, unknown>>;
  printPreviewColumns: PrintPreviewColumn[];
  printPreviewRows: Array<Record<string, unknown>>;
  printDirty: boolean;
  printSavingTemplate: boolean;
  isPrintTableScope: boolean;

  allColumns: string[];
  rows: Array<Record<string, unknown>>;
  selectedRows: Set<string>;

  getPrintColumnLabel: (column: string) => string;
  resolveEffectivePrintValue: (row: Record<string, unknown>, column: string) => unknown;

  handleGeneratePrint: (event: FormEvent<HTMLFormElement>) => void;
  handleSelectTemplate: SidebarProps["onSelectTemplate"];
  handleClickNewTemplate: () => void;
  handleClickResetComposer: () => void;
  handleClickDeleteTemplate: () => void;
  handleClickSaveTemplate: () => void;
  addPrintHighlightRule: HighlightEditorProps["onAdd"];
  updatePrintHighlightRule: HighlightEditorProps["onUpdate"];
  removePrintHighlightRule: HighlightEditorProps["onRemove"];
  openPrintFilterPopover: (column: string) => void;
  closePrintFilterPopover: () => void;
};

export function PrintDialog({
  printExport,
  printTemplatesApi,
  printActiveTemplateId,
  printAnchorFilter,
  setPrintAnchorFilter,
  printAnchorPopoverOpen,
  setPrintAnchorPopoverOpen,
  printColumnReferenceOrder,
  printFilterTriggerRefs,
  printSectionOptions,
  printHighlightPreview,
  printableRows,
  printPreviewColumns,
  printPreviewRows,
  printDirty,
  printSavingTemplate,
  isPrintTableScope,
  allColumns,
  rows,
  selectedRows,
  getPrintColumnLabel,
  resolveEffectivePrintValue,
  handleGeneratePrint,
  handleSelectTemplate,
  handleClickNewTemplate,
  handleClickResetComposer,
  handleClickDeleteTemplate,
  handleClickSaveTemplate,
  addPrintHighlightRule,
  updatePrintHighlightRule,
  removePrintHighlightRule,
  openPrintFilterPopover,
  closePrintFilterPopover
}: PrintDialogProps) {
  const {
    printDialogOpen,
    setPrintDialogOpen,
    printTitle,
    setPrintTitle,
    printScope,
    setPrintScope,
    printColumns,
    setPrintColumns,
    printColumnLabels,
    setPrintColumnLabels,
    printFilters,
    printDisplayColumnOverrides,
    printSortRules,
    setPrintSortRules,
    printSectionColumn,
    setPrintSectionColumn,
    printSectionValues,
    setPrintSectionValues,
    printIncludeOthers,
    setPrintIncludeOthers,
    printHighlightOpacityPercent,
    setPrintHighlightOpacityPercent,
    printHighlightRules,
    printSubmitting,
    printError,
    setPrintError
  } = printExport;

  if (!printDialogOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="print-composer-overlay" data-testid="print-dialog-overlay">
      <div className="print-composer-dialog" role="dialog" aria-modal="true" data-testid="print-dialog">
        <PrintComposerSidebar
          templates={printTemplatesApi.templates}
          loading={printTemplatesApi.loading}
          activeTemplateId={printActiveTemplateId}
          title={printTitle}
          hasActiveTemplate={Boolean(printActiveTemplateId)}
          onTitleChange={setPrintTitle}
          onSelectTemplate={handleSelectTemplate}
          onClickNew={handleClickNewTemplate}
          onClickReset={handleClickResetComposer}
          onClickDelete={() => void handleClickDeleteTemplate()}
        />
        <form className="print-composer-main" onSubmit={handleGeneratePrint}>
          <header className="print-composer-main-head">
            <div className="print-composer-main-head-title">
              <strong>Imprimir / Gerar tabela</strong>
              <p>Configure colunas, ordem, titulo e seccionamento antes de imprimir.</p>
            </div>
            <div className="print-composer-main-head-actions">
              <AnchorFilterTrigger
                filter={printAnchorFilter}
                open={printAnchorPopoverOpen}
                onOpen={() => setPrintAnchorPopoverOpen((prev) => !prev)}
              />
              {printTemplatesApi.error ? (
                <span className="sheet-error" data-testid="print-templates-error">
                  {printTemplatesApi.error}
                </span>
              ) : null}
            </div>
          </header>
          {printAnchorPopoverOpen ? (
            <div className="print-composer-anchor-popover-wrap">
              <AnchorFilterPopover
                filter={printAnchorFilter}
                rows={rows}
                columns={allColumns}
                getColumnLabel={getPrintColumnLabel}
                resolveDisplayValue={resolveEffectivePrintValue}
                onApply={(next) => setPrintAnchorFilter(next)}
                onClose={() => setPrintAnchorPopoverOpen(false)}
              />
            </div>
          ) : null}
          <div className="print-composer-main-body">
            <div className="sheet-dialog-grid">
              <label className="sheet-form-field">
                <span>Titulo</span>
                <input
                  type="text"
                  value={printTitle}
                  onChange={(event) => setPrintTitle(event.target.value)}
                  data-testid="print-title"
                />
              </label>
              <label className="sheet-form-field">
                <span>Escopo</span>
                <select
                  value={printScope}
                  onChange={(event) => setPrintScope(event.target.value as PrintScope)}
                  data-testid="print-scope"
                >
                  {PRINT_SCOPE_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.value === "selected" && selectedRows.size === 0}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <section className="sheet-dialog-section">
              <div className="sheet-dialog-section-head">
                <div>
                  <strong>Colunas</strong>
                  <span>
                    {isPrintTableScope
                      ? "Selecione, renomeie, filtre e reordene as colunas que irao para a impressao."
                      : "Selecione, renomeie e reordene as colunas. Filtros e expansao dedicada so existem em Tabela."}
                  </span>
                </div>
                <div className="sheet-dialog-section-actions">
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    onClick={() => setPrintColumns(printColumnReferenceOrder)}
                    data-testid="print-columns-select-all"
                  >
                    Selecionar tudo
                  </button>
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    onClick={() => setPrintColumns([])}
                    data-testid="print-columns-clear"
                  >
                    Desselecionar
                  </button>
                </div>
              </div>
              <div className="sheet-order-list" data-testid="print-columns-list">
                {[...printColumns.filter((column) => printColumnReferenceOrder.includes(column)), ...printColumnReferenceOrder.filter((column) => !printColumns.includes(column))].map((column) => {
                  const enabled = printColumns.includes(column);
                  const activePrintFilterCount = isPrintTableScope ? printFilters[column]?.length ?? 0 : 0;
                  const printExpandedColumn = isPrintTableScope ? printDisplayColumnOverrides[column] : undefined;
                  const sortRuleIndex = printSortRules.findIndex((rule) => rule.column === column);
                  const sortRule = sortRuleIndex >= 0 ? printSortRules[sortRuleIndex] : null;
                  const cycleSortForColumn = () => {
                    setPrintSortRules((prev) => {
                      const idx = prev.findIndex((rule) => rule.column === column);
                      if (idx < 0) {
                        return [...prev, { column, direction: "asc" }];
                      }
                      if (prev[idx].direction === "asc") {
                        return prev.map((rule, i) => (i === idx ? { ...rule, direction: "desc" as const } : rule));
                      }
                      return prev.filter((_, i) => i !== idx);
                    });
                  };
                  const sortBadgeLabel = sortRule
                    ? `${sortRuleIndex + 1}. ${sortRule.direction === "asc" ? "A→Z" : "Z→A"}`
                    : "Ordenar A→Z";
                  return (
                    <div key={`print-column-${column}`} className="sheet-order-item">
                      <div className="sheet-print-column-main">
                        <label className="sheet-dialog-checkbox">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) =>
                              setPrintColumns((prev) =>
                                toggleOrderedValue(prev, column, event.target.checked, printColumnReferenceOrder)
                              )
                            }
                            data-testid={`print-column-toggle-${column}`}
                          />
                          <span>{column}</span>
                        </label>
                        <label className="sheet-form-field sheet-print-column-label-field">
                          <span>Nome na impressao</span>
                          <input
                            type="text"
                            value={printColumnLabels[column] ?? column}
                            onChange={(event) =>
                              setPrintColumnLabels((prev) => ({ ...prev, [column]: event.target.value }))
                            }
                            data-testid={`print-column-label-${column}`}
                          />
                        </label>
                        {printExpandedColumn || activePrintFilterCount > 0 ? (
                          <div className="sheet-print-column-meta">
                            {printExpandedColumn ? <span>Expandida em {printExpandedColumn}</span> : null}
                            {activePrintFilterCount > 0 ? <span>Filtro: {activePrintFilterCount}</span> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="sheet-order-actions">
                        {isPrintTableScope ? (
                          <>
                            <button
                              type="button"
                              className={`sheet-panel-head-btn print-column-sort-btn${sortRule ? " print-column-sort-btn-active" : ""}`}
                              onClick={cycleSortForColumn}
                              disabled={!enabled}
                              data-testid={`print-column-sort-${column}`}
                              title={sortRule ? `Prioridade ${sortRuleIndex + 1} (${sortRule.direction === "asc" ? "A→Z" : "Z→A"}). Clique para alternar/remover.` : "Adicionar ordenacao A→Z"}
                            >
                              {sortBadgeLabel}
                            </button>
                            <button
                              type="button"
                              className="sheet-panel-head-btn sheet-print-filter-btn"
                              onClick={() => openPrintFilterPopover(column)}
                              data-testid={`print-column-filter-${column}`}
                              ref={(element) => {
                                printFilterTriggerRefs.current[column] = element;
                              }}
                            >
                              {activePrintFilterCount > 0 ? `Filtro (${activePrintFilterCount})` : "Filtro"}
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="sheet-order-btn"
                          disabled={!enabled}
                          onClick={() => setPrintColumns((prev) => moveOrderedValue(prev, column, "up"))}
                          data-testid={`print-column-up-${column}`}
                        >
                          ^
                        </button>
                        <button
                          type="button"
                          className="sheet-order-btn"
                          disabled={!enabled}
                          onClick={() => setPrintColumns((prev) => moveOrderedValue(prev, column, "down"))}
                          data-testid={`print-column-down-${column}`}
                        >
                          v
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="sheet-dialog-section">
              <div className="sheet-dialog-grid">
                <label className="sheet-form-field">
                  <span>Separar por</span>
                  <select
                    value={printSectionColumn}
                    onChange={(event) => setPrintSectionColumn(event.target.value)}
                    data-testid="print-section-column"
                  >
                    <option value="">Sem separacao</option>
                    {allColumns.map((column) => (
                      <option key={`print-section-column-${column}`} value={column}>
                        {getPrintColumnLabel(column)}
                      </option>
                    ))}
                  </select>
                </label>
                {printSectionColumn ? (
                  <label className="sheet-dialog-checkbox sheet-dialog-checkbox-inline">
                    <input
                      type="checkbox"
                      checked={printIncludeOthers}
                      onChange={(event) => setPrintIncludeOthers(event.target.checked)}
                      data-testid="print-include-others"
                    />
                    <span>Adicionar secao Outros</span>
                  </label>
                ) : null}
              </div>
              {printSectionColumn ? (
                <>
                  <div className="sheet-dialog-section-head">
                    <div>
                      <strong>Valores tratados</strong>
                      <span>Os desmarcados poderao ser agrupados em Outros.</span>
                    </div>
                    <div className="sheet-dialog-section-actions">
                      <button
                        type="button"
                        className="sheet-filter-clear-btn"
                        onClick={() => setPrintSectionValues(printSectionOptions.map((option) => option.literal))}
                        data-testid="print-sections-select-all"
                      >
                        Selecionar tudo
                      </button>
                      <button
                        type="button"
                        className="sheet-filter-clear-btn"
                        onClick={() => setPrintSectionValues([])}
                        data-testid="print-sections-clear"
                      >
                        Desselecionar
                      </button>
                    </div>
                  </div>
                  <div className="sheet-order-list" data-testid="print-section-values-list">
                    {printSectionOptions.map((option) => {
                      const enabled = printSectionValues.includes(option.literal);
                      return (
                        <div key={`print-section-value-${option.literal}`} className="sheet-order-item">
                          <label className="sheet-dialog-checkbox">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                setPrintSectionValues((prev) =>
                                  toggleOrderedValue(prev, option.literal, event.target.checked)
                                )
                              }
                              data-testid={`print-section-toggle-${toTestIdFragment(option.literal)}`}
                            />
                            <span>
                              {option.label} <em>({option.count})</em>
                            </span>
                          </label>
                          <div className="sheet-order-actions">
                            <button
                              type="button"
                              className="sheet-order-btn"
                              disabled={!enabled}
                              onClick={() =>
                                setPrintSectionValues((prev) => moveOrderedValue(prev, option.literal, "up"))
                              }
                              data-testid={`print-section-up-${toTestIdFragment(option.literal)}`}
                            >
                              ^
                            </button>
                            <button
                              type="button"
                              className="sheet-order-btn"
                              disabled={!enabled}
                              onClick={() =>
                                setPrintSectionValues((prev) => moveOrderedValue(prev, option.literal, "down"))
                              }
                              data-testid={`print-section-down-${toTestIdFragment(option.literal)}`}
                            >
                              v
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </section>

            <PrintHighlightEditor
              allColumns={allColumns}
              getPrintColumnLabel={getPrintColumnLabel}
              opacityPercent={printHighlightOpacityPercent}
              previews={printHighlightPreview}
              rules={printHighlightRules}
              onAdd={addPrintHighlightRule}
              onOpacityChange={setPrintHighlightOpacityPercent}
              onRemove={removePrintHighlightRule}
              onUpdate={updatePrintHighlightRule}
            />

            <section className="sheet-dialog-section">
              <div className="sheet-dialog-section-head">
                <div>
                  <strong>Preview</strong>
                  <span>
                    {printableRows.length} linha(s) disponiveis, {printPreviewColumns.length} coluna(s) selecionada(s)
                  </span>
                </div>
              </div>
              <div className="sheet-print-preview" data-testid="print-preview">
                {printPreviewColumns.length === 0 ? (
                  <p>Selecione ao menos uma coluna para visualizar a impressao.</p>
                ) : printPreviewRows.length === 0 ? (
                  <p>Nao ha linhas no escopo atual.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        {printPreviewColumns.slice(0, 10).map((column) => (
                          <th key={`print-preview-head-${column.key}`}>{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {printPreviewRows.map((row, rowIndex) => (
                        <tr key={`print-preview-row-${rowIndex}`}>
                          {printPreviewColumns.slice(0, 10).map((column) => (
                            <td key={`print-preview-cell-${rowIndex}-${column.key}`}>
                              {toDisplay(resolveEffectivePrintValue(row, column.key), column.key) || " "}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {printError ? (
              <p className="sheet-error" data-testid="print-error">
                {printError}
              </p>
            ) : null}
          </div>
          <footer className="print-composer-main-foot">
            <button
              type="button"
              className="print-composer-close-btn"
              onClick={() => {
                if (printSubmitting) return;
                closePrintFilterPopover();
                setPrintAnchorPopoverOpen(false);
                setPrintDialogOpen(false);
                setPrintError(null);
              }}
              data-testid="print-dialog-close"
            >
              Fechar
            </button>
            {printDirty && printTitle.trim().length > 0 ? (
              <button
                type="button"
                className="sheet-form-submit"
                onClick={() => void handleClickSaveTemplate()}
                data-testid="print-save-template"
                disabled={printSavingTemplate}
              >
                {printSavingTemplate
                  ? "Salvando..."
                  : printActiveTemplateId
                  ? "Salvar Template"
                  : "Salvar como Template"}
              </button>
            ) : null}
            <button
              type="submit"
              className="sheet-form-submit"
              data-testid="print-submit"
              disabled={printSubmitting}
            >
              {printSubmitting ? "Gerando..." : "Imprimir"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
