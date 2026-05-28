"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ApiClientError, bulkUpsertSheetRows, type BulkUpsertResult } from "@/components/ui-grid/api";
import { normalizeHeaderKey, parseCsv, type ParsedCsv } from "@/components/ui-grid/csv";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type CsvWriterDialogProps = {
  table: SheetKey;
  label: string;
  /** Colunas da tabela que podem receber dados (alvos do mapeamento). */
  columns: string[];
  /** Coerce/resolve um valor cru de CSV (tipos + rotulo->chave de lookup/relacao). */
  coerceValue: (column: string, raw: string) => unknown;
  /** Pre-carrega as relacoes do sheet ativo, pra coerceValue resolver rotulos. */
  ensureRelationsLoaded?: () => Promise<void>;
  requestAuth: RequestAuth;
  onClose: () => void;
  onApplied: () => void;
};

const IGNORE = "__ignore__";

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function CsvWriterDialog({
  table,
  label,
  columns,
  coerceValue,
  ensureRelationsLoaded,
  requestAuth,
  onClose,
  onApplied
}: CsvWriterDialogProps) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  // mapping[csvIndex] = coluna da tabela ou IGNORE.
  const [mapping, setMapping] = useState<string[]>([]);
  const [matchColumn, setMatchColumn] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkUpsertResult | null>(null);
  const [applied, setApplied] = useState<BulkUpsertResult | null>(null);

  function autoMap(headers: string[]): string[] {
    const byKey = new Map(columns.map((col) => [normalizeHeaderKey(col), col]));
    return headers.map((header) => byKey.get(normalizeHeaderKey(header)) ?? IGNORE);
  }

  function analyze() {
    setError(null);
    setPreview(null);
    setApplied(null);
    const result = parseCsv(rawText);
    if (result.headers.length === 0) {
      setError("Cole um CSV com cabecalho na 1a linha.");
      setParsed(null);
      return;
    }
    setParsed(result);
    const auto = autoMap(result.headers);
    setMapping(auto);
    setMatchColumn("");
  }

  const mappedColumns = useMemo(
    () => Array.from(new Set(mapping.filter((value) => value && value !== IGNORE))),
    [mapping]
  );

  function buildRows(): Record<string, unknown>[] {
    if (!parsed) return [];
    return parsed.rows.map((cells) => {
      const row: Record<string, unknown> = {};
      mapping.forEach((column, csvIndex) => {
        if (!column || column === IGNORE) return;
        const raw = (cells[csvIndex] ?? "").trim();
        if (raw === "") return; // celula vazia nao sobrescreve / nao seta
        row[column] = coerceValue(column, raw);
      });
      return row;
    });
  }

  async function run(apply: boolean) {
    if (!parsed) return;
    if (mappedColumns.length === 0) {
      setError("Mapeie ao menos uma coluna.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (ensureRelationsLoaded) await ensureRelationsLoaded();
      const rows = buildRows();
      const result = await bulkUpsertSheetRows({
        table,
        requestAuth,
        rows,
        matchColumn: matchColumn || null,
        apply
      });
      if (apply) {
        setApplied(result);
        onApplied();
      } else {
        setPreview(result);
      }
    } catch (err) {
      setError(errorMessage(err, "Falha ao processar o CSV."));
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  const active = applied ?? preview;
  const errorRows = active ? active.results.filter((r) => r.op === "error") : [];

  return createPortal(
    <div className="csvw-overlay" data-testid="csv-writer-dialog" onClick={onClose}>
      <div className="csvw-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="csvw-head">
          <strong>Escritor CSV — {label}</strong>
          <button type="button" className="csvw-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="csvw-body">
          {!parsed ? (
            <>
              <p className="csvw-hint">
                Cole um CSV com <b>cabecalho na 1a linha</b>. O sistema casa cada coluna pelo nome e deixa voce
                confirmar. Escolha uma <b>chave de correspondencia</b> (ex.: placa) para atualizar linhas existentes;
                sem chave, todas as linhas sao inseridas.
              </p>
              <textarea
                className="csvw-textarea"
                value={rawText}
                rows={10}
                placeholder={"placa,preco_original,cor\nABC1D23,75000,PRATA\n..."}
                data-testid="csv-writer-input"
                onChange={(event) => setRawText(event.target.value)}
              />
              <div className="csvw-actions">
                <button type="button" className="csvw-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="button" className="csvw-primary" onClick={analyze} disabled={!rawText.trim()} data-testid="csv-writer-analyze">
                  Analisar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="csvw-meta">
                {parsed.rows.length} linha(s) · {parsed.headers.length} coluna(s) detectada(s)
                <button type="button" className="csvw-link" onClick={() => setParsed(null)}>
                  trocar CSV
                </button>
              </div>

              <div className="csvw-mapping">
                <span className="csvw-section-title">Mapeamento</span>
                {parsed.headers.map((header, csvIndex) => (
                  <label key={`${header}-${csvIndex}`} className="csvw-map-row">
                    <span className="csvw-csv-col" title={header}>
                      {header || `(coluna ${csvIndex + 1})`}
                    </span>
                    <span className="csvw-arrow">→</span>
                    <select
                      value={mapping[csvIndex] ?? IGNORE}
                      data-testid={`csv-writer-map-${csvIndex}`}
                      onChange={(event) => {
                        const next = [...mapping];
                        next[csvIndex] = event.target.value;
                        setMapping(next);
                        if (matchColumn && !next.includes(matchColumn)) setMatchColumn("");
                      }}
                    >
                      <option value={IGNORE}>(ignorar)</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <label className="csvw-key">
                <span className="csvw-section-title">Chave de correspondencia</span>
                <select
                  value={matchColumn}
                  data-testid="csv-writer-key"
                  onChange={(event) => setMatchColumn(event.target.value)}
                >
                  <option value="">Nenhuma — inserir todas as linhas</option>
                  {mappedColumns.map((col) => (
                    <option key={col} value={col}>
                      Atualizar casando por: {col}
                    </option>
                  ))}
                </select>
              </label>

              {active ? (
                <div className={`csvw-result ${active.summary.errors > 0 ? "has-errors" : ""}`} data-testid="csv-writer-result">
                  <strong>
                    {applied ? "Aplicado: " : "Pre-visualizacao: "}
                    {active.summary.toInsert} inserir · {active.summary.toUpdate} atualizar · {active.summary.errors} erro(s)
                  </strong>
                  {errorRows.length > 0 ? (
                    <div className="csvw-errors">
                      {errorRows.slice(0, 12).map((r) => (
                        <div key={r.index} className="csvw-error-row">
                          Linha {r.index + 2}: {r.error}
                        </div>
                      ))}
                      {errorRows.length > 12 ? <div className="csvw-error-row">+{errorRows.length - 12} erro(s)…</div> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="csvw-error" data-testid="csv-writer-error">{error}</p> : null}

              <div className="csvw-actions">
                <button type="button" className="csvw-secondary" onClick={onClose}>
                  {applied ? "Fechar" : "Cancelar"}
                </button>
                {!applied ? (
                  <>
                    <button type="button" className="csvw-secondary" onClick={() => void run(false)} disabled={busy} data-testid="csv-writer-preview">
                      {busy ? "Processando..." : "Pre-visualizar"}
                    </button>
                    <button
                      type="button"
                      className="csvw-primary"
                      onClick={() => void run(true)}
                      disabled={busy || mappedColumns.length === 0}
                      data-testid="csv-writer-apply"
                    >
                      {busy ? "Aplicando..." : "Aplicar"}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
