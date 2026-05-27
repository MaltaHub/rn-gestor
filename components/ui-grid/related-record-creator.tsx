"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ApiClientError, fetchSheetRows, upsertSheetRow } from "@/components/ui-grid/api";
import { RELATION_BY_SHEET_COLUMN } from "@/components/ui-grid/core/grid-rules";
import {
  getFormFieldKind,
  parseBooleanLikeValue,
  type FormFieldContext,
  type FormPickerOption
} from "@/components/ui-grid/sheet-form";
import type { GridListPayload, RequestAuth, SheetKey } from "@/components/ui-grid/types";
import { getGridTableConfig } from "@/lib/api/grid-config";

type RelationRef = { table: SheetKey; keyColumn: string };

type RelatedRecordCreatorProps = {
  /** Tabela onde o novo registro sera criado. */
  table: SheetKey;
  requestAuth: RequestAuth;
  /** Opcoes de lookup por coluna (reaproveitadas do form principal). */
  lookupOptionsByColumn: Record<string, FormPickerOption[]>;
  /** Profundidade de empilhamento (z-index). */
  depth?: number;
  /** Recebe a PK do registro criado. */
  onCreated: (primaryKey: string) => void;
  onCancel: () => void;
};

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function relationDisplayColumn(payload: GridListPayload, keyColumn: string): string {
  return (
    payload.header.find(
      (header) =>
        header !== keyColumn &&
        header !== "created_at" &&
        header !== "updated_at" &&
        !header.startsWith("__") &&
        !header.endsWith("_id")
    ) ?? keyColumn
  );
}

export function RelatedRecordCreator({
  table,
  requestAuth,
  lookupOptionsByColumn,
  depth = 0,
  onCreated,
  onCancel
}: RelatedRecordCreatorProps) {
  const config = getGridTableConfig(table);
  const relationByColumn = useMemo(
    () => (RELATION_BY_SHEET_COLUMN[table] ?? {}) as Record<string, RelationRef>,
    [table]
  );
  const formColumns = useMemo(() => config?.formColumns ?? [], [config]);

  const fieldContext: FormFieldContext = useMemo(
    () => ({ activeSheetKey: table, relationByColumn, lookupOptionsByColumn, sampleValueByColumn: {} }),
    [table, relationByColumn, lookupOptionsByColumn]
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [relationRows, setRelationRows] = useState<Partial<Record<string, GridListPayload>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nested, setNested] = useState<{ column: string; table: SheetKey } | null>(null);

  const loadRelation = useCallback(
    async (relTable: SheetKey) => {
      const data = await fetchSheetRows({
        table: relTable,
        requestAuth,
        page: 1,
        pageSize: 1000,
        query: "",
        matchMode: "contains",
        filters: {},
        sort: []
      });
      setRelationRows((prev) => ({ ...prev, [relTable]: data }));
      return data;
    },
    [requestAuth]
  );

  // Carrega as tabelas relacionadas dos campos do form.
  useEffect(() => {
    const relTables = Array.from(
      new Set(formColumns.map((column) => relationByColumn[column]?.table).filter(Boolean) as SheetKey[])
    );
    for (const relTable of relTables) {
      void loadRelation(relTable).catch(() => undefined);
    }
  }, [formColumns, relationByColumn, loadRelation]);

  // Defaults: lookups e booleans entram preenchidos; relacoes pegam a 1a opcao.
  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      for (const column of formColumns) {
        if (next[column] !== undefined) continue;
        const kind = getFormFieldKind(fieldContext, column);
        if (kind === "lookup") next[column] = lookupOptionsByColumn[column]?.[0]?.value ?? "";
        else if (kind === "boolean") next[column] = "true";
        else next[column] = "";
      }
      return next;
    });
  }, [formColumns, fieldContext, lookupOptionsByColumn]);

  const relationOptionsFor = useCallback(
    (column: string): FormPickerOption[] => {
      const relation = relationByColumn[column];
      if (!relation) return [];
      const payload = relationRows[relation.table];
      if (!payload) return [];
      const displayColumn = relationDisplayColumn(payload, relation.keyColumn);
      return payload.rows
        .filter((row) => row[relation.keyColumn] != null)
        .map((row) => ({
          value: String(row[relation.keyColumn]),
          label: String(row[displayColumn] ?? row[relation.keyColumn])
        }));
    },
    [relationByColumn, relationRows]
  );

  // Preenche relacoes vazias com a 1a opcao quando as opcoes chegam.
  useEffect(() => {
    setValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const column of formColumns) {
        if (!relationByColumn[column]) continue;
        if (next[column]) continue;
        const first = relationOptionsFor(column)[0]?.value;
        if (first) {
          next[column] = first;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [formColumns, relationByColumn, relationOptionsFor]);

  function coerce(column: string): unknown {
    const kind = getFormFieldKind(fieldContext, column);
    const raw = (values[column] ?? "").trim();
    if (kind === "boolean") return parseBooleanLikeValue(raw) ?? false;
    if (raw === "") return null;
    if (kind === "number") {
      const parsed = Number(raw.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return raw;
  }

  async function submit() {
    if (!config) {
      setError("Tabela sem configuracao.");
      return;
    }
    setError(null);
    const writableColumns = config.editableColumns.length > 0 ? config.editableColumns : formColumns;
    const row: Record<string, unknown> = {};
    for (const column of writableColumns) {
      row[column] = coerce(column);
    }
    setBusy(true);
    try {
      const { row: created } = await upsertSheetRow({ table, requestAuth, row, mode: "insert" });
      const pk = String(created[config.primaryKey] ?? "");
      if (!pk) {
        throw new Error("Registro criado sem identificador.");
      }
      onCreated(pk);
    } catch (err) {
      setError(errorMessage(err, "Falha ao criar registro."));
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  const label = config?.label ?? table;

  return createPortal(
    <div
      className="rrc-overlay"
      style={{ zIndex: 1400 + depth * 10 }}
      data-testid={`related-creator-${table}`}
      onClick={onCancel}
    >
      <div className="rrc-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="rrc-head">
          <strong>Novo: {label}</strong>
          <button type="button" className="rrc-close" onClick={onCancel} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="rrc-body">
          {!config || formColumns.length === 0 ? (
            <p className="rrc-empty">Esta tabela nao tem campos editaveis.</p>
          ) : (
            formColumns.map((column, index) => {
              const kind = getFormFieldKind(fieldContext, column);
              const setValue = (value: string) => setValues((prev) => ({ ...prev, [column]: value }));
              const autoFocus = index === 0;

              return (
                <label key={column} className="rrc-field">
                  <span>{column}</span>
                  {kind === "relation" ? (
                    <span className="rrc-inline">
                      <select
                        value={values[column] ?? ""}
                        data-testid={`rrc-field-${column}`}
                        onChange={(event) => setValue(event.target.value)}
                        autoFocus={autoFocus}
                      >
                        <option value="">Selecione...</option>
                        {relationOptionsFor(column).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rrc-add"
                        title={`Adicionar ${relationByColumn[column]?.table}`}
                        data-testid={`rrc-add-${column}`}
                        onClick={() => {
                          const relation = relationByColumn[column];
                          if (relation) setNested({ column, table: relation.table });
                        }}
                      >
                        +
                      </button>
                    </span>
                  ) : kind === "lookup" ? (
                    <select
                      value={values[column] ?? ""}
                      data-testid={`rrc-field-${column}`}
                      onChange={(event) => setValue(event.target.value)}
                      autoFocus={autoFocus}
                    >
                      <option value="">Selecione...</option>
                      {(lookupOptionsByColumn[column] ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : kind === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={parseBooleanLikeValue(values[column] ?? "") === true}
                      data-testid={`rrc-field-${column}`}
                      onChange={(event) => setValue(event.target.checked ? "true" : "false")}
                    />
                  ) : kind === "number" ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={values[column] ?? ""}
                      data-testid={`rrc-field-${column}`}
                      onChange={(event) => setValue(event.target.value)}
                      autoFocus={autoFocus}
                    />
                  ) : kind === "datetime" ? (
                    <input
                      type="datetime-local"
                      value={values[column] ?? ""}
                      data-testid={`rrc-field-${column}`}
                      onChange={(event) => setValue(event.target.value)}
                      autoFocus={autoFocus}
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[column] ?? ""}
                      data-testid={`rrc-field-${column}`}
                      onChange={(event) => setValue(event.target.value)}
                      autoFocus={autoFocus}
                    />
                  )}
                </label>
              );
            })
          )}

          {error ? (
            <p className="rrc-error" data-testid={`rrc-error-${table}`}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="rrc-actions">
          <button type="button" className="rrc-btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="rrc-btn-primary"
            onClick={() => void submit()}
            disabled={busy || !config || formColumns.length === 0}
            data-testid={`rrc-submit-${table}`}
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {nested ? (
        <RelatedRecordCreator
          table={nested.table}
          requestAuth={requestAuth}
          lookupOptionsByColumn={lookupOptionsByColumn}
          depth={depth + 1}
          onCreated={(key) => {
            setValues((prev) => ({ ...prev, [nested.column]: key }));
            void loadRelation(nested.table).catch(() => undefined);
            setNested(null);
          }}
          onCancel={() => setNested(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}
