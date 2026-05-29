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
  // Tabela vazia: o leitor (selecionar por lista) nao tem o que casar -> abre
  // direto no importador CSV quando ha permissao de escrita.
  const [mode, setMode] = useState<"read" | "write">(rows.length === 0 && canWrite ? "write" : "read");

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
  // Sub-modo: "csv" (texto livre com cabecalho) ou "grid" (colar coluna por coluna).
  const [writeMode, setWriteMode] = useState<"csv" | "grid">("csv");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [matchColumn, setMatchColumn] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkUpsertResult | null>(null);
  const [applied, setApplied] = useState<BulkUpsertResult | null>(null);

  // Modo grade: uma lista vertical por coluna; as linhas sao montadas por indice
  // (linha N de cada coluna = registro N). Resolve dados desalinhados em texto livre.
  const [gridCols, setGridCols] = useState<string[]>(() => (writerColumns[0] ? [writerColumns[0]] : []));
  const [gridText, setGridText] = useState<Record<string, string>>({});

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

  // Remove linhas vazias do fim (sobra do paste) preservando ordem/indice.
  function splitLines(text: string): string[] {
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    return lines;
  }

  const gridRowCount = useMemo(
    () => gridCols.reduce((max, col) => Math.max(max, splitLines(gridText[col] ?? "").length), 0),
    [gridCols, gridText]
  );

  function buildGridRows(): Record<string, unknown>[] {
    const cols = gridCols.filter(Boolean);
    const perCol = cols.map((col) => ({ col, lines: splitLines(gridText[col] ?? "") }));
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < gridRowCount; i++) {
      const row: Record<string, unknown> = {};
      for (const { col, lines } of perCol) {
        const raw = (lines[i] ?? "").trim();
        if (raw === "") continue;
        row[col] = coerceValue(col, raw);
      }
      rows.push(row);
    }
    return rows;
  }

  function switchWriteMode(next: "csv" | "grid") {
    setWriteMode(next);
    setError(null);
    setPreview(null);
    setApplied(null);
  }

  function addGridCol() {
    const used = new Set(gridCols);
    const next = writerColumns.find((col) => !used.has(col));
    if (next) setGridCols((cols) => [...cols, next]);
  }

  function setGridColAt(index: number, col: string) {
    const next = gridCols.map((c, i) => (i === index ? col : c));
    setGridCols(next);
    if (matchColumn && !next.includes(matchColumn)) setMatchColumn("");
  }

  function removeGridCol(index: number) {
    const next = gridCols.filter((_, i) => i !== index);
    setGridCols(next);
    if (matchColumn && !next.includes(matchColumn)) setMatchColumn("");
  }

  const writerActiveCols = writeMode === "grid" ? gridCols.filter(Boolean) : mappedColumns;
  const writerRowCount = writeMode === "grid" ? gridRowCount : parsed?.rows.length ?? 0;
  const canRunWriter = !busy && writerActiveCols.length > 0 && writerRowCount > 0;

  async function runWriter(apply: boolean) {
    const rows = writeMode === "grid" ? buildGridRows() : buildRows();
    if (writerActiveCols.length === 0) {
      setError(writeMode === "grid" ? "Adicione ao menos uma coluna." : "Mapeie ao menos uma coluna.");
      return;
    }
    if (rows.length === 0) {
      setError("Sem linhas para importar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (ensureRelationsLoaded) await ensureRelationsLoaded();
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
            disabled={rows.length === 0}
            title={rows.length === 0 ? "Sem linhas carregadas para selecionar" : undefined}
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
            <div className="advw-submodes" data-testid="advanced-write-submodes">
              <button
                type="button"
                className={`advw-submode ${writeMode === "csv" ? "is-active" : ""}`}
                onClick={() => switchWriteMode("csv")}
                data-testid="advanced-write-mode-csv"
              >
                CSV livre
              </button>
              <button
                type="button"
                className={`advw-submode ${writeMode === "grid" ? "is-active" : ""}`}
                onClick={() => switchWriteMode("grid")}
                data-testid="advanced-write-mode-grid"
              >
                Grade (colar por coluna)
              </button>
            </div>
            {writeMode === "csv" ? (
              !parsed ? (
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
              )
            ) : (
              <>
                <p className="csvw-hint">
                  Cole <b>uma coluna por vez</b> (um valor por linha). As linhas sao montadas pela ordem — a
                  linha 1 de cada coluna vira o registro 1, e assim por diante. Resolve dados desalinhados.
                </p>
                <div className="advw-grid" data-testid="advanced-grid">
                  {gridCols.map((col, index) => (
                    <div className="advw-grid-col" key={`${col}-${index}`}>
                      <div className="advw-grid-col-head">
                        <select
                          value={col}
                          data-testid={`advanced-grid-col-${index}`}
                          onChange={(e) => setGridColAt(index, e.target.value)}
                        >
                          {writerColumns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="advw-grid-remove"
                          onClick={() => removeGridCol(index)}
                          aria-label="Remover coluna"
                          title="Remover coluna"
                        >
                          ×
                        </button>
                      </div>
                      <textarea
                        className="advw-grid-textarea"
                        value={gridText[col] ?? ""}
                        rows={10}
                        placeholder={"valor 1\nvalor 2\n..."}
                        data-testid={`advanced-grid-input-${index}`}
                        onChange={(e) => setGridText((prev) => ({ ...prev, [col]: e.target.value }))}
                      />
                      <div className="advw-grid-count">{splitLines(gridText[col] ?? "").length} valor(es)</div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="advw-grid-add"
                    onClick={addGridCol}
                    disabled={gridCols.length >= writerColumns.length}
                    data-testid="advanced-grid-add"
                  >
                    + coluna
                  </button>
                </div>
                <div className="csvw-meta">{gridRowCount} registro(s) montado(s)</div>
                <label className="csvw-key">
                  <span className="csvw-section-title">Chave de correspondencia</span>
                  <select value={matchColumn} data-testid="advanced-grid-key" onChange={(e) => setMatchColumn(e.target.value)}>
                    <option value="">Nenhuma — inserir todas as linhas</option>
                    {gridCols.filter(Boolean).map((col) => (
                      <option key={col} value={col}>
                        Atualizar casando por: {col}
                      </option>
                    ))}
                  </select>
                </label>
                {writeActive ? (
                  <div className={`csvw-result ${writeActive.summary.errors > 0 ? "has-errors" : ""}`} data-testid="advanced-grid-result">
                    <strong>
                      {applied ? "Aplicado: " : "Pre-visualizacao: "}
                      {writeActive.summary.toInsert} inserir · {writeActive.summary.toUpdate} atualizar · {writeActive.summary.errors} erro(s)
                    </strong>
                    {errorRows.length > 0 ? (
                      <div className="csvw-errors">
                        {errorRows.slice(0, 12).map((r) => (
                          <div key={r.index} className="csvw-error-row">
                            Registro {r.index + 1}: {r.error}
                          </div>
                        ))}
                        {errorRows.length > 12 ? <div className="csvw-error-row">+{errorRows.length - 12} erro(s)…</div> : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {error ? <p className="csvw-error" data-testid="advanced-grid-error">{error}</p> : null}
                <div className="csvw-actions">
                  <button type="button" className="csvw-secondary" onClick={onClose}>
                    {applied ? "Fechar" : "Cancelar"}
                  </button>
                  {!applied ? (
                    <>
                      <button type="button" className="csvw-secondary" onClick={() => void runWriter(false)} disabled={!canRunWriter} data-testid="advanced-grid-preview">
                        {busy ? "Processando..." : "Pre-visualizar"}
                      </button>
                      <button type="button" className="csvw-primary" onClick={() => void runWriter(true)} disabled={!canRunWriter} data-testid="advanced-grid-apply">
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
