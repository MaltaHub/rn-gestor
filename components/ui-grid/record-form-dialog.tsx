"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiClientError, fetchAllSheetRows, lookupCarByPlate, upsertSheetRow } from "@/components/ui-grid/api";
import { RELATION_BY_SHEET_COLUMN, DEFAULT_RELATION_DISPLAY_COLUMN } from "@/components/ui-grid/core/grid-rules";
import {
  getFormFieldKind,
  isCarModelTextInput,
  parseBooleanLikeValue,
  type FormFieldContext,
  type FormPickerOption
} from "@/components/ui-grid/sheet-form";
import type { GridListPayload, RequestAuth, SheetKey } from "@/components/ui-grid/types";
import { normalizeBulkToken } from "@/components/ui-grid/value-format";
import { FocusDialog, dialogStyles as styles } from "@/components/ui/dialog/focus-dialog";
import {
  FormField,
  PlusIcon,
  SearchIcon,
  ToggleField,
  optionLabelsWithoutKeys,
  recordFormStyles as formStyles
} from "@/components/ui-grid/record-form-parts";
import { humanizeColumn } from "@/lib/domain/column-labels";
import { normalizeCarColorValue } from "@/lib/domain/car-colors";
import { getGridTableConfig } from "@/lib/api/grid-config";

type RelationRef = { table: SheetKey; keyColumn: string };

/** Pedido para abrir o form de registro de uma tabela (o "+" ao lado de um campo). */
export type RecordFormRequest = {
  table: SheetKey;
  /** Valores já digitados (ex.: o nome do modelo que não existia). */
  initialValues?: Record<string, string>;
  title?: string;
  onCreated: (primaryKey: string, row: Record<string, unknown>) => void;
};

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function relationDisplayColumn(payload: GridListPayload, relation: RelationRef): string {
  const preferred = DEFAULT_RELATION_DISPLAY_COLUMN[relation.table];
  if (preferred && payload.header.includes(preferred)) return preferred;
  return (
    payload.header.find(
      (header) =>
        header !== relation.keyColumn &&
        header !== "created_at" &&
        header !== "updated_at" &&
        !header.startsWith("__") &&
        !header.endsWith("_id")
    ) ?? relation.keyColumn
  );
}

/**
 * Form de REGISTRO padrão (qualquer tabela): campos do config, "+" nas FKs abre
 * outro form por cima (recursivo, até o usuário fechar a cadeia). CARROS é a
 * exceção: busca pela placa e modelo digitado (com "+" para cadastrar).
 */
export function RecordFormDialog({
  table,
  requestAuth,
  lookupOptionsByColumn,
  initialValues,
  title,
  onCreated,
  onCancel
}: Omit<RecordFormRequest, "onCreated"> & {
  requestAuth: RequestAuth;
  lookupOptionsByColumn: Record<string, FormPickerOption[]>;
  onCreated: (primaryKey: string, row: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const config = getGridTableConfig(table);
  const relationByColumn = useMemo(() => (RELATION_BY_SHEET_COLUMN[table] ?? {}) as Record<string, RelationRef>, [table]);
  const formColumns = useMemo(() => config?.formColumns ?? [], [config]);
  const isCarros = table === "carros";

  const fieldContext: FormFieldContext = useMemo(
    () => ({ activeSheetKey: table, relationByColumn, lookupOptionsByColumn, sampleValueByColumn: {} }),
    [table, relationByColumn, lookupOptionsByColumn]
  );

  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(initialValues ?? {}) }));
  const [relationRows, setRelationRows] = useState<Partial<Record<string, GridListPayload>>>({});
  const [busy, setBusy] = useState(false);
  const [plateBusy, setPlateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [nested, setNested] = useState<(RecordFormRequest & { column: string }) | null>(null);

  const loadRelation = useCallback(
    async (relTable: SheetKey) => {
      // Domínio COMPLETO: as opções do campo precisam de todas as linhas.
      const data = await fetchAllSheetRows({ table: relTable, requestAuth });
      setRelationRows((prev) => ({ ...prev, [relTable]: data }));
      return data;
    },
    [requestAuth]
  );

  useEffect(() => {
    const relTables = new Set(formColumns.map((column) => relationByColumn[column]?.table).filter(Boolean) as SheetKey[]);
    for (const relTable of relTables) void loadRelation(relTable).catch(() => undefined);
  }, [formColumns, relationByColumn, loadRelation]);

  // Padrões: lookups e booleans entram preenchidos.
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
      const payload = relation ? relationRows[relation.table] : null;
      if (!relation || !payload) return [];
      const displayColumn = relationDisplayColumn(payload, relation);
      return payload.rows
        .filter((row) => row[relation.keyColumn] != null)
        .map((row) => ({ value: String(row[relation.keyColumn]), label: String(row[displayColumn] ?? row[relation.keyColumn]) }));
    },
    [relationByColumn, relationRows]
  );

  function setValue(column: string, value: string) {
    setValues((prev) => ({ ...prev, [column]: value }));
  }

  function coerce(column: string): unknown {
    const kind = getFormFieldKind(fieldContext, column);
    const raw = (values[column] ?? "").trim();
    if (isCarModelTextInput(table, column)) {
      // Modelo digitado: resolve o NOME para o id (cadastro novo pelo "+").
      if (!raw) return null;
      const match = relationOptionsFor(column).find(
        (option) => option.value === raw || normalizeBulkToken(option.label) === normalizeBulkToken(raw)
      );
      if (!match) throw new Error(`Modelo "${raw}" não cadastrado — use o + ao lado para criar.`);
      return match.value;
    }
    if (kind === "boolean") return parseBooleanLikeValue(raw) ?? false;
    if (raw === "") return null;
    if (kind === "number") {
      const parsed = Number(raw.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (kind === "datetime") {
      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
    }
    return raw;
  }

  async function submit() {
    if (!config) {
      setError("Tabela sem configuração.");
      return;
    }
    setError(null);
    const writableColumns = config.editableColumns.length > 0 ? config.editableColumns : formColumns;
    const row: Record<string, unknown> = {};
    try {
      for (const column of writableColumns) row[column] = coerce(column);
    } catch (err) {
      setError(errorMessage(err, "Revise os campos."));
      return;
    }
    setBusy(true);
    try {
      const { row: created } = await upsertSheetRow({ table, requestAuth, row, mode: "insert" });
      const pk = String(created[config.primaryKey] ?? "");
      if (!pk) throw new Error("Registro criado sem identificador.");
      onCreated(pk, created);
    } catch (err) {
      setError(errorMessage(err, "Falha ao criar registro."));
    } finally {
      setBusy(false);
    }
  }

  // Exceção de CARROS: consulta a placa e preenche modelo/cor/anos.
  async function lookupPlate() {
    const placa = (values.placa ?? "").trim().toUpperCase();
    if (!placa) {
      setError("Informe a placa antes de pesquisar.");
      return;
    }
    setPlateBusy(true);
    setError(null);
    setInfo(null);
    try {
      const data = await lookupCarByPlate(placa, requestAuth);
      setValues((prev) => ({
        ...prev,
        placa: data.placa ?? placa,
        modelo_id: data.modelo?.trim() || prev.modelo_id || "",
        cor: normalizeCarColorValue(data.cor) ?? prev.cor ?? "",
        ano_fab: prev.ano_fab?.trim() ? prev.ano_fab : data.ano_fabricacao != null ? String(data.ano_fabricacao) : "",
        ano_mod: prev.ano_mod?.trim() ? prev.ano_mod : data.ano_modelo != null ? String(data.ano_modelo) : ""
      }));
      setInfo(data.modelo ? `Modelo sugerido: ${data.modelo}. Revise antes de salvar.` : "Consulta concluída. Revise os campos.");
    } catch (err) {
      setError(errorMessage(err, "Falha ao consultar a placa."));
    } finally {
      setPlateBusy(false);
    }
  }

  const label = config?.label ?? table;
  const empty = !config || formColumns.length === 0;

  function renderField(column: string, inputId: string) {
    const kind = getFormFieldKind(fieldContext, column);
    const relation = relationByColumn[column];
    const addButton = (target: SheetKey, initial?: Record<string, string>) => (
      <button
        type="button"
        className={formStyles.iconBtn}
        title={`Cadastrar em ${getGridTableConfig(target)?.label ?? target}`}
        aria-label={`Cadastrar em ${getGridTableConfig(target)?.label ?? target}`}
        data-testid={`rrc-add-${column}`}
        onClick={() =>
          setNested({
            column,
            table: target,
            initialValues: initial,
            onCreated: (key, created) => {
              const modelName = String(created.modelo ?? "");
              setValue(column, isCarModelTextInput(table, column) && modelName ? modelName : key);
              void loadRelation(target).catch(() => undefined);
              setNested(null);
            }
          })
        }
      >
        <PlusIcon />
      </button>
    );

    if (isCarros && column === "placa") {
      return (
        <span className={formStyles.inline}>
          <input
            id={inputId}
            autoComplete="off"
            value={values.placa ?? ""}
            onChange={(event) => setValue("placa", event.target.value.toUpperCase())}
            data-testid="rrc-field-placa"
            data-autofocus
            placeholder="ABC1D23"
          />
          <button
            type="button"
            className={`${formStyles.actionBtn} ${formStyles.accent}`}
            onClick={() => void lookupPlate()}
            disabled={plateBusy}
            data-testid="rrc-plate-lookup"
          >
            <SearchIcon />
            {plateBusy ? "Pesquisando…" : "Pesquisar"}
          </button>
        </span>
      );
    }

    if (isCarModelTextInput(table, column) && relation) {
      const listId = `rrc-${table}-${column}-options`;
      return (
        <span className={formStyles.inline}>
          <input
            id={inputId}
            autoComplete="off"
            list={listId}
            value={values[column] ?? ""}
            onChange={(event) => setValue(column, event.target.value)}
            data-testid={`rrc-field-${column}`}
            placeholder="Digite o modelo"
          />
          <datalist id={listId}>
            {relationOptionsFor(column).map((option) => (
              <option key={option.value} value={option.label} />
            ))}
          </datalist>
          {addButton(relation.table, { modelo: values[column] ?? "" })}
        </span>
      );
    }

    if (kind === "relation" && relation) {
      return (
        <span className={formStyles.inline}>
          <select id={inputId} value={values[column] ?? ""} data-testid={`rrc-field-${column}`} onChange={(event) => setValue(column, event.target.value)}>
            <option value="">Selecione…</option>
            {optionLabelsWithoutKeys(relationOptionsFor(column)).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {addButton(relation.table)}
        </span>
      );
    }
    if (kind === "lookup") {
      return (
        <select id={inputId} value={values[column] ?? ""} data-testid={`rrc-field-${column}`} onChange={(event) => setValue(column, event.target.value)}>
          <option value="">Selecione…</option>
          {(lookupOptionsByColumn[column] ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        id={inputId}
        type={kind === "datetime" ? "datetime-local" : "text"}
        inputMode={kind === "number" ? "decimal" : undefined}
        value={values[column] ?? ""}
        data-testid={`rrc-field-${column}`}
        onChange={(event) => setValue(column, event.target.value)}
      />
    );
  }

  return (
    <>
      <FocusDialog
        open
        onClose={onCancel}
        busy={busy}
        title={title ?? `Novo registro em ${label}`}
        subtitle={isCarros ? "Pesquise pela placa para preencher modelo, cor e anos." : undefined}
        size={formColumns.length > 6 ? "lg" : formColumns.length > 2 ? "md" : "sm"}
        testId={`related-creator-${table}`}
        closeOnBackdrop={false}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !empty) void submit();
        }}
        footer={
          <>
            <button type="button" className={styles.btn} onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={busy || empty} data-testid={`rrc-submit-${table}`}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {empty ? (
          <p className={styles.hint}>Esta tabela não tem campos editáveis.</p>
        ) : (
          <div className={formStyles.form}>
            <div className={formStyles.grid}>
              {formColumns.map((column) => {
                const label = humanizeColumn(column);
                if (getFormFieldKind(fieldContext, column) === "boolean") {
                  return (
                    <ToggleField
                      key={column}
                      label={label}
                      column={column}
                      checked={parseBooleanLikeValue(values[column] ?? "") === true}
                      onChange={(checked) => setValue(column, checked ? "true" : "false")}
                      testId={`rrc-field-${column}`}
                    />
                  );
                }
                const inputId = `rrc-${table}-${column}`;
                return (
                  <FormField
                    key={column}
                    inputId={inputId}
                    label={label}
                    column={column}
                    full={isCarros && (column === "placa" || isCarModelTextInput(table, column))}
                    plate={isCarros && column === "placa"}
                  >
                    {renderField(column, inputId)}
                  </FormField>
                );
              })}
            </div>
          </div>
        )}
        {info ? <p className={styles.hint}>{info}</p> : null}
        {error ? (
          <p className={styles.error} data-testid={`rrc-error-${table}`}>
            {error}
          </p>
        ) : null}
      </FocusDialog>

      {nested ? (
        <RecordFormDialog
          table={nested.table}
          initialValues={nested.initialValues}
          requestAuth={requestAuth}
          lookupOptionsByColumn={lookupOptionsByColumn}
          onCreated={nested.onCreated}
          onCancel={() => setNested(null)}
        />
      ) : null}
    </>
  );
}
