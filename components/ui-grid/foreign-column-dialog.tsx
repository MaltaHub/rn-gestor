"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  FOREIGN_AGGREGATE_LABELS,
  findForeignPaths,
  formatReverseSegment,
  type ForeignAggregate,
  type ForeignPath
} from "@/components/ui-grid/core/foreign-columns";
import { getRelationFor } from "@/components/ui-grid/core/relations";
import styles from "@/components/ui-grid/foreign-column-dialog.module.css";
import type { GridListPayload, SheetConfig, SheetKey } from "@/components/ui-grid/types";

type Props = {
  sheetKey: SheetKey;
  /** Tabelas que o usuário pode ler (destinos possíveis). */
  sheets: SheetConfig[];
  /** Atalho do popover de uma FK: já parte por ela. */
  initialBase?: string | null;
  loadTable: (table: SheetKey) => Promise<GridListPayload | null>;
  existingKeys: string[];
  onAdd: (key: string) => void;
  onClose: () => void;
};

const AGGREGATES: ForeignAggregate[] = ["ultimo", "primeiro", "lista", "contagem"];

function reverseParts(segment: string) {
  const match = /^<([a-z0-9_]+)\.([a-z0-9_]+)/.exec(segment);
  return match ? { table: match[1] as SheetKey, column: match[2] } : null;
}

function describePath(from: SheetKey, segments: string[]) {
  let current: SheetKey = from;
  const parts: string[] = [from];
  for (const segment of segments) {
    const reverse = reverseParts(segment);
    if (reverse) {
      parts.push(`← ${reverse.table} (${reverse.column})`);
      current = reverse.table;
    } else {
      const relation = getRelationFor(current, segment);
      parts.push(`→ ${relation?.table ?? "?"} (${segment})`);
      current = relation?.table ?? current;
    }
  }
  return parts.join(" ");
}

/**
 * Adicionar coluna de QUALQUER outra tabela: escolhe a tabela, o sistema acha
 * a ligação pelas FKs (nos dois sentidos), o usuário escolhe a coluna (podendo
 * entrar nas FKs dela) e, quando a ligação traz várias linhas, como agregar.
 */
export function ForeignColumnDialog({ sheetKey, sheets, initialBase, loadTable, existingKeys, onAdd, onClose }: Props) {
  const readable = useMemo(() => new Set(sheets.map((sheet) => sheet.key)), [sheets]);
  const baseRelation = initialBase ? getRelationFor(sheetKey, initialBase) : null;

  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<SheetKey | null>(baseRelation?.table ?? null);
  const [pathIndex, setPathIndex] = useState(0);
  const [drill, setDrill] = useState<string[]>([]);
  const [payloads, setPayloads] = useState<Partial<Record<SheetKey, GridListPayload>>>({});
  const [chosenColumn, setChosenColumn] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<ForeignAggregate>("ultimo");
  const [whereColumn, setWhereColumn] = useState("");
  const [whereValue, setWhereValue] = useState("");

  const tableOptions = useMemo(
    () =>
      sheets
        .filter((sheet) => sheet.key !== sheetKey)
        .map((sheet) => ({ sheet, paths: findForeignPaths({ from: sheetKey, to: sheet.key, readable: (table) => readable.has(table) }) }))
        .filter(({ sheet }) => `${sheet.label} ${sheet.key} ${sheet.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((left, right) => Number(right.paths.length > 0) - Number(left.paths.length > 0)),
    [readable, search, sheetKey, sheets]
  );

  const paths: ForeignPath[] = useMemo(() => {
    if (!target) return [];
    if (initialBase && baseRelation && target === baseRelation.table) return [{ segments: [initialBase], tables: [target], multi: false }];
    return findForeignPaths({ from: sheetKey, to: target, readable: (table) => readable.has(table) });
  }, [baseRelation, initialBase, readable, sheetKey, target]);
  const path = paths[pathIndex] ?? null;

  // Tabela onde as colunas estão sendo escolhidas (destino + FKs em que o usuário entrou).
  const currentTable = useMemo(() => {
    if (!target) return null;
    let table: SheetKey = target;
    for (const column of drill) {
      const relation = getRelationFor(table, column);
      if (!relation) return null;
      table = relation.table;
    }
    return table;
  }, [drill, target]);

  const lastReverse = useMemo(() => {
    const reverse = [...(path?.segments ?? [])].reverse().find((segment) => segment.startsWith("<"));
    return reverse ? reverseParts(reverse) : null;
  }, [path]);

  useEffect(() => {
    const needed = [currentTable, lastReverse?.table].filter((table): table is SheetKey => Boolean(table) && !payloads[table as SheetKey]);
    for (const table of needed) {
      void loadTable(table).then((payload) => {
        if (payload) setPayloads((previous) => ({ ...previous, [table]: payload }));
      });
    }
  }, [currentTable, lastReverse, loadTable, payloads]);

  const columns = currentTable ? payloads[currentTable]?.header.filter((column) => !column.startsWith("__")) ?? null : null;
  const whereValues = useMemo(() => {
    if (!lastReverse || !whereColumn) return [];
    const rows = payloads[lastReverse.table]?.rows ?? [];
    return Array.from(new Set(rows.map((row) => row[whereColumn]).filter((value) => value != null && value !== "").map(String))).sort();
  }, [lastReverse, payloads, whereColumn]);

  function buildKey(column: string) {
    if (!path) return null;
    const segments = [...path.segments];
    if (lastReverse && whereColumn && whereValue) {
      const index = segments.map((segment) => segment.startsWith("<")).lastIndexOf(true);
      segments[index] = formatReverseSegment(lastReverse.table, lastReverse.column, { column: whereColumn, value: whereValue });
    }
    return [...segments, ...drill, column].join(">") + (path.multi ? `|${aggregate}` : "");
  }

  function choose(column: string) {
    if (path?.multi) {
      setChosenColumn(column);
      return;
    }
    const key = buildKey(column);
    if (key) onAdd(key);
  }

  function selectTable(table: SheetKey | null) {
    setTarget(table);
    setPathIndex(0);
    setDrill([]);
    setChosenColumn(null);
    setWhereColumn("");
    setWhereValue("");
  }

  function goBack() {
    if (chosenColumn) setChosenColumn(null);
    else if (drill.length > 0) setDrill(drill.slice(0, -1));
    else if (initialBase) onClose();
    else selectTable(null);
  }

  if (typeof document === "undefined") return null;
  const pendingKey = chosenColumn ? buildKey(chosenColumn) : null;

  return createPortal(
    <div className="sheet-focus-overlay" data-testid="foreign-dialog-overlay" onClick={onClose}>
      <div className={`sheet-focus-dialog ${styles.dialog}`} role="dialog" aria-modal="true" data-testid="foreign-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-focus-dialog-head">
          <div>
            <strong>Adicionar coluna de outra tabela</strong>
            <p>
              Grid: {sheetKey}
              {target ? ` · origem: ${target}` : ""}
            </p>
          </div>
          <button type="button" className="sheet-panel-close" onClick={onClose} aria-label="Fechar" data-testid="foreign-dialog-close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {!target ? (
            <>
              <input
                className={styles.search}
                autoFocus
                placeholder="Buscar tabela…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-testid="foreign-table-search"
              />
              <ul className={styles.list}>
                {tableOptions.map(({ sheet, paths: options }) => (
                  <li key={sheet.key}>
                    <button
                      type="button"
                      className={styles.option}
                      disabled={options.length === 0}
                      onClick={() => selectTable(sheet.key)}
                      data-testid={`foreign-table-${sheet.key}`}
                      title={options.length === 0 ? "Sem ligação com esta tabela" : describePath(sheetKey, options[0].segments)}
                    >
                      <strong>{sheet.label}</strong>
                      <small>{options.length === 0 ? "sem ligação" : options[0].multi ? "várias por linha" : "uma por linha"}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className={styles.crumbs}>
                <button type="button" className={styles.link} onClick={goBack} data-testid="foreign-back">
                  ← Voltar
                </button>
                {paths.length > 1 ? (
                  <select value={pathIndex} onChange={(event) => setPathIndex(Number(event.target.value))} data-testid="foreign-path-select">
                    {paths.map((option, index) => (
                      <option key={option.segments.join(">")} value={index}>
                        {describePath(sheetKey, option.segments)}
                      </option>
                    ))}
                  </select>
                ) : path ? (
                  <span className={styles.path}>{describePath(sheetKey, path.segments)}</span>
                ) : null}
                {drill.length > 0 ? <span className={styles.path}>› {drill.join(" › ")}</span> : null}
              </div>

              {chosenColumn && path?.multi ? (
                <div className={styles.multi} data-testid="foreign-multi">
                  <p>
                    Cada linha do grid pode ter <b>várias</b> em {lastReverse?.table}. Coluna: <b>{chosenColumn}</b>
                  </p>
                  <label>
                    Mostrar
                    <select value={aggregate} onChange={(event) => setAggregate(event.target.value as ForeignAggregate)} data-testid="foreign-agg">
                      {AGGREGATES.map((option) => (
                        <option key={option} value={option}>
                          {FOREIGN_AGGREGATE_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Só quando
                    <select
                      value={whereColumn}
                      onChange={(event) => {
                        setWhereColumn(event.target.value);
                        setWhereValue("");
                      }}
                      data-testid="foreign-where-column"
                    >
                      <option value="">(todas)</option>
                      {(payloads[lastReverse?.table as SheetKey]?.header ?? [])
                        .filter((column) => !column.startsWith("__"))
                        .map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                    </select>
                    {whereColumn ? (
                      <select value={whereValue} onChange={(event) => setWhereValue(event.target.value)} data-testid="foreign-where-value">
                        <option value="">(escolha)</option>
                        {whereValues.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </label>
                  <div className={styles.actions}>
                    <button type="button" className="sheet-form-secondary" onClick={() => setChosenColumn(null)}>
                      Trocar coluna
                    </button>
                    <button
                      type="button"
                      className="sheet-form-primary"
                      disabled={!pendingKey || existingKeys.includes(pendingKey) || Boolean(whereColumn && !whereValue)}
                      onClick={() => pendingKey && onAdd(pendingKey)}
                      data-testid="foreign-add"
                    >
                      Adicionar coluna
                    </button>
                  </div>
                </div>
              ) : (
                <ul className={styles.list}>
                  {columns === null ? <li className={styles.hint}>Carregando colunas…</li> : null}
                  {(columns ?? []).map((column) => {
                    const relation = currentTable ? getRelationFor(currentTable, column) : null;
                    const key = path && !path.multi ? buildKey(column) : null;
                    const already = Boolean(key && existingKeys.includes(key));
                    return (
                      <li key={column} className={styles.columnRow}>
                        <button
                          type="button"
                          className={styles.option}
                          disabled={already}
                          onClick={() => choose(column)}
                          data-testid={`foreign-col-use-${column}`}
                        >
                          <strong>{column}</strong>
                          <small>{already ? "já adicionada" : `${currentTable}.${column}`}</small>
                        </button>
                        {relation && drill.length + (path?.segments.length ?? 0) < 6 ? (
                          <button type="button" className={styles.enter} onClick={() => setDrill([...drill, column])} data-testid={`foreign-col-enter-${column}`}>
                            entrar em {relation.table} ›
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
