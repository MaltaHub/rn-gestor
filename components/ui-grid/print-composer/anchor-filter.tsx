"use client";

import { useMemo, useState } from "react";
import type { PrintAnchorFilter } from "@/components/ui-grid/print-composer/types";

export type AnchorFilterTriggerProps = {
  filter: PrintAnchorFilter | null;
  onOpen: () => void;
  open: boolean;
};

export function AnchorFilterTrigger({ filter, onOpen, open }: AnchorFilterTriggerProps) {
  const activeCount = filter ? Object.values(filter.values).filter((list) => list.length > 0).length : 0;
  const isActive = activeCount > 0;

  return (
    <button
      type="button"
      className={`print-composer-anchor-trigger${isActive ? " print-composer-anchor-trigger-active" : ""}`}
      onClick={onOpen}
      aria-expanded={open}
      data-testid="print-composer-anchor-trigger"
      title={
        isActive
          ? `${activeCount} coluna(s) com filtro ancora ativo`
          : "Filtro ancora (pre-filtro do dataset)"
      }
    >
      <span aria-hidden="true">⚲</span>
      <span>Filtro ancora{isActive ? ` (${activeCount})` : ""}</span>
    </button>
  );
}

export type AnchorFilterPopoverProps = {
  filter: PrintAnchorFilter | null;
  rows: ReadonlyArray<Record<string, unknown>>;
  columns: ReadonlyArray<string>;
  getColumnLabel: (column: string) => string;
  resolveDisplayValue: (row: Record<string, unknown>, column: string) => unknown;
  onApply: (next: PrintAnchorFilter | null) => void;
  onClose: () => void;
};

function buildOptions(
  rows: ReadonlyArray<Record<string, unknown>>,
  column: string,
  resolveDisplayValue: AnchorFilterPopoverProps["resolveDisplayValue"]
): Array<{ literal: string; label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
    const raw = row[column];
    const literal = raw == null ? "" : String(raw);
    if (literal === "") continue;
    const display = resolveDisplayValue(row, column);
    const label = display == null || display === "" ? literal : String(display);
    const current = counts.get(literal);
    if (current) {
      current.count += 1;
    } else {
      counts.set(literal, { label, count: 1 });
    }
  }
  return Array.from(counts.entries())
    .map(([literal, info]) => ({ literal, label: info.label, count: info.count }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function AnchorFilterPopover(props: AnchorFilterPopoverProps) {
  const { filter, rows, columns, getColumnLabel, resolveDisplayValue, onApply, onClose } = props;
  const initial = filter?.values ?? {};
  const [draft, setDraft] = useState<Record<string, string[]>>(initial);
  const [selectedColumn, setSelectedColumn] = useState<string>("");

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.localeCompare(b, "pt-BR")), [columns]);

  const options = useMemo(() => {
    if (!selectedColumn) return [];
    return buildOptions(rows, selectedColumn, resolveDisplayValue);
  }, [rows, selectedColumn, resolveDisplayValue]);

  const activeColumns = Object.entries(draft).filter(([, values]) => values.length > 0).map(([col]) => col);

  function toggleValue(column: string, literal: string) {
    setDraft((prev) => {
      const current = prev[column] ?? [];
      const next = current.includes(literal)
        ? current.filter((value) => value !== literal)
        : [...current, literal];
      const out = { ...prev, [column]: next };
      if (next.length === 0) delete out[column];
      return out;
    });
  }

  function clearColumn(column: string) {
    setDraft((prev) => {
      const out = { ...prev };
      delete out[column];
      return out;
    });
  }

  function apply() {
    const cleaned: Record<string, string[]> = {};
    for (const [column, values] of Object.entries(draft)) {
      if (values.length > 0) cleaned[column] = values;
    }
    if (Object.keys(cleaned).length === 0) {
      onApply(null);
    } else {
      onApply({ values: cleaned });
    }
    onClose();
  }

  function clearAll() {
    setDraft({});
  }

  return (
    <div className="print-composer-anchor-popover" role="dialog" aria-label="Filtro ancora" data-testid="print-composer-anchor-popover">
      <header className="print-composer-anchor-popover-head">
        <strong>Filtro ancora</strong>
        <span>Estreita o dataset antes da impressao. Funciona como pre-filtro independente.</span>
      </header>

      {activeColumns.length > 0 ? (
        <div className="print-composer-anchor-active">
          {activeColumns.map((column) => (
            <button
              key={`anchor-active-${column}`}
              type="button"
              className="print-composer-anchor-chip"
              onClick={() => clearColumn(column)}
              data-testid={`print-composer-anchor-chip-${column}`}
              title="Remover filtro desta coluna"
            >
              {getColumnLabel(column)} ({draft[column]?.length ?? 0}) ×
            </button>
          ))}
        </div>
      ) : null}

      <label className="print-composer-anchor-column-picker">
        <span>Coluna</span>
        <select
          value={selectedColumn}
          onChange={(event) => setSelectedColumn(event.target.value)}
          data-testid="print-composer-anchor-column-select"
        >
          <option value="">Selecione...</option>
          {sortedColumns.map((column) => (
            <option key={`anchor-col-${column}`} value={column}>
              {getColumnLabel(column)}
            </option>
          ))}
        </select>
      </label>

      {selectedColumn ? (
        <div className="print-composer-anchor-values" data-testid="print-composer-anchor-values">
          {options.length === 0 ? (
            <p className="print-composer-anchor-empty">Nenhum valor disponivel nesta coluna.</p>
          ) : (
            options.map((option) => {
              const checked = draft[selectedColumn]?.includes(option.literal) ?? false;
              return (
                <label key={`anchor-value-${option.literal}`} className="print-composer-anchor-value">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(selectedColumn, option.literal)}
                    data-testid={`print-composer-anchor-toggle-${option.literal}`}
                  />
                  <span>
                    {option.label} <em>({option.count})</em>
                  </span>
                </label>
              );
            })
          )}
        </div>
      ) : null}

      <footer className="print-composer-anchor-popover-foot">
        <button type="button" className="sheet-filter-clear-btn" onClick={clearAll} data-testid="print-composer-anchor-clear">
          Limpar tudo
        </button>
        <button type="button" className="sheet-filter-clear-btn" onClick={onClose} data-testid="print-composer-anchor-cancel">
          Cancelar
        </button>
        <button type="button" className="sheet-form-submit" onClick={apply} data-testid="print-composer-anchor-apply">
          Aplicar
        </button>
      </footer>
    </div>
  );
}

export function applyAnchorFilter(
  rows: ReadonlyArray<Record<string, unknown>>,
  filter: PrintAnchorFilter | null
): Array<Record<string, unknown>> {
  if (!filter || Object.keys(filter.values).length === 0) return rows as Array<Record<string, unknown>>;
  return rows.filter((row) => {
    for (const [column, allowed] of Object.entries(filter.values)) {
      if (allowed.length === 0) continue;
      const raw = row[column];
      const literal = raw == null ? "" : String(raw);
      if (!allowed.includes(literal)) return false;
    }
    return true;
  });
}
