"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon, type ExplorerIconName } from "@/components/files/explorer/explorer-icons";
import styles from "@/components/ui-grid/grid-command-bar.module.css";

/**
 * Barra ÚNICA do grid (mesmo desenho da aba Arquivos): tabela ativa, busca,
 * ações da seleção, poucas ações primárias e o resto em "Mais". Substitui as
 * quatro faixas antigas (título, toolbox de ícones, status e busca).
 */

export type GridAction = {
  id: string;
  label: string;
  icon: ExplorerIconName;
  onClick: () => void;
  testId?: string;
  title?: string;
  disabled?: boolean;
  hidden?: boolean;
  primary?: boolean;
  danger?: boolean;
  /** Destaque de aviso (insights, incompletos). */
  warning?: boolean;
  active?: boolean;
  badge?: number;
  /** Só ícone (rótulo vira dica). */
  iconOnly?: boolean;
  /** Celular: false = vai para o "Mais"; true (barra 2) = continua à vista. */
  mobile?: boolean;
};

export type GridMenuEntry =
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: ExplorerIconName;
      onSelect: () => void;
      testId?: string;
      disabled?: boolean;
      hidden?: boolean;
      /** Item liga/desliga (modo conferência, editor...). */
      checked?: boolean;
      danger?: boolean;
      hint?: string;
    }
  | { type: "separator"; id: string; hidden?: boolean };

export type SearchMatchMode = "contains" | "exact" | "starts" | "ends";

const MATCH_LABELS: Record<SearchMatchMode, string> = {
  contains: "contém",
  exact: "igual",
  starts: "começa",
  ends: "termina"
};

const MENU_MIN_WIDTH = 250;

/**
 * Botão que abre um menu suspenso ("Mais", "Confirmar"...). O menu abre para o
 * lado que cabe na tela — nunca sai cortado pela esquerda no celular.
 */
export function MenuButton({
  entries,
  label = "Mais",
  icon = "more",
  testId = "action-more",
  title = "Mais opções",
  tone,
  hideLabel
}: {
  entries: GridMenuEntry[];
  label?: string;
  icon?: ExplorerIconName;
  testId?: string;
  title?: string;
  tone?: "confirm";
  /** Rótulo só para leitores de tela (botão compacto). */
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = entries.filter((entry) => !entry.hidden);
  // Sem separador no começo, no fim ou repetido.
  const cleaned = visible.filter((entry, index) => {
    if (entry.type !== "separator") return true;
    const prev = visible[index - 1];
    return index > 0 && index < visible.length - 1 && prev?.type !== "separator";
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  if (cleaned.length === 0) return null;

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.btn} ${tone === "confirm" ? styles.confirm : ""}`}
        onClick={() => {
          const rect = ref.current?.getBoundingClientRect();
          setAlignLeft(Boolean(rect && rect.right < MENU_MIN_WIDTH + 8));
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={hideLabel ? label : undefined}
        data-testid={testId}
        title={title}
      >
        <Icon name={icon} />
        {hideLabel ? null : <span className={styles.label}>{label}</span>}
      </button>
      {open ? (
        <div className={`${styles.menu} ${alignLeft ? styles.menuLeft : ""}`} role="menu">
          {cleaned.map((entry) =>
            entry.type === "separator" ? (
              <div key={entry.id} className={styles.menuSep} role="separator" />
            ) : (
              <button
                key={entry.id}
                type="button"
                role={entry.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={entry.checked}
                className={`${styles.menuItem} ${entry.danger ? styles.danger : ""}`}
                disabled={entry.disabled}
                data-testid={entry.testId}
                title={entry.hint}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect();
                }}
              >
                <span className={styles.menuIcon}>
                  {entry.checked ? <Icon name="check" size={14} /> : entry.icon ? <Icon name={entry.icon} size={15} /> : null}
                </span>
                <span className={styles.menuLabel}>{entry.label}</span>
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ActionButton({ action }: { action: GridAction }) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${action.primary ? styles.primary : ""} ${action.danger ? styles.danger : ""} ${action.warning ? styles.warning : ""} ${
        action.active ? styles.active : ""
      }`}
      onClick={action.onClick}
      disabled={action.disabled}
      data-testid={action.testId}
      title={action.title ?? action.label}
      aria-label={action.label}
      aria-pressed={action.active}
    >
      <Icon name={action.icon} />
      {action.iconOnly ? null : <span className={styles.label}>{action.label}</span>}
      {action.badge != null && action.badge > 0 ? <span className={styles.badge}>{action.badge}</span> : null}
    </button>
  );
}

type GridPagerProps = { page: number; totalPages: number; onPage: (page: number) => void; pageSize: number; onPageSize: (size: number) => void };

function Pager({ pager }: { pager: GridPagerProps }) {
  return (
    <div className={`${styles.pager} ${pager.totalPages > 1 ? "" : styles.pagerSizeOnly}`} data-testid="sheet-pager">
      {pager.totalPages > 1 ? (
        <>
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={() => pager.onPage(Math.max(1, pager.page - 1))}
            disabled={pager.page <= 1}
            aria-label="Página anterior"
            data-testid="pager-prev"
          >
            <Icon name="back" size={14} />
          </button>
          <span className={styles.pagerStatus}>
            {pager.page}/{pager.totalPages}
          </span>
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={() => pager.onPage(pager.page + 1)}
            disabled={pager.page >= pager.totalPages}
            aria-label="Próxima página"
            data-testid="pager-next"
          >
            <Icon name="forward" size={14} />
          </button>
        </>
      ) : null}
      <select
        className={styles.pagerSize}
        value={pager.pageSize}
        onChange={(event) => pager.onPageSize(Number(event.target.value))}
        aria-label="Linhas por página"
        title="Linhas por página"
        data-testid="pager-size"
      >
        {[25, 50, 100].map((size) => (
          <option key={size} value={size}>
            {size}/pág.
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Barra 1 — a TABELA e os REGISTROS: tabela ativa, Novo, ações da seleção,
 * avisos, atalhos e paginação. No celular recebe também a barra 2 compacta
 * (`tools`) e o "Mais" com tudo o que não cabe.
 */
export function GridCommandBar(props: {
  tableLabel: string;
  tableAlert: boolean;
  tablesOpen: boolean;
  onToggleTables: () => void;
  tablesTitle?: string;
  selectionCount: number;
  onClearSelection: () => void;
  selectionActions: GridAction[];
  actions: GridAction[];
  /** Só no celular: o que fica escondido atrás do "Mais". */
  mobileMenu?: GridMenuEntry[];
  /** Só no celular: busca e ferramentas principais na mesma barra. */
  tools?: ReactNode;
  mobile?: boolean;
  meta?: ReactNode;
  /** Atalhos fixos (envelope, post-it). */
  trailing?: ReactNode;
  pager?: GridPagerProps;
  /** Erro da tabela (linha fina abaixo da barra). */
  notice?: string | null;
  /** Sem ações (ex.: painel de auditoria). */
  minimal?: boolean;
}) {
  const visible = (action: GridAction) => !action.hidden && (!props.mobile || action.mobile !== false);
  const selectionActions = props.selectionActions.filter(visible);
  const actions = props.actions.filter(visible);

  return (
    <div className={styles.wrap}>
      <div className={styles.bar} role="toolbar" aria-label="Comandos da tabela" data-testid="grid-command-bar">
        <button
          type="button"
          className={`${styles.btn} ${styles.table}`}
          onClick={props.onToggleTables}
          aria-expanded={props.tablesOpen}
          aria-controls="sheet-sidebar"
          title={props.tablesTitle ?? "Trocar de tabela"}
          data-testid="sidebar-toggle"
        >
          <Icon name="menu" />
          <strong className={styles.tableLabel}>{props.tableLabel}</strong>
          {props.tableAlert ? <span className={styles.dot} aria-label="Há avisos em outras tabelas" /> : null}
          <Icon name="chevronDown" size={12} />
        </button>

        {props.minimal ? null : (
          <div className={styles.group} data-testid="toolbar-grid-quick-actions">
            {props.selectionCount > 0 ? (
              <span className={styles.selection} data-testid="grid-selection-chip">
                <strong>{props.selectionCount}</strong>
                <span className={styles.label}>selecionada{props.selectionCount === 1 ? "" : "s"}</span>
                <button type="button" className={styles.clear} onClick={props.onClearSelection} aria-label="Limpar seleção" title="Limpar seleção">
                  <Icon name="close" size={12} />
                </button>
              </span>
            ) : null}
            {selectionActions.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
            {actions.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
            {props.mobile && props.mobileMenu ? <MenuButton entries={props.mobileMenu} /> : null}
          </div>
        )}

        {props.meta ? <span className={styles.meta}>{props.meta}</span> : null}
        {props.trailing || props.pager ? (
          <div className={styles.trailing}>
            {props.trailing}
            {props.pager ? <Pager pager={props.pager} /> : null}
          </div>
        ) : null}
        {props.mobile && props.tools ? <div className={styles.mobileTools}>{props.tools}</div> : null}
      </div>
      {props.notice ? (
        <p className={styles.notice} role="alert">
          {props.notice}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Barra 2 — a VISÃO do grid, presa no topo dele: busca, filtros e grupos de
 * ferramentas (seleção/editor, colunas, imprimir/recarregar). Desenho de
 * grupos encostados (segmentos), diferente da barra 1.
 */
export function GridToolsBar(props: {
  query: string;
  onQuery: (value: string) => void;
  matchMode: SearchMatchMode;
  onMatchMode: (mode: SearchMatchMode) => void;
  groups: Array<{ id: string; items: GridAction[] }>;
  /** Celular: só a busca e os itens marcados `mobile`. */
  compact?: boolean;
}) {
  const groups = props.groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.hidden && (!props.compact || item.mobile === true)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className={`${styles.tools} ${props.compact ? styles.toolsCompact : ""}`} role="toolbar" aria-label="Busca e ferramentas do grid" data-testid="grid-tools-bar">
      <label className={styles.search} data-testid="toolbar-grid-search">
        <Icon name="search" size={15} />
        <input
          type="search"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar na tabela"
          data-testid="grid-search-input"
        />
        {props.query ? (
          <button type="button" className={styles.clear} onClick={() => props.onQuery("")} aria-label="Limpar busca" data-testid="action-clear-search">
            <Icon name="close" size={12} />
          </button>
        ) : null}
        {props.compact ? null : (
          <select
            className={styles.match}
            value={props.matchMode}
            onChange={(event) => props.onMatchMode(event.target.value as SearchMatchMode)}
            aria-label="Como comparar"
            title="Como comparar a busca"
          >
            {(Object.keys(MATCH_LABELS) as SearchMatchMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {MATCH_LABELS[mode]}
              </option>
            ))}
          </select>
        )}
      </label>
      {groups.map((group) => (
        <div key={group.id} className={styles.segment} role="group">
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.segBtn} ${item.active ? styles.segOn : ""} ${item.warning ? styles.warning : ""}`}
              onClick={item.onClick}
              disabled={item.disabled}
              data-testid={item.testId}
              title={item.title ?? item.label}
              aria-label={item.label}
              aria-pressed={item.active}
            >
              <Icon name={item.icon} size={15} />
              <span className={styles.segLabel}>{item.label}</span>
              {item.badge != null && item.badge > 0 ? <span className={styles.badge}>{item.badge}</span> : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Ferramentas do cabeçalho do form de registro (dentro do FocusDialog):
 * anterior/próximo (modo editor), ações do momento, Confirmar e "Mais".
 */
export function RecordTools(props: {
  actions?: GridAction[];
  confirm?: { label: string; title: string; entries: GridMenuEntry[] } | null;
  menu?: GridMenuEntry[];
  nav?: { onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean; label: string } | null;
}) {
  const actions = (props.actions ?? []).filter((action) => !action.hidden);
  return (
    <div className={styles.recordTools}>
      {props.nav ? (
        <div className={styles.pager} data-testid="form-nav">
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={props.nav.onPrev}
            disabled={!props.nav.canPrev}
            aria-label="Registro anterior"
            title="Registro anterior"
            data-testid="form-prev"
          >
            <Icon name="back" size={14} />
          </button>
          <span className={styles.pagerStatus}>{props.nav.label}</span>
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={props.nav.onNext}
            disabled={!props.nav.canNext}
            aria-label="Próximo registro"
            title="Próximo registro"
            data-testid="form-next"
          >
            <Icon name="forward" size={14} />
          </button>
        </div>
      ) : null}
      {actions.map((action) => (
        <ActionButton key={action.id} action={action} />
      ))}
      {props.confirm ? (
        <MenuButton
          entries={props.confirm.entries}
          label={props.confirm.label}
          icon="check"
          title={props.confirm.title}
          testId="form-confirmar-info"
          tone="confirm"
        />
      ) : null}
      {props.menu ? <MenuButton entries={props.menu} testId="form-more" hideLabel /> : null}
    </div>
  );
}
