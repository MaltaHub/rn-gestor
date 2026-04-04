"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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

type AuditGridSortColumn =
  | "createdAt"
  | "table"
  | "action"
  | "field"
  | "before"
  | "after";

type AuditGridSortDirection = "asc" | "desc";

type AuditDiffRow = {
  after: unknown;
  before: unknown;
  entry: AuditDashboardEntry;
  field: string;
  id: string;
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

    const keys = Array.from(
      new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

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

function buildAuditDiffRows(entry: AuditDashboardEntry): AuditDiffRow[] {
  const diffs = flattenAuditDiff(entry.beforeData, entry.afterData);

  const fallbackDiff = {
    after: entry.afterData ?? entry.beforeData,
    before: undefined,
    field: "Sem diferenca estruturada"
  };

  const resolvedDiffs = diffs.length > 0 ? diffs : [fallbackDiff];

  return resolvedDiffs.map((diff, index) => ({
    ...diff,
    entry,
    id: `${entry.id}::${diff.field}::${index}`
  }));
}

function toComparable(value: unknown) {
  return stringifyAuditValue(value).toLocaleLowerCase("pt-BR");
}

export function AuditLogDashboard({
  requestAuth,
  initialFilters
}: AuditLogDashboardProps) {
  const [searchInput, setSearchInput] = useState(initialFilters?.search ?? "");
  const [search, setSearch] = useState(initialFilters?.search ?? "");
  const [searchMode, setSearchMode] = useState<
    "search" | "contains" | "exact" | "starts" | "ends"
  >(initialFilters?.searchMode ?? "search");

  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo ?? "");
  const [autor, setAutor] = useState(initialFilters?.autor ?? "");
  const [tabela, setTabela] = useState(initialFilters?.tabela ?? "");
  const [acao, setAcao] = useState(initialFilters?.acao ?? "");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(AUDIT_PAGE_SIZE_OPTIONS[0]);
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [sortColumn, setSortColumn] = useState<AuditGridSortColumn>("createdAt");
  const [sortDirection, setSortDirection] =
    useState<AuditGridSortDirection>("desc");

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
      sortBy:
        sortColumn === "table"
          ? "table"
          : sortColumn === "action"
            ? "action"
            : sortColumn === "createdAt"
              ? "createdAt"
              : undefined,
      sortDir: sortDirection,
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
        setError(
          nextError instanceof ApiClientError || nextError instanceof Error
            ? nextError.message
            : "Falha ao carregar auditoria."
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    acao,
    autor,
    dateFrom,
    dateTo,
    page,
    pageSize,
    requestAuth,
    search,
    searchMode,
    sortColumn,
    sortDirection,
    tabela
  ]);

  const rows = useMemo(() => payload?.rows ?? [], [payload?.rows]);
  const pagination = payload?.pagination;

  const totalLabel = useMemo(() => {
    if (!pagination) return "0 registros";
    return `${pagination.total} registro(s)`;
  }, [pagination]);

  const diffRows = useMemo(() => {
    const flattened = rows.flatMap((entry) => buildAuditDiffRows(entry));

    return [...flattened].sort((left, right) => {
      if (sortColumn === "field") {
        return sortDirection === "asc"
          ? left.field.localeCompare(right.field, "pt-BR", { sensitivity: "base" })
          : right.field.localeCompare(left.field, "pt-BR", { sensitivity: "base" });
      }

      if (sortColumn === "before") {
        const leftText = toComparable(left.before);
        const rightText = toComparable(right.before);
        return sortDirection === "asc"
          ? leftText.localeCompare(rightText, "pt-BR")
          : rightText.localeCompare(leftText, "pt-BR");
      }

      if (sortColumn === "after") {
        const leftText = toComparable(left.after);
        const rightText = toComparable(right.after);
        return sortDirection === "asc"
          ? leftText.localeCompare(rightText, "pt-BR")
          : rightText.localeCompare(leftText, "pt-BR");
      }

      if (sortColumn === "table") {
        return sortDirection === "asc"
          ? (left.entry.table ?? "").localeCompare(right.entry.table ?? "", "pt-BR", {
              sensitivity: "base"
            })
          : (right.entry.table ?? "").localeCompare(left.entry.table ?? "", "pt-BR", {
              sensitivity: "base"
            });
      }

      if (sortColumn === "action") {
        return sortDirection === "asc"
          ? (left.entry.actionLabel ?? "").localeCompare(
              right.entry.actionLabel ?? "",
              "pt-BR",
              { sensitivity: "base" }
            )
          : (right.entry.actionLabel ?? "").localeCompare(
              left.entry.actionLabel ?? "",
              "pt-BR",
              { sensitivity: "base" }
            );
      }

      const leftDate = new Date(left.entry.createdAt).getTime();
      const rightDate = new Date(right.entry.createdAt).getTime();
      return sortDirection === "asc" ? leftDate - rightDate : rightDate - leftDate;
    });
  }, [rows, sortColumn, sortDirection]);

  function toggleSort(column: AuditGridSortColumn) {
    setPage(1);

    setSortColumn((currentColumn) => {
      if (currentColumn === column) {
        setSortDirection((currentDirection) =>
          currentDirection === "asc" ? "desc" : "asc"
        );
        return currentColumn;
      }

      setSortDirection(column === "createdAt" ? "desc" : "asc");
      return column;
    });
  }

  function sortIndicator(column: AuditGridSortColumn) {
    if (sortColumn !== column) return "↕";
    return sortDirection === "asc" ? "▲" : "▼";
  }

  return (
    <div className="audit-dashboard">
      <section className="sheet-panel audit-dashboard-panel">
        <header className="sheet-panel-head audit-dashboard-head">
          <div className="sheet-panel-head-main audit-dashboard-head-main">
            <strong className="sheet-panel-head-title">Dashboard de auditoria</strong>
            <span className="audit-dashboard-subtitle">
              Visualizacao em grade com destaque das mudancas.
            </span>
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
                setSearchMode(
                  event.target.value as "search" | "contains" | "exact" | "starts" | "ends"
                );
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
            Autor
            <input
              type="text"
              value={autor}
              onChange={(event) => {
                setAutor(event.target.value);
                setPage(1);
              }}
              placeholder="Nome ou email"
            />
          </label>

          <label className="sheet-inline-field audit-filter-field">
            Tabela
            <input
              type="text"
              value={tabela}
              onChange={(event) => {
                setTabela(event.target.value);
                setPage(1);
              }}
              placeholder="veiculos, lojas..."
            />
          </label>

          <label className="sheet-inline-field audit-filter-field">
            Acao
            <input
              type="text"
              value={acao}
              onChange={(event) => {
                setAcao(event.target.value);
                setPage(1);
              }}
              placeholder="insert, update..."
            />
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

          <label className="sheet-inline-field audit-filter-field audit-filter-field-page">
            Linhas por pagina
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
        </section>

        {error ? <p className="sheet-error audit-dashboard-error">Erro: {error}</p> : null}

        <div className="audit-grid-wrap">
          {!loading && diffRows.length === 0 ? (
            <article className="audit-grid-empty">
              <strong>Nenhum log encontrado.</strong>
              <p>Ajuste os filtros para ampliar a busca.</p>
            </article>
          ) : null}

          {diffRows.length > 0 ? (
            <table className="sheet-grid audit-grid-table">
              <thead>
                <tr>
                  <th>
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("createdAt")}
                      >
                        <span className="sheet-th-label">Atualizacao</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("createdAt")}</span>
                    </div>
                  </th>

                  <th>
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("table")}
                      >
                        <span className="sheet-th-label">Tabela</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("table")}</span>
                    </div>
                  </th>

                  <th>
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("action")}
                      >
                        <span className="sheet-th-label">Operacao</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("action")}</span>
                    </div>
                  </th>

                  <th>
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("field")}
                      >
                        <span className="sheet-th-label">Campo alterado</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("field")}</span>
                    </div>
                  </th>

                  <th>
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("before")}
                      >
                        <span className="sheet-th-label">Valor anterior</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("before")}</span>
                    </div>
                  </th>

                  <th>
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("after")}
                      >
                        <span className="sheet-th-label">Valor atualizado</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("after")}</span>
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {diffRows.map((row) => {
                  const isExpanded = Boolean(expandedRowIds[row.id]);

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="audit-grid-row"
                        onClick={() =>
                          setExpandedRowIds((current) => ({
                            ...current,
                            [row.id]: !current[row.id]
                          }))
                        }
                      >
                        <td>{formatAuditDateTime(row.entry.createdAt)}</td>
                        <td>{row.entry.table}</td>
                        <td>{row.entry.actionLabel}</td>
                        <td className="audit-cell-changed">{row.field}</td>
                        <td>
                          <pre>{stringifyAuditValue(row.before)}</pre>
                        </td>
                        <td className="audit-cell-changed">
                          <pre>{stringifyAuditValue(row.after)}</pre>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="audit-grid-expanded-row">
                          <td colSpan={6}>
                            <div className="audit-grid-expanded-content">
                              <span>
                                <strong>Usuario:</strong> {row.entry.authorName || "sem autor"}
                              </span>

                              {row.entry.authorRole ? (
                                <span>
                                  <strong>Cargo:</strong> {row.entry.authorRole}
                                </span>
                              ) : null}

                              {row.entry.authorEmail ? (
                                <span>
                                  <strong>Email:</strong> {row.entry.authorEmail}
                                </span>
                              ) : null}

                              {row.entry.pk ? (
                                <span>
                                  <strong>PK:</strong> {row.entry.pk}
                                </span>
                              ) : null}

                              {row.entry.inBatch ? (
                                <span>
                                  <strong>Lote:</strong> {row.entry.batchId || "sim"}
                                </span>
                              ) : null}

                              {row.entry.details ? (
                                <span>
                                  <strong>Detalhes:</strong> {row.entry.details}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : null}
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