"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  fetchAuditDashboard,
  type AuditDashboardEntry,
  type AuditDashboardPayload
} from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";

export type AuditDashboardFilterDefaults = {
  acao?: string;
  autor?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  searchMode?: "search" | "contains" | "exact" | "starts" | "ends";
  tabela?: string;
};

type AuditLogDashboardProps = {
  requestAuth: RequestAuth;
  initialFilters?: AuditDashboardFilterDefaults;
};

const AUDIT_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
const AUDIT_SEARCH_MODE_OPTIONS = [
  { value: "search", label: "Search" },
  { value: "contains", label: "Contains" },
  { value: "exact", label: "Exact" },
  { value: "starts", label: "Starts" },
  { value: "ends", label: "Ends" }
] as const;

function formatAuditDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyAuditValue(value: unknown) {
  if (value === undefined || value === null) return "sem valor";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function flattenAuditDiff(
  beforeValue: unknown,
  afterValue: unknown,
  path = ""
): Array<{ after: unknown; before: unknown; field: string }> {
  if (isPlainRecord(beforeValue) || isPlainRecord(afterValue)) {
    const beforeRecord = isPlainRecord(beforeValue) ? beforeValue : {};
    const afterRecord = isPlainRecord(afterValue) ? afterValue : {};
    const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );

    return keys.flatMap((key) =>
      flattenAuditDiff(
        beforeRecord[key],
        afterRecord[key],
        path ? `${path}.${key}` : key
      )
    );
  }

  if (JSON.stringify(beforeValue ?? null) === JSON.stringify(afterValue ?? null)) {
    return [];
  }

  return [
    {
      after: afterValue,
      before: beforeValue,
      field: path || "registro"
    }
  ];
}

function buildAuditDiffs(entry: AuditDashboardEntry) {
  return flattenAuditDiff(entry.beforeData, entry.afterData);
}

export function AuditLogDashboard({ requestAuth, initialFilters }: AuditLogDashboardProps) {
  const [searchInput, setSearchInput] = useState(initialFilters?.search ?? "");
  const [search, setSearch] = useState(initialFilters?.search ?? "");
  const [searchMode, setSearchMode] = useState<AuditDashboardFilterDefaults["searchMode"]>(initialFilters?.searchMode ?? "search");
  const [autor, setAutor] = useState(initialFilters?.autor ?? "");
  const [acao, setAcao] = useState(initialFilters?.acao ?? "");
  const [tabela, setTabela] = useState(initialFilters?.tabela ?? "");
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(AUDIT_PAGE_SIZE_OPTIONS[0]);
  const [expandedEntryIds, setExpandedEntryIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AuditDashboardPayload | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void fetchAuditDashboard({
      requestAuth,
      page,
      pageSize,
      autor: autor || undefined,
      tabela: tabela || undefined,
      acao: acao || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
      searchMode: searchMode || undefined
    })
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(nextError instanceof ApiClientError || nextError instanceof Error ? nextError.message : "Falha ao carregar auditoria.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [acao, autor, dateFrom, dateTo, page, pageSize, requestAuth, search, searchMode, tabela]);

  const rows = payload?.rows ?? [];
  const pagination = payload?.pagination;
  const filterOptions = payload?.filters;
  const hasFilters = Boolean(searchInput || autor || acao || tabela || dateFrom || dateTo || searchMode !== "search");
  const totalLabel = useMemo(() => {
    if (!pagination) return "0 registros";
    return `${pagination.total} registro(s)`;
  }, [pagination]);

  return (
    <div className="audit-dashboard">
      <section className="sheet-panel audit-dashboard-panel">
        <header className="sheet-panel-head audit-dashboard-head">
          <div className="sheet-panel-head-main audit-dashboard-head-main">
            <strong className="sheet-panel-head-title">Dashboard de auditoria</strong>
            <span className="audit-dashboard-subtitle">Logs ordenados do mais recente para o mais antigo.</span>
          </div>
          <div className="audit-dashboard-summary">
            <span>{totalLabel}</span>
            {loading ? <span>Atualizando...</span> : null}
          </div>
        </header>

        <section className="audit-filter-bar">
          <label className="sheet-inline-field audit-filter-field audit-filter-field-search">
            Buscar
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Autor, tabela, PK, email..."
            />
          </label>
          <label className="sheet-inline-field audit-filter-field">
            Modo
            <select
              value={searchMode}
              onChange={(event) => {
                setSearchMode(event.target.value as AuditDashboardFilterDefaults["searchMode"]);
                setPage(1);
              }}
            >
              {AUDIT_SEARCH_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sheet-inline-field audit-filter-field">
            Data inicial
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="sheet-inline-field audit-filter-field">
            Data final
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="sheet-inline-field audit-filter-field">
            Autor
            <select
              value={autor}
              onChange={(event) => {
                setAutor(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {(filterOptions?.authors ?? []).map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </label>
          <label className="sheet-inline-field audit-filter-field">
            Operacao
            <select
              value={acao}
              onChange={(event) => {
                setAcao(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {(filterOptions?.actions ?? []).map((action) => (
                <option key={action.code} value={action.code}>
                  {action.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sheet-inline-field audit-filter-field">
            Tabela
            <select
              value={tabela}
              onChange={(event) => {
                setTabela(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {(filterOptions?.tables ?? []).map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>
          </label>
          <label className="sheet-inline-field audit-filter-field audit-filter-field-page">
            Cards por pagina
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {AUDIT_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <button
              type="button"
              className="sheet-panel-head-btn"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setSearchMode("search");
                setAutor("");
                setAcao("");
                setTabela("");
                setDateFrom("");
                setDateTo("");
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </section>

        {error ? <p className="sheet-error audit-dashboard-error">Erro: {error}</p> : null}

        <div className="audit-card-grid">
          {!loading && rows.length === 0 ? (
            <article className="audit-card audit-card-empty">
              <strong>Nenhum log encontrado.</strong>
              <p>Ajuste os filtros para ampliar a busca.</p>
            </article>
          ) : null}

          {rows.map((entry) => {
            const diffs = buildAuditDiffs(entry);
            const fallbackDiff = {
              after: entry.afterData ?? entry.beforeData,
              before: undefined,
              field: "Sem diferenca estruturada"
            };
            const resolvedDiffs = diffs.length > 0 ? diffs : [fallbackDiff];
            const isExpanded = Boolean(expandedEntryIds[entry.id]);
            const visibleDiffs = isExpanded ? resolvedDiffs : resolvedDiffs.slice(0, 1);
            const hiddenDiffCount = Math.max(0, resolvedDiffs.length - visibleDiffs.length);

            return (
              <article key={entry.id} className="audit-card">
                <header className="audit-card-head">
                  <div className="audit-card-badges">
                    <span className="audit-chip audit-chip-action">{entry.actionLabel}</span>
                    <span className="audit-chip">{entry.table}</span>
                    {entry.pk ? <span className="audit-chip">PK {entry.pk}</span> : null}
                    {entry.inBatch ? <span className="audit-chip">Lote</span> : null}
                  </div>
                  <strong>{entry.authorName}</strong>
                  <div className="audit-card-meta">
                    <span>{formatAuditDateTime(entry.createdAt)}</span>
                    {entry.authorRole ? <span>{entry.authorRole}</span> : null}
                    {entry.authorEmail ? <span>{entry.authorEmail}</span> : null}
                  </div>
                </header>

                {entry.details ? <p className="audit-card-details">{entry.details}</p> : null}

                <div className="audit-diff-list">
                  {visibleDiffs.map((diff) => (
                    <section key={`${entry.id}-${diff.field}`} className="audit-diff-row">
                      <strong>{diff.field}</strong>
                      <div className="audit-diff-values">
                        {diff.before !== undefined ? (
                          <div className="audit-diff-box is-before">
                            <span>Alterado</span>
                            <pre>{stringifyAuditValue(diff.before)}</pre>
                          </div>
                        ) : null}
                        <div className="audit-diff-box is-after">
                          <span>{diff.before !== undefined ? "Ficou" : "Estado atual"}</span>
                          <pre>{stringifyAuditValue(diff.after)}</pre>
                        </div>
                      </div>
                    </section>
                  ))}
                </div>

                {resolvedDiffs.length > 1 ? (
                  <button
                    type="button"
                    className="audit-card-toggle"
                    onClick={() =>
                      setExpandedEntryIds((current) => ({
                        ...current,
                        [entry.id]: !current[entry.id]
                      }))
                    }
                  >
                    {isExpanded
                      ? "Mostrar menos"
                      : `Ver mais ${hiddenDiffCount} alteracao${hiddenDiffCount === 1 ? "" : "es"}`}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        <footer className="audit-dashboard-footer">
          <div className="sheet-pager audit-dashboard-pager">
            <button
              type="button"
              className="sheet-panel-head-btn"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!pagination || page <= 1}
            >
              Anterior
            </button>
            <span>
              Pagina {pagination?.page ?? page} de {pagination?.totalPages ?? 1}
            </span>
            <button
              type="button"
              className="sheet-panel-head-btn"
              onClick={() => setPage((current) => current + 1)}
              disabled={!pagination || page >= pagination.totalPages}
            >
              Proxima
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
