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

export function GridCommandBar(props: {
  tableLabel: string;
  tableAlert: boolean;
  tablesOpen: boolean;
  onToggleTables: () => void;
  tablesTitle?: string;
  query: string;
  onQuery: (value: string) => void;
  matchMode: SearchMatchMode;
  onMatchMode: (mode: SearchMatchMode) => void;
  selectionCount: number;
  onClearSelection: () => void;
  selectionActions: GridAction[];
  actions: GridAction[];
  menu: GridMenuEntry[];
  meta?: ReactNode;
  /** Atalhos fixos (envelope, post-it). */
  trailing?: ReactNode;
  /** Paginação compacta (some quando há uma página só). */
  pager?: { page: number; totalPages: number; onPage: (page: number) => void; pageSize: number; onPageSize: (size: number) => void };
  /** Erro da tabela (linha fina abaixo da barra). */
  notice?: string | null;
  /** Sem busca/ações (ex.: painel de auditoria). */
  minimal?: boolean;
}) {
  const selectionActions = props.selectionActions.filter((action) => !action.hidden);
  const actions = props.actions.filter((action) => !action.hidden);

  const pager = props.pager;
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
      </label>
      )}

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
        <MenuButton entries={props.menu} />
      </div>
      )}

      {props.meta ? <span className={styles.meta}>{props.meta}</span> : null}
      {props.trailing || pager ? (
        <div className={styles.trailing}>
          {props.trailing}
          {pager ? (
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
          ) : null}
        </div>
      ) : null}
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
 * Cabeçalho de painel (form, inserção em massa, tabela ao lado) — mesmo desenho
 * da barra do grid: título, as poucas ações do momento, "Mais" com o resto,
 * Salvar (quando é form) e fechar.
 */
export function FormCommandBar(props: {
  title: string;
  /** Texto curto ao lado do título (ex.: "tabela ao lado"). */
  subtitle?: string;
  /** Campos importantes faltando (tarja amarela + dica). */
  warning?: string | null;
  actions?: GridAction[];
  confirm?: { label: string; title: string; entries: GridMenuEntry[] } | null;
  menu?: GridMenuEntry[];
  /** Sem rótulo = painel sem botão de salvar. */
  submitLabel?: string;
  submitDisabled?: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  closeLabel?: string;
  testId?: string;
  submitTestId?: string;
  closeTestId?: string;
}) {
  const actions = (props.actions ?? []).filter((action) => !action.hidden);
  return (
    <header
      className={`${styles.formBar} ${props.warning ? styles.formWarn : ""}`}
      data-testid={props.testId ?? "form-topbar"}
      title={props.warning ?? undefined}
    >
      <strong className={styles.formTitle}>
        {props.title}
        {props.subtitle ? <span className={styles.formSubtitle}>{props.subtitle}</span> : null}
      </strong>
      <div className={styles.formActions}>
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
        {props.menu ? <MenuButton entries={props.menu} testId="form-more" /> : null}
        {props.submitLabel ? (
          <button
            type="submit"
            className={`${styles.btn} ${styles.primary}`}
            data-testid={props.submitTestId ?? "form-submit"}
            disabled={props.submitDisabled}
          >
            {props.submitLabel}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.btn}
          data-testid={props.closeTestId ?? "panel-close-form"}
          onClick={props.onClose}
          disabled={props.closeDisabled}
          title={props.closeLabel ?? "Fechar formulário"}
          aria-label={props.closeLabel ?? "Fechar formulario"}
        >
          <Icon name="close" />
        </button>
      </div>
    </header>
  );
}
