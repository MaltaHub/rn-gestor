"use client";

import { createPortal } from "react-dom";
import type { Ref } from "react";
import pop from "@/components/ui/dialog/popover.module.css";

export type ColumnFilterOption = { literal: string; label: string; count: number };

/** Ação da COLUNA (não do filtro): fixar, ocultar, campo da tabela ligada... */
export type ColumnFilterAction = {
  key: string;
  label: string;
  /** Explica a ação (tooltip): o que muda no grid. */
  title: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
};

export const COLUMN_FILTER_POPOVER_WIDTH = 320;

/**
 * Popover de filtro de coluna do grid (e do escopo de impressão), extraído do
 * HolisticSheet. De cima para baixo: título da coluna, busca, marcar/desmarcar
 * (e "ignorar outros filtros"), período (colunas de data), a lista de valores
 * — a ÚNICA parte que rola, para Limpar/Aplicar ficarem sempre à vista — e, no
 * rodapé, as ações da coluna separadas do filtro.
 */
export function ColumnFilterPopover(props: {
  /** "" no grid, "print-" no escopo de impressão (prefixo dos testids). */
  testIdPrefix?: "" | "print-";
  column: string;
  title: string;
  subtitle?: string | null;
  position: { top: number; left: number; maxHeight: number };
  popoverRef: Ref<HTMLDivElement>;
  search: string;
  onSearch: (value: string) => void;
  options: ColumnFilterOption[];
  selected: string[];
  onToggle: (literal: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** Só no grid: lista os valores de TODAS as linhas, ignorando os outros filtros. */
  scope?: { ignoreOtherFilters: boolean; onToggle: () => void } | null;
  date?: { from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void; onApply: () => void } | null;
  emptyMessage: string;
  actions?: ColumnFilterAction[];
  onClear: () => void;
  onApply: () => void;
}) {
  const p = props.testIdPrefix ?? "";
  const col = props.column;
  const actions = props.actions ?? [];

  return createPortal(
    <div
      className={`${pop.popover} ${pop.filter}`}
      ref={props.popoverRef}
      role="dialog"
      aria-label={`Filtro da coluna ${props.title}`}
      data-testid={`${p}filter-popover-${col}`}
      style={{ position: "fixed", top: props.position.top, left: props.position.left, maxHeight: props.position.maxHeight }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={pop.head}>
        <strong>{props.title}</strong>
        {props.subtitle ? <span className={pop.subtitle}>{props.subtitle}</span> : null}
      </div>

      <input
        className={pop.searchInput}
        placeholder="Buscar valor..."
        value={props.search}
        data-testid={`${p}filter-search-${col}`}
        onChange={(event) => props.onSearch(event.target.value)}
        autoFocus
      />

      <div className={pop.bar}>
        <button type="button" className={pop.link} data-testid={`${p}filter-select-all-${col}`} onClick={props.onSelectAll}>
          Marcar todos
        </button>
        <button type="button" className={pop.link} data-testid={`${p}filter-clear-selection-${col}`} onClick={props.onClearSelection}>
          Desmarcar
        </button>
        {props.scope ? (
          <button
            type="button"
            role="switch"
            aria-checked={props.scope.ignoreOtherFilters}
            className={pop.scope}
            data-testid={`${p}filter-show-all-values-${col}`}
            title={
              props.scope.ignoreOtherFilters
                ? "Lista os valores de todas as linhas, ignorando os filtros das outras colunas."
                : "Lista só os valores das linhas que passam nos filtros das outras colunas."
            }
            onClick={props.scope.onToggle}
          >
            <span className={pop.track} aria-hidden="true">
              <span className={pop.thumb} />
            </span>
            <span>Ignorar outros filtros</span>
          </button>
        ) : null}
      </div>

      {props.date ? (
        <div className={pop.dates} data-testid={`${p}filter-date-range-${col}`}>
          <label className={pop.dateField}>
            <span>De</span>
            <input type="date" value={props.date.from} data-testid={`${p}filter-date-from-${col}`} onChange={(event) => props.date?.onFrom(event.target.value)} />
          </label>
          <label className={pop.dateField}>
            <span>Até</span>
            <input type="date" value={props.date.to} data-testid={`${p}filter-date-to-${col}`} onChange={(event) => props.date?.onTo(event.target.value)} />
          </label>
          <button
            type="button"
            className={pop.chip}
            data-testid={`${p}filter-date-apply-${col}`}
            onClick={props.date.onApply}
            disabled={!props.date.from && !props.date.to}
          >
            Marcar o período
          </button>
        </div>
      ) : null}

      <div className={pop.checkList} role="group" aria-label="Valores">
        {props.options.length === 0 ? (
          <p>{props.search.trim() ? "Nenhum valor com essa busca." : props.emptyMessage}</p>
        ) : (
          props.options.map((option) => (
            <label key={option.literal} className={pop.checkOption}>
              <input
                type="checkbox"
                checked={props.selected.includes(option.literal)}
                data-testid={`${p}filter-option-${col}-${toTestIdFragment(option.literal)}`}
                onChange={() => props.onToggle(option.literal)}
              />
              <span title={option.label}>{option.label}</span>
              <em>{option.count}</em>
            </label>
          ))
        )}
      </div>

      <div className={pop.footer}>
        <span className={pop.count}>{props.selected.length > 0 ? `${props.selected.length} marcado(s)` : "Nenhum marcado"}</span>
        <button type="button" className={pop.btn} data-testid={`${p}filter-clear-${col}`} onClick={props.onClear}>
          Limpar
        </button>
        <button type="button" className={`${pop.btn} ${pop.primary}`} data-testid={`${p}filter-apply-${col}`} onClick={props.onApply}>
          Aplicar
        </button>
      </div>

      {actions.length > 0 ? (
        <div className={pop.actions} role="group" aria-label="Ações da coluna">
          <span className={pop.actionsLabel}>Coluna</span>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={pop.link}
              title={action.title}
              data-testid={action.testId}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

/** Fragmento de testid de um valor (o mesmo de sempre do grid: os e2e dependem dele). */
export function toTestIdFragment(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}
