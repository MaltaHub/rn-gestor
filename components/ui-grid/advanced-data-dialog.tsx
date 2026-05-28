"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ApiClientError, bulkUpsertSheetRows, type BulkUpsertResult } from "@/components/ui-grid/api";
import { normalizeHeaderKey, parseCsv, type ParsedCsv } from "@/components/ui-grid/csv";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type AdvancedDataDialogProps = {
  table: SheetKey;
  label: string;
  primaryKey: string;
  /** Colunas para casar no modo Selecionar (leitor) — qualquer coluna legivel. */
  readerColumns: string[];
  /** Colunas editaveis (alvos de mapeamento e chave no escritor). */
  writerColumns: string[];
  /** Coluna sugerida no leitor (ex.: placa), se houver. */
  defaultReaderColumn?: string | null;
  /** Linhas carregadas no grid (para casar/selecionar no modo leitor). */
  rows: Record<string, unknown>[];
  /** Coerce/resolve valor cru de CSV (tipos + rotulo->chave). */
  coerceValue: (column: string, raw: string) => unknown;
  ensureRelationsLoaded?: () => Promise<void>;
  requestAuth: RequestAuth;
  /** Se false, o modo escritor fica indisponivel. */
  canWrite: boolean;
  /** Aplica a selecao no grid (modo leitor). */
  onSelectRows: (ids: string[]) => void;
  /** Recarrega o grid apos aplicar o escritor. */
  onApplied: () => void;
  onClose: () => void;
};

const IGNORE = "__ignore__";

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function tokenize(input: string): string[] {
  // Um valor por linha (ou separado por ; / TAB). NAO quebra por espaco,
  // pra suportar valores com espaco (nomes, modelos).
  return Array.from(
    new Set(
      input
        .split(/[\n;\t]+/)
        .map((token) => token.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export function AdvancedDataDialog({
  table,
  label,
  primaryKey,
  readerColumns,
  writerColumns,
  defaultReaderColumn,
  rows,
  coerceValue,
  ensureRelationsLoaded,
  requestAuth,
  canWrite,
  onSelectRows,
  onApplied,
  onClose
}: AdvancedDataDialogProps) {
  const [mode, setMode] = useState<"read" | "write">("read");

  // -------- Leitor (selecionar) --------
  const [readerColumn, setReaderColumn] = useState<string>(
    defaultReaderColumn && readerColumns.includes(defaultReaderColumn) ? defaultReaderColumn : readerColumns[0] ?? ""
  );
  const [readerInput, setReaderInput] = useState("");
  const [readerResult, setReaderResult] = useState<{ matched: number; unmatched: string[]; total: number } | null>(null);

  const readerTokenCount = useMemo(() => tokenize(readerInput).length, [readerInput]);

  function applyReaderSelect() {
    if (!readerColumn) return;
    const tokens = tokenize(readerInput);
    if (tokens.length === 0) {
      setReaderResult({ matched: 0, unmatched: [], total: 0 });
      return;
    }
    const byValue = new Map<string, string[]>();
    for (const row of rows) {
      const raw = row[readerColumn];
      if (raw == null || raw === "") continue;
      const key = String(raw).trim().toUpperCase();
      const id = String(row[primaryKey] ?? "");
      if (!id) continue;
      const list = byValue.get(key) ?? [];
      list.push(id);
      byValue.set(key, list);
    }
    const matched = new Set<string>();
    const unmatched: string[] = [];
    for (const token of tokens) {
      const ids = byValue.get(token);
      if (ids && ids.length > 0) ids.forEach((id) => matched.add(id));
      else unmatched.push(token);
    }
    onSelectRows(Array.from(matched));
    setReaderResult({ matched: matched.size, unmatched, total: tokens.length });
  }

  // -------- Escritor (CSV upsert) --------
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [matchColumn, setMatchColumn] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkUpsertResult | null>(null);
  const [applied, setApplied] = useState<BulkUpsertResult | null>(null);

  function autoMap(headers: string[]): string[] {
    const byKey = new Map(writerColumns.map((col) => [normalizeHeaderKey(col), col]));
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
    setMapping(autoMap(result.headers));
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
        if (raw === "") return;
        row[column] = coerceValue(column, raw);
      });
      return row;
    });
  }

  async function runWriter(apply: boolean) {
    if (!parsed) return;
    if (mappedColumns.length === 0) {
      setError("Mapeie ao menos uma coluna.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (ensureRelationsLoaded) await ensureRelationsLoaded();
      const result = await bulkUpsertSheetRows({
        table,
        requestAuth,
        rows: buildRows(),
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

  const writeActive = applied ?? preview;
  const errorRows = writeActive ? writeActive.results.filter((r) => r.op === "error") : [];

  return createPortal(
    <div className="csvw-overlay" data-testid="advanced-data-dialog" onClick={onClose}>
      <div className="csvw-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="csvw-head">
          <strong>Avancado — {label}</strong>
          <button type="button" className="csvw-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="adv-tabs">
          <button
            type="button"
            className={`adv-tab ${mode === "read" ? "is-active" : ""}`}
            onClick={() => setMode("read")}
            data-testid="advanced-mode-read"
          >
            Selecionar por lista
          </button>
          <button
            type="button"
            className={`adv-tab ${mode === "write" ? "is-active" : ""}`}
            onClick={() => setMode("write")}
            data-testid="advanced-mode-write"
            disabled={!canWrite}
            title={canWrite ? undefined : "Sem permissao de escrita nesta tabela"}
          >
            Importar / Atualizar (CSV)
          </button>
        </div>

        {mode === "read" ? (
          <div className="csvw-body">
            <p className="csvw-hint">
              Cole uma lista (um valor por linha) e escolha a coluna. O grid seleciona <b>todas</b> as linhas que
              casam — inclusive valores repetidos (ex.: todas com a mesma cor).
            </p>
            <label className="csvw-key">
              <span className="csvw-section-title">Coluna para casar</span>
              <select value={readerColumn} data-testid="advanced-read-column" onChange={(e) => setReaderColumn(e.target.value)}>
                {readerColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="csvw-textarea"
              value={readerInput}
              rows={8}
              placeholder={"ABC1D23\nXYZ2A34\n..."}
              data-testid="advanced-read-input"
              onChange={(e) => setReaderInput(e.target.value)}
            />
            {readerTokenCount > 0 ? <div className="csvw-meta">{readerTokenCount} valor(es) unico(s)</div> : null}
            {readerResult ? (
              <div className={`csvw-result ${readerResult.unmatched.length > 0 ? "has-errors" : ""}`} data-testid="advanced-read-result">
                <strong>
                  {readerResult.matched} linha(s) selecionada(s) · {readerResult.unmatched.length} valor(es) sem correspondencia
                </strong>
                {readerResult.unmatched.length > 0 ? (
                  <div className="csvw-errors">
                    <code>{readerResult.unmatched.slice(0, 30).join(", ")}</code>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="csvw-actions">
              <button type="button" className="csvw-secondary" onClick={onClose}>
                Fechar
              </button>
              <button
                type="button"
                className="csvw-primary"
                onClick={applyReaderSelect}
                disabled={readerTokenCount === 0 || !readerColumn}
                data-testid="advanced-read-apply"
              >
                Selecionar
              </button>
            </div>
          </div>
        ) : (
          <div className="csvw-body">
            {!parsed ? (
              <>
                <p className="csvw-hint">
                  Cole um CSV com <b>cabecalho na 1a linha</b>. Escolha uma <b>chave de correspondencia</b> para
                  atualizar (a chave pode ser nao-unica: atualiza todas as linhas que casam); sem chave, insere tudo.
                </p>
                <textarea
                  className="csvw-textarea"
                  value={rawText}
                  rows={9}
                  placeholder={"placa,preco_original,cor\nABC1D23,75000,PRATA\n..."}
                  data-testid="advanced-write-input"
                  onChange={(e) => setRawText(e.target.value)}
                />
                <div className="csvw-actions">
                  <button type="button" className="csvw-secondary" onClick={onClose}>
                    Cancelar
                  </button>
                  <button type="button" className="csvw-primary" onClick={analyze} disabled={!rawText.trim()} data-testid="advanced-write-analyze">
                    Analisar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="csvw-meta">
                  {parsed.rows.length} linha(s) · {parsed.headers.length} coluna(s)
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
                        data-testid={`advanced-write-map-${csvIndex}`}
                        onChange={(e) => {
                          const next = [...mapping];
                          next[csvIndex] = e.target.value;
                          setMapping(next);
                          if (matchColumn && !next.includes(matchColumn)) setMatchColumn("");
                        }}
                      >
                        <option value={IGNORE}>(ignorar)</option>
                        {writerColumns.map((col) => (
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
                  <select value={matchColumn} data-testid="advanced-write-key" onChange={(e) => setMatchColumn(e.target.value)}>
                    <option value="">Nenhuma — inserir todas as linhas</option>
                    {mappedColumns.map((col) => (
                      <option key={col} value={col}>
                        Atualizar casando por: {col}
                      </option>
                    ))}
                  </select>
                </label>
                {writeActive ? (
                  <div className={`csvw-result ${writeActive.summary.errors > 0 ? "has-errors" : ""}`} data-testid="advanced-write-result">
                    <strong>
                      {applied ? "Aplicado: " : "Pre-visualizacao: "}
                      {writeActive.summary.toInsert} inserir · {writeActive.summary.toUpdate} atualizar · {writeActive.summary.errors} erro(s)
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
                {error ? <p className="csvw-error" data-testid="advanced-write-error">{error}</p> : null}
                <div className="csvw-actions">
                  <button type="button" className="csvw-secondary" onClick={onClose}>
                    {applied ? "Fechar" : "Cancelar"}
                  </button>
                  {!applied ? (
                    <>
                      <button type="button" className="csvw-secondary" onClick={() => void runWriter(false)} disabled={busy} data-testid="advanced-write-preview">
                        {busy ? "Processando..." : "Pre-visualizar"}
                      </button>
                      <button type="button" className="csvw-primary" onClick={() => void runWriter(true)} disabled={busy || mappedColumns.length === 0} data-testid="advanced-write-apply">
                        {busy ? "Aplicando..." : "Aplicar"}
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
