"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/files/explorer/explorer-icons";
import {
  EMPTY_AUDIT_FILTERS,
  auditFiltersToParams,
  fetchAuditPage,
  type AuditFilters
} from "@/components/audit/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import { formatAuditValue } from "@/lib/domain/auditoria/changes";
import type { AuditChangeView, AuditEntry, AuditMeta } from "@/lib/domain/auditoria/service";
import styles from "./audit-explorer.module.css";

export type AuditFilterDefaults = Partial<AuditFilters>;

type Period = "" | "hoje" | "7d" | "custom";

const VERB: Record<string, string> = { INSERT: "criou", UPDATE: "alterou", DELETE: "apagou" };
const GROUP_LABEL: Record<string, string> = { operacao: "Operação", arquivos: "Arquivos", configuracao: "Configuração" };
const VISIBLE_CHANGES = 4;
const VISIBLE_IN_GROUP = 5;

function localDay(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function periodOf(filters: AuditFilters): Period {
  if (!filters.de && !filters.ate) return "";
  const today = localDay();
  if (filters.de === today && filters.ate === today) return "hoje";
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  if (filters.de === localDay(sixDaysAgo) && !filters.ate) return "7d";
  return "custom";
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = localDay();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = localDay(date);
  if (day === today) return "Hoje";
  if (day === localDay(yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

type Group = { key: string; batchId: string | null; entries: AuditEntry[] };

/** Junta a ação do usuário com o que a automação fez na mesma requisição (mesmo lote). */
function groupByBatch(entries: AuditEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && entry.batchId && last.batchId === entry.batchId) last.entries.push(entry);
    else groups.push({ key: entry.id, batchId: entry.batchId, entries: [entry] });
  }
  for (const group of groups) {
    // Causa antes do efeito: pessoas primeiro, SISTEMA depois; dentro de cada um, em ordem.
    group.entries.sort((left, right) => Number(left.author.system) - Number(right.author.system) || left.at.localeCompare(right.at));
  }
  return groups;
}

function valueText(change: AuditChangeView, side: "before" | "after") {
  const label = side === "before" ? change.beforeText : change.afterText;
  return label ?? formatAuditValue(side === "before" ? change.before : change.after);
}

function ChangeList({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  if (entry.changes.length === 0) return null;
  const shown = open ? entry.changes : entry.changes.slice(0, VISIBLE_CHANGES);
  const single = entry.action !== "UPDATE";
  return (
    <div className={styles.changes}>
      {shown.map((change) => (
        <div key={change.field} className={styles.change}>
          <span className={styles.field} title={change.field}>
            {change.label}
          </span>
          {single ? (
            <span className={styles.value} data-side={entry.action === "DELETE" ? "before" : "after"} title={valueText(change, entry.action === "DELETE" ? "before" : "after")}>
              {valueText(change, entry.action === "DELETE" ? "before" : "after")}
            </span>
          ) : (
            <span className={styles.diff}>
              <span className={styles.value} data-side="before" title={valueText(change, "before")}>
                {valueText(change, "before")}
              </span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
              <span className={styles.value} data-side="after" title={valueText(change, "after")}>
                {valueText(change, "after")}
              </span>
            </span>
          )}
        </div>
      ))}
      {entry.changes.length > VISIBLE_CHANGES ? (
        <button type="button" className={styles.more} onClick={() => setOpen((value) => !value)}>
          {open ? "mostrar menos" : `+${entry.changes.length - VISIBLE_CHANGES} campo(s)`}
        </button>
      ) : null}
    </div>
  );
}

function EntryRow(props: {
  entry: AuditEntry;
  nested: boolean;
  onFilter: (patch: Partial<AuditFilters>) => void;
}) {
  const { entry, nested, onFilter } = props;
  const system = entry.author.system;
  return (
    <article className={styles.entry} data-nested={nested || undefined} data-system={system || undefined} data-testid="audit-entry">
      <div className={styles.head}>
        <span className={styles.avatar} data-system={system || undefined} aria-hidden="true">
          {system ? <Icon name="settings" size={14} /> : initials(entry.author.name)}
        </span>
        <button
          type="button"
          className={styles.author}
          title={system ? "Ver só alterações automáticas" : `Ver só alterações de ${entry.author.name}`}
          onClick={() => onFilter(system || !entry.author.id ? { origem: "sistema", autor: "" } : { autor: entry.author.id, origem: "" })}
        >
          {entry.author.name}
        </button>
        <span className={styles.verb} data-action={entry.action}>
          {VERB[entry.action] ?? entry.action.toLowerCase()}
        </span>
        <button type="button" className={styles.table} title="Ver só esta tabela" onClick={() => onFilter({ tabela: entry.table })}>
          {entry.tableLabel}
        </button>
        {entry.placa ? (
          <button type="button" className={styles.plate} title="Ver tudo desta placa" onClick={() => onFilter({ q: entry.placa ?? "" })}>
            <Icon name="car" size={13} />
            {entry.placa}
          </button>
        ) : null}
        <span className={styles.spacer} />
        {entry.pk ? (
          <button
            type="button"
            className={styles.iconBtn}
            title="Histórico deste registro"
            aria-label="Histórico deste registro"
            data-testid="audit-history"
            onClick={() => onFilter({ ...EMPTY_AUDIT_FILTERS, tabela: entry.table, pk: entry.pk ?? "" })}
          >
            <Icon name="history" size={15} />
          </button>
        ) : null}
        <time className={styles.time} dateTime={entry.at} title={new Date(entry.at).toLocaleString("pt-BR")}>
          {timeLabel(entry.at)}
        </time>
      </div>
      {entry.details ? <p className={styles.details}>{entry.details}</p> : null}
      <ChangeList entry={entry} />
    </article>
  );
}

function GroupCard(props: { group: Group; onFilter: (patch: Partial<AuditFilters>) => void }) {
  const { group, onFilter } = props;
  const [open, setOpen] = useState(false);
  const hasUser = group.entries.some((entry) => !entry.author.system);
  const shown = open ? group.entries : group.entries.slice(0, VISIBLE_IN_GROUP);
  const hidden = group.entries.length - shown.length;
  return (
    <div className={styles.group} data-testid="audit-group">
      {shown.map((entry, index) => (
        <EntryRow key={entry.id} entry={entry} nested={hasUser && index > 0 && entry.author.system} onFilter={onFilter} />
      ))}
      {hidden > 0 || (group.entries.length > 1 && group.batchId) ? (
        <div className={styles.groupFoot}>
          {hidden > 0 ? (
            <button type="button" className={styles.more} onClick={() => setOpen(true)}>
              +{hidden} alteração(ões) nesta ação
            </button>
          ) : null}
          {group.batchId && group.entries.length > 1 ? (
            <button type="button" className={styles.more} onClick={() => onFilter({ ...EMPTY_AUDIT_FILTERS, lote: group.batchId ?? "" })}>
              ver só esta ação
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AuditExplorer({ requestAuth, initialFilters }: { requestAuth: RequestAuth; initialFilters?: AuditFilterDefaults }) {
  const [filters, setFilters] = useState<AuditFilters>(() => ({ ...EMPTY_AUDIT_FILTERS, ...initialFilters }));
  const [searchInput, setSearchInput] = useState(filters.q);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [meta, setMeta] = useState<AuditMeta | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(() => periodOf({ ...EMPTY_AUDIT_FILTERS, ...initialFilters }));
  const requestRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<AuditMeta | null>(null);

  const applyFilters = useCallback(
    (patch: Partial<AuditFilters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      if ("q" in patch) setSearchInput(next.q);
      if ("de" in patch || "ate" in patch) setPeriod(periodOf(next));
      listRef.current?.scrollTo?.({ top: 0 });
    },
    [filters]
  );

  // Busca digitada → filtro (com respiro).
  useEffect(() => {
    if (searchInput === filters.q) return;
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, q: searchInput })), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, filters.q]);

  // Endereço compartilhável (/auditoria?tabela=…).
  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/auditoria") return;
    const query = auditFiltersToParams(filters).toString();
    window.history.replaceState(window.history.state, "", query ? `/auditoria?${query}` : "/auditoria");
  }, [filters]);

  const load = useCallback(
    async (mode: "reset" | "more", from: string | null) => {
      const requestId = ++requestRef.current;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchAuditPage({ requestAuth, filters, cursor: mode === "more" ? from : null, withMeta: !metaRef.current });
        if (requestId !== requestRef.current) return;
        if (page.meta) {
          metaRef.current = page.meta;
          setMeta(page.meta);
        }
        setEntries((current) => (mode === "more" ? [...current, ...page.entries] : page.entries));
        setCursor(page.nextCursor);
        if (mode === "reset") setTotal(page.total);
      } catch (loadError) {
        if (requestId !== requestRef.current) return;
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a auditoria.");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [filters, requestAuth]
  );

  useEffect(() => {
    void load("reset", null);
  }, [load]);

  // Rolou até o fim → carrega mais.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting) && !loading) void load("more", cursor);
      },
      { root: listRef.current, rootMargin: "240px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, load, loading]);

  const days = useMemo(() => {
    const out: Array<{ label: string; groups: Group[] }> = [];
    for (const group of groupByBatch(entries)) {
      const label = dayLabel(group.entries[0].at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.groups.push(group);
      else out.push({ label, groups: [group] });
    }
    return out;
  }, [entries]);

  const tablesByGroup = useMemo(() => {
    const map = new Map<string, Array<{ key: string; label: string }>>();
    for (const table of meta?.tables ?? []) {
      if (!map.has(table.group)) map.set(table.group, []);
      map.get(table.group)!.push({ key: table.key, label: table.label });
    }
    for (const list of map.values()) list.sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
    return map;
  }, [meta]);

  const hasFilters = Object.values(filters).some((value) => value.trim() !== "");
  const retention = meta?.retention;

  function changePeriod(next: Period) {
    setPeriod(next);
    if (next === "") applyFilters({ de: "", ate: "" });
    else if (next === "hoje") applyFilters({ de: localDay(), ate: localDay() });
    else if (next === "7d") {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      applyFilters({ de: localDay(from), ate: "" });
    }
  }

  return (
    <div className={styles.root} data-testid="audit-explorer">
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icon name="search" size={15} />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Placa, autor ou detalhe"
            aria-label="Buscar na auditoria"
            data-testid="audit-search"
          />
        </label>

        <select
          className={styles.select}
          value={filters.tabela}
          onChange={(event) => applyFilters({ tabela: event.target.value, pk: "" })}
          aria-label="Tabela"
          data-testid="audit-filter-tabela"
        >
          <option value="">Todas as tabelas</option>
          {Array.from(tablesByGroup.entries()).map(([group, tables]) => (
            <optgroup key={group} label={GROUP_LABEL[group] ?? group}>
              {tables.map((table) => (
                <option key={table.key} value={table.key}>
                  {table.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          className={styles.select}
          value={filters.acao}
          onChange={(event) => applyFilters({ acao: event.target.value as AuditFilters["acao"] })}
          aria-label="Ação"
          data-testid="audit-filter-acao"
        >
          <option value="">Criou, alterou ou apagou</option>
          <option value="INSERT">Criou</option>
          <option value="UPDATE">Alterou</option>
          <option value="DELETE">Apagou</option>
        </select>

        <div className={styles.segmented} role="group" aria-label="Origem">
          {(
            [
              ["", "Todos"],
              ["usuario", "Pessoas"],
              ["sistema", "SISTEMA"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "todos"}
              type="button"
              aria-pressed={filters.origem === value}
              onClick={() => applyFilters(value === "sistema" ? { origem: value, autor: "" } : { origem: value })}
              data-testid={`audit-origem-${value || "todos"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          className={styles.select}
          value={filters.autor}
          onChange={(event) => applyFilters(event.target.value ? { autor: event.target.value, origem: "" } : { autor: "" })}
          aria-label="Autor"
          data-testid="audit-filter-autor"
        >
          <option value="">Qualquer pessoa</option>
          {(meta?.authors ?? []).map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </select>

        <select
          className={styles.select}
          value={period}
          onChange={(event) => changePeriod(event.target.value as Period)}
          aria-label="Período"
          data-testid="audit-filter-periodo"
        >
          <option value="">Últimos {retention?.days ?? 30} dias</option>
          <option value="hoje">Hoje</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="custom">Escolher datas…</option>
        </select>
        {period === "custom" ? (
          <span className={styles.dates}>
            <input type="date" value={filters.de} max={filters.ate || undefined} onChange={(event) => applyFilters({ de: event.target.value })} aria-label="De" />
            <span aria-hidden="true">–</span>
            <input type="date" value={filters.ate} min={filters.de || undefined} onChange={(event) => applyFilters({ ate: event.target.value })} aria-label="Até" />
          </span>
        ) : null}

        {hasFilters ? (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setPeriod("");
              applyFilters({ ...EMPTY_AUDIT_FILTERS });
            }}
            data-testid="audit-clear"
          >
            <Icon name="close" size={13} />
            Limpar
          </button>
        ) : null}
      </div>

      <div className={styles.status}>
        <span data-testid="audit-total">
          {total === null ? (loading ? "Carregando…" : "") : `${total.toLocaleString("pt-BR")} alteração(ões)`}
          {loading && total !== null ? " · atualizando…" : ""}
        </span>
        {filters.pk ? (
          <span className={styles.chip}>
            Histórico de um registro
            <button type="button" aria-label="Tirar filtro de registro" onClick={() => applyFilters({ pk: "" })}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ) : null}
        {filters.lote ? (
          <span className={styles.chip}>
            Uma ação
            <button type="button" aria-label="Tirar filtro de ação" onClick={() => applyFilters({ lote: "" })}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ) : null}
        <span className={styles.retention} title="Regra de retenção da auditoria (limpeza automática de hora em hora)">
          Guarda {retention?.days ?? 30} dias ou as últimas {(retention?.maxRowsPerTable ?? 5000).toLocaleString("pt-BR")} alterações por tabela
        </span>
      </div>

      <div className={styles.list} ref={listRef} data-testid="audit-list">
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && entries.length === 0 ? (
          <div className={styles.empty}>
            <Icon name="history" size={22} />
            <strong>Nenhuma alteração encontrada</strong>
            <span>{hasFilters ? "Afrouxe os filtros para ver mais." : "As alterações aparecem aqui assim que alguém (ou o SISTEMA) gravar algo."}</span>
          </div>
        ) : null}
        {days.map((day) => (
          <section key={day.label} className={styles.day}>
            <h3 className={styles.dayLabel}>{day.label}</h3>
            {day.groups.map((group) => (
              <GroupCard key={group.key} group={group} onFilter={applyFilters} />
            ))}
          </section>
        ))}
        <div ref={sentinelRef} className={styles.sentinel} />
        {cursor ? (
          <button type="button" className={styles.loadMore} onClick={() => void load("more", cursor)} disabled={loading} data-testid="audit-load-more">
            {loading ? "Carregando…" : "Carregar mais"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
