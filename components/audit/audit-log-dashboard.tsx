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
  | "author"
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

type AuditDiffDisplayRow = AuditDiffRow & {
  afterText: string;
  authorLabel: string;
  beforeText: string;
  searchText: string;
};

const AUDIT_PAGE_SIZE_OPTIONS = [24, 48, 96] as const;

const AUDIT_SEARCH_MODE_OPTIONS = [
  { value: "search", label: "Search" },
  { value: "contains", label: "Contains" },
  { value: "exact", label: "Exact" },
  { value: "starts", label: "Starts" },
  { value: "ends", label: "Ends" }
] as const;

const DIACRITIC_REGEX = /[\u0300-\u036f]/g;
const WHITESPACE_REGEX = /\s+/g;

function formatAuditDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function normalizeSearchText(value: string) {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(DIACRITIC_REGEX, "")
    .replace(WHITESPACE_REGEX, " ")
    .toLowerCase()
    .trim();
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

function hasActiveTextSelection() {
  if (typeof window === "undefined") return false;
  const selection = window.getSelection();
  return Boolean(selection && selection.toString().trim());
}

function buildRowSearchIndex(
  row: AuditDiffRow,
  beforeText: string,
  afterText: string,
  authorLabel: string
) {
  const { entry } = row;

  const rawText = [
    entry.id,
    entry.table,
    entry.actionCode,
    entry.actionLabel,
    entry.pk ?? "",
    entry.details ?? "",
    entry.batchId ?? "",
    entry.authorName ?? "",
    entry.authorEmail ?? "",
    entry.authorRole ?? "",
    entry.createdAt,
    formatAuditDateTime(entry.createdAt),
    authorLabel,
    row.field,
    beforeText,
    afterText
  ].join(" ");

  return normalizeSearchText(rawText);
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
  const [autor, setAutor] = useState(() => initialFilters?.autor?.trim() ?? "");
  const [tabela, setTabela] = useState(() => initialFilters?.tabela?.trim() ?? "");
  const [acao, setAcao] = useState(() => initialFilters?.acao?.trim() ?? "");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(AUDIT_PAGE_SIZE_OPTIONS[0]);
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [sortColumn, setSortColumn] = useState<AuditGridSortColumn>("createdAt");
  const [sortDirection, setSortDirection] =
    useState<AuditGridSortDirection>("desc");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AuditDashboardPayload | null>(null);

  const quickSearchTerm = useMemo(() => normalizeSearchText(searchInput), [searchInput]);

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
  const filters = payload?.filters;

  const totalLabel = useMemo(() => {
    if (!pagination) return "0 registros";
    return `${pagination.total} registro(s)`;
  }, [pagination]);

  const authorOptions = useMemo(() => {
    const available = new Set<string>();

    (filters?.authors ?? []).forEach((value) => {
      const normalized = (value || "").trim();
      if (normalized) available.add(normalized);
    });

    if (autor && !available.has(autor)) {
      available.add(autor);
    }

    return Array.from(available).sort((left, right) =>
      left.localeCompare(right, "pt-BR", { sensitivity: "base" })
    );
  }, [filters?.authors, autor]);

  const tableOptions = useMemo(() => {
    const available = new Set<string>();

    (filters?.tables ?? []).forEach((value) => {
      const normalized = (value || "").trim();
      if (normalized) available.add(normalized);
    });

    if (tabela && !available.has(tabela)) {
      available.add(tabela);
    }

    return Array.from(available).sort((left, right) =>
      left.localeCompare(right, "pt-BR", { sensitivity: "base" })
    );
  }, [filters?.tables, tabela]);

  const actionOptions = useMemo(() => {
    const map = new Map<string, { code: string; label: string }>();

    (filters?.actions ?? []).forEach((action) => {
      const code = (action.code || "").trim();
      if (!code) return;
      const label = (action.label || "").trim() || code;
      map.set(code, {
        code,
        label
      });
    });

    if (acao && !map.has(acao)) {
      map.set(acao, { code: acao, label: acao });
    }

    return Array.from(map.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" })
    );
  }, [filters?.actions, acao]);

  const diffRows = useMemo<AuditDiffDisplayRow[]>(() => {
    const flattened = rows.flatMap((entry) => buildAuditDiffRows(entry));

    const hydrated = flattened.map((row) => {
      const beforeText = stringifyAuditValue(row.before);
      const afterText = stringifyAuditValue(row.after);
      const authorName = (row.entry.authorName || "").trim();
      const authorEmail = row.entry.authorEmail?.trim() ?? "";
      const authorLabel = authorName || authorEmail || "sem autor";

      return {
        ...row,
        authorLabel,
        beforeText,
        afterText,
        searchText: buildRowSearchIndex(row, beforeText, afterText, authorLabel)
      };
    });

    return [...hydrated].sort((left, right) => {
      if (sortColumn === "field") {
        return sortDirection === "asc"
          ? left.field.localeCompare(right.field, "pt-BR", { sensitivity: "base" })
          : right.field.localeCompare(left.field, "pt-BR", { sensitivity: "base" });
      }

      if (sortColumn === "before") {
        return sortDirection === "asc"
          ? left.beforeText.localeCompare(right.beforeText, "pt-BR")
          : right.beforeText.localeCompare(left.beforeText, "pt-BR");
      }

      if (sortColumn === "after") {
        return sortDirection === "asc"
          ? left.afterText.localeCompare(right.afterText, "pt-BR")
          : right.afterText.localeCompare(left.afterText, "pt-BR");
      }

      if (sortColumn === "author") {
        return sortDirection === "asc"
          ? left.authorLabel.localeCompare(right.authorLabel, "pt-BR", {
              sensitivity: "base"
            })
          : right.authorLabel.localeCompare(left.authorLabel, "pt-BR", {
              sensitivity: "base"
            });
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

  const visibleRows = useMemo(() => {
    if (!quickSearchTerm) return diffRows;
    return diffRows.filter((row) => row.searchText.includes(quickSearchTerm));
  }, [diffRows, quickSearchTerm]);

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
          <label
            className="sheet-inline-field audit-filter-field audit-filter-field-search"
            title="Filtrar valores"
            aria-label="Filtrar valores via busca"
          >
            Buscar
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Ctrl + F da pagina (autor, tabela, PK, email...)"
              title="Filtrar valores"
            />
          </label>

          <label
            className="sheet-inline-field audit-filter-field"
            title="Filtrar valores"
            aria-label="Modo de filtragem"
          >
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

          <label
            className="sheet-inline-field audit-filter-field"
            title="Filtrar valores"
            aria-label="Filtrar por autor"
          >
            Autor
            <select
              value={autor}
              onChange={(event) => {
                setAutor(event.target.value.trim());
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {authorOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label
            className="sheet-inline-field audit-filter-field"
            title="Filtrar valores"
            aria-label="Filtrar por tabela"
          >
            Tabela
            <select
              value={tabela}
              onChange={(event) => {
                setTabela(event.target.value.trim());
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {tableOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label
            className="sheet-inline-field audit-filter-field"
            title="Filtrar valores"
            aria-label="Filtrar por acao"
          >
            Acao
            <select
              value={acao}
              onChange={(event) => {
                setAcao(event.target.value.trim());
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {actionOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label
            className="sheet-inline-field audit-filter-field"
            title="Filtrar valores"
            aria-label="Filtrar data inicial"
          >
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

          <label
            className="sheet-inline-field audit-filter-field"
            title="Filtrar valores"
            aria-label="Filtrar data final"
          >
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

          <div className="audit-page-controller">
            <label
              className="sheet-inline-field audit-filter-field audit-filter-field-page"
              title="Filtrar valores"
              aria-label="Linhas por pagina"
            >
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

            <div className="sheet-pager audit-dashboard-pager audit-filter-pager">
              <button
                type="button"
                className="sheet-panel-head-btn"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!pagination || page <= 1}
                title="Filtrar valores"
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
                disabled={!pagination || page >= (pagination?.totalPages ?? 1)}
                title="Filtrar valores"
              >
                Proxima
              </button>
            </div>
          </div>
        </section>

        {error ? <p className="sheet-error audit-dashboard-error">Erro: {error}</p> : null}

        <div className="audit-grid-wrap">
          {!loading && visibleRows.length === 0 ? (
            <article className="audit-grid-empty">
              <strong>Nenhum log encontrado.</strong>
              <p>Ajuste os filtros para ampliar a busca.</p>
            </article>
          ) : null}

          {visibleRows.length > 0 ? (
            <table className="sheet-grid audit-grid-table">
              <thead>
                <tr>
                  <th title="Filtrar valores">
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("createdAt")}
                        title="Ordenar por data da atualizacao"
                      >
                        <span className="sheet-th-label">Atualizacao</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("createdAt")}</span>
                    </div>
                  </th>

                  <th title="Filtrar valores">
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("author")}
                        title="Ordenar por autor"
                      >
                        <span className="sheet-th-label">Autor</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("author")}</span>
                    </div>
                  </th>

                  <th title="Filtrar valores">
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("table")}
                        title="Ordenar por tabela"
                      >
                        <span className="sheet-th-label">Tabela</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("table")}</span>
                    </div>
                  </th>

                  <th title="Filtrar valores">
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("action")}
                        title="Ordenar por tipo de operacao"
                      >
                        <span className="sheet-th-label">Operacao</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("action")}</span>
                    </div>
                  </th>

                  <th title="Filtrar valores">
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("field")}
                        title="Ordenar pelo campo alterado"
                      >
                        <span className="sheet-th-label">Campo alterado</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("field")}</span>
                    </div>
                  </th>

                  <th title="Filtrar valores">
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("before")}
                        title="Ordenar pelos valores anteriores"
                      >
                        <span className="sheet-th-label">Valor anterior</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("before")}</span>
                    </div>
                  </th>

                  <th title="Filtrar valores">
                    <div className="sheet-th-content">
                      <button
                        type="button"
                        className="audit-grid-sort"
                        onClick={() => toggleSort("after")}
                        title="Ordenar pelos valores atualizados"
                      >
                        <span className="sheet-th-label">Valor atualizado</span>
                      </button>
                      <span className="sheet-sort-pill">{sortIndicator("after")}</span>
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => {
                  const isExpanded = Boolean(expandedRowIds[row.id]);
                  const authorEmail = row.entry.authorEmail?.trim() ?? "";
                  const authorRole = row.entry.authorRole?.trim() ?? "";
                  const pkValue = row.entry.pk?.trim() ?? "";
                  const batchValue = row.entry.batchId?.trim() ?? "";
                  const detailsValue = row.entry.details?.trim() ?? "";
                  const authorLabel = row.authorLabel;
                  const actionLabel = row.entry.actionLabel || row.entry.actionCode;

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="audit-grid-row"
                        onClick={() => {
                          if (hasActiveTextSelection()) return;
                          setExpandedRowIds((current) => ({
                            ...current,
                            [row.id]: !current[row.id]
                          }));
                        }}
                      >
                        <td>{formatAuditDateTime(row.entry.createdAt)}</td>
                        <td className="audit-cell-author">{authorLabel}</td>
                        <td>{row.entry.table}</td>
                        <td>{actionLabel}</td>
                        <td className="audit-cell-changed">{row.field}</td>
                        <td>
                          <span className="audit-grid-preview" title={row.beforeText}>
                            {row.beforeText}
                          </span>
                        </td>
                        <td className="audit-cell-changed">
                          <span className="audit-grid-preview" title={row.afterText}>
                            {row.afterText}
                          </span>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="audit-grid-expanded-row">
                          <td colSpan={7}>
                            <div className="audit-grid-expanded-content">
                              <div className="audit-grid-expanded-meta">
                                <span>
                                  <strong>Usuario:</strong> {authorLabel}
                                </span>

                                {authorRole ? (
                                  <span>
                                    <strong>Cargo:</strong> {authorRole}
                                  </span>
                                ) : null}

                                {authorEmail ? (
                                  <span>
                                    <strong>Email:</strong> {authorEmail}
                                  </span>
                                ) : null}

                                {pkValue ? (
                                  <span>
                                    <strong>PK:</strong> {pkValue}
                                  </span>
                                ) : null}

                                {row.entry.inBatch ? (
                                  <span>
                                    <strong>Lote:</strong> {batchValue || "sim"}
                                  </span>
                                ) : null}

                                {detailsValue ? (
                                  <span>
                                    <strong>Detalhes:</strong> {detailsValue}
                                  </span>
                                ) : null}
                              </div>

                              <div className="audit-grid-expanded-values">
                                <div>
                                  <strong>Valor anterior</strong>
                                  <pre>{row.beforeText}</pre>
                                </div>

                                <div>
                                  <strong>Valor atualizado</strong>
                                  <pre>{row.afterText}</pre>
                                </div>
                              </div>
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

      </section>
    </div>
  );
}
