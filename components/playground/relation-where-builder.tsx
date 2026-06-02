"use client";

import { filterLeaf, filterRelation, type FilterNode } from "@/components/ui-grid/core/filter-predicate";
import type { RelationRef } from "@/components/ui-grid/core/grid-rules";
import type { SheetKey } from "@/components/ui-grid/types";

/**
 * Builder RECURSIVO de um sub-predicado de filtro aninhado (a "recursividade"
 * pedida: tooltip sobre tooltip). Em cada nivel o usuario escolhe uma coluna da
 * tabela atual; se a coluna for FK, pode marcar "aninhar" e descer para a tabela
 * relacionada (renderizando outro builder); senao, digita um valor (expressao do
 * DSL). Produz um FilterNode (folha ou relacao encadeada) controlado por value/onChange.
 */
const RELATION_BUILDER_MAX_DEPTH = 5;

type RelationWhereBuilderProps = {
  /** Tabela cujas colunas sao filtradas neste nivel. */
  table: SheetKey;
  value: FilterNode | null;
  onChange: (node: FilterNode | null) => void;
  /** Colunas disponiveis da tabela (header carregado). */
  getColumns: (table: SheetKey) => string[];
  /** Mapa de FKs da tabela (coluna -> tabela/coluna alvo). */
  getRelations: (table: SheetKey) => Record<string, RelationRef>;
  /** Dispara o carregamento do header/linhas de uma tabela mais profunda. */
  ensureTableLoaded: (table: SheetKey) => void;
  tableLabel: (table: SheetKey) => string;
  testIdPrefix: string;
  depth?: number;
};

export function RelationWhereBuilder({
  table,
  value,
  onChange,
  getColumns,
  getRelations,
  ensureTableLoaded,
  tableLabel,
  testIdPrefix,
  depth = 0
}: RelationWhereBuilderProps) {
  const relations = getRelations(table);
  const columns = getColumns(table);
  const column = value && (value.kind === "leaf" || value.kind === "relation") ? value.column : "";
  const isRelation = value?.kind === "relation";
  const relationRef = column ? relations[column] : undefined;
  const canNest = Boolean(relationRef) && depth < RELATION_BUILDER_MAX_DEPTH;

  function handleColumnChange(nextColumn: string) {
    if (!nextColumn) {
      onChange(null);
      return;
    }
    onChange(filterLeaf(nextColumn, value?.kind === "leaf" ? value.expression : ""));
  }

  function handleToggleNest(nest: boolean) {
    if (!column) return;
    const ref = relations[column];
    if (nest && ref) {
      ensureTableLoaded(ref.table);
      onChange(filterRelation({ column, table: ref.table, keyColumn: ref.keyColumn, where: filterLeaf("", "") }));
    } else {
      onChange(filterLeaf(column, ""));
    }
  }

  return (
    <div
      className="playground-feed-nested-form"
      data-testid={`${testIdPrefix}-level-${depth}`}
      style={
        depth > 0
          ? { marginLeft: 8, paddingLeft: 8, borderLeft: "2px solid rgba(148, 163, 184, 0.4)" }
          : undefined
      }
    >
      <select
        value={column}
        aria-label={`Coluna de ${tableLabel(table)}`}
        data-testid={`${testIdPrefix}-column-${depth}`}
        onChange={(event) => handleColumnChange(event.target.value)}
      >
        <option value="">Coluna de {tableLabel(table)}...</option>
        {columns.map((col) => (
          <option key={col} value={col}>
            {col}
          </option>
        ))}
      </select>

      {canNest && relationRef ? (
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "0.74rem" }}>
          <input
            type="checkbox"
            checked={isRelation}
            data-testid={`${testIdPrefix}-nest-${depth}`}
            onChange={(event) => handleToggleNest(event.target.checked)}
          />
          aninhar em {tableLabel(relationRef.table)}
        </label>
      ) : null}

      {isRelation && value?.kind === "relation" ? (
        <RelationWhereBuilder
          table={value.table}
          value={value.where}
          onChange={(nextWhere) => onChange({ ...value, where: nextWhere ?? filterLeaf("", "") })}
          getColumns={getColumns}
          getRelations={getRelations}
          ensureTableLoaded={ensureTableLoaded}
          tableLabel={tableLabel}
          testIdPrefix={testIdPrefix}
          depth={depth + 1}
        />
      ) : column ? (
        <input
          value={value?.kind === "leaf" ? value.expression : ""}
          placeholder="ex.: =DISPONÍVEL"
          aria-label="Valor do filtro"
          data-testid={`${testIdPrefix}-value-${depth}`}
          onChange={(event) => onChange(filterLeaf(column, event.target.value))}
        />
      ) : null}
    </div>
  );
}
