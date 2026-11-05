"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import { Icon, type ExplorerIconName } from "@/components/files/explorer/explorer-icons";
import type { SortDirection, SortKey } from "@/components/files/explorer/model";

export type ViewMode = "details" | "list" | "tiles" | "large";

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  details: "Detalhes",
  list: "Lista",
  tiles: "Ícones médios",
  large: "Ícones grandes"
};

const VIEW_MODE_ICONS: Record<ViewMode, ExplorerIconName> = {
  details: "viewDetails",
  list: "viewList",
  tiles: "viewTiles",
  large: "viewLarge"
};

export const SORT_LABELS: Record<SortKey, string> = {
  order: "Ordem personalizada",
  name: "Nome",
  modified: "Data de modificação",
  type: "Tipo",
  size: "Tamanho"
};

export type CommandAction = {
  id: string;
  label: string;
  icon: ExplorerIconName;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  danger?: boolean;
  primary?: boolean;
  active?: boolean;
  title?: string;
};

function Dropdown({
  label,
  icon,
  children,
  testId,
  active = false
}: {
  label: string;
  icon: ExplorerIconName;
  children: (close: () => void) => ReactNode;
  testId?: string;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.cmdBtn} ${active ? styles.cmdActive : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid={testId}
        title={label}
      >
        <Icon name={icon} />
        <span className={`${styles.cmdLabel} ${styles.cmdLabelWide}`}>{label}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <div className={styles.dropdownMenu} role="menu">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function MenuCheck({ checked, label, onClick, icon }: { checked: boolean; label: string; onClick: () => void; icon?: ExplorerIconName }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className={styles.menuItem} onClick={onClick}>
      <span className={styles.menuCheck}>{checked ? <Icon name="check" size={13} /> : null}</span>
      {icon ? <Icon name={icon} size={15} /> : null}
      <span>{label}</span>
    </button>
  );
}

type CommandBarProps = {
  actions: CommandAction[];
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  sortOptions: SortKey[];
  onSort: (key: SortKey, direction: SortDirection) => void;
  navPaneOpen: boolean;
  detailsPaneOpen: boolean;
  onToggleNavPane: () => void;
  onToggleDetailsPane: () => void;
  /** Menu "Ferramentas" (Inconsistências, Console OCR, Automações). */
  tools?: CommandAction[];
  selectionCount?: number;
  onClearSelection?: () => void;
};

export function ExplorerCommandBar(props: CommandBarProps) {
  const visible = props.actions.filter((action) => !action.hidden);
  const tools = (props.tools ?? []).filter((action) => !action.hidden);
  const selectionCount = props.selectionCount ?? 0;

  return (
    <div className={styles.commandRow} role="toolbar" aria-label="Comandos" data-selecting={selectionCount > 0 || undefined}>
      <div className={styles.commandScroll}>
        {selectionCount > 0 ? (
          <span className={styles.selectionChip} data-testid="explorer-selection-chip">
            <strong>{selectionCount}</strong>
            <span className={styles.cmdLabel}>selecionado{selectionCount === 1 ? "" : "s"}</span>
            <button type="button" className={styles.iconBtn} onClick={props.onClearSelection} aria-label="Limpar seleção" title="Limpar seleção (Esc)">
              <Icon name="close" size={12} />
            </button>
          </span>
        ) : null}
        {visible.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`${styles.cmdBtn} ${action.primary ? styles.cmdPrimary : ""} ${action.danger ? styles.cmdDanger : ""} ${action.active ? styles.cmdActive : ""}`}
            aria-pressed={action.active}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title ?? action.label}
            data-testid={`explorer-cmd-${action.id}`}
          >
            <Icon name={action.icon} />
            <span className={styles.cmdLabel}>{action.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.commandRight}>
        <Dropdown label="Ordenar" icon="sort">
          {(close) => (
            <>
              {props.sortOptions.map((key) => (
                <MenuCheck
                  key={key}
                  checked={props.sortKey === key}
                  label={SORT_LABELS[key]}
                  onClick={() => {
                    props.onSort(key, props.sortDirection);
                    close();
                  }}
                />
              ))}
              <div className={styles.menuSep} />
              <MenuCheck checked={props.sortDirection === "asc"} label="Crescente" onClick={() => { props.onSort(props.sortKey, "asc"); close(); }} />
              <MenuCheck checked={props.sortDirection === "desc"} label="Decrescente" onClick={() => { props.onSort(props.sortKey, "desc"); close(); }} />
            </>
          )}
        </Dropdown>
        <Dropdown label="Exibir" icon={VIEW_MODE_ICONS[props.viewMode]}>
          {(close) => (
            <>
              {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
                <MenuCheck
                  key={mode}
                  checked={props.viewMode === mode}
                  icon={VIEW_MODE_ICONS[mode]}
                  label={VIEW_MODE_LABELS[mode]}
                  onClick={() => {
                    props.onViewMode(mode);
                    close();
                  }}
                />
              ))}
              <div className={styles.menuSep} />
              <MenuCheck checked={props.navPaneOpen} icon="tree" label="Painel de navegação" onClick={() => { props.onToggleNavPane(); close(); }} />
              <MenuCheck checked={props.detailsPaneOpen} icon="pane" label="Painel de detalhes" onClick={() => { props.onToggleDetailsPane(); close(); }} />
            </>
          )}
        </Dropdown>
        <button
          type="button"
          className={`${styles.cmdBtn} ${props.detailsPaneOpen ? styles.cmdActive : ""}`}
          onClick={props.onToggleDetailsPane}
          aria-pressed={props.detailsPaneOpen}
          title="Painel de detalhes (Alt+P)"
          data-testid="explorer-toggle-details"
        >
          <Icon name="pane" />
          <span className={`${styles.cmdLabel} ${styles.cmdLabelWide}`}>Detalhes</span>
        </button>
        {tools.length > 0 ? (
          <Dropdown label="Ferramentas" icon="settings" testId="explorer-cmd-tools" active={tools.some((tool) => tool.active)}>
            {(close) =>
              tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    close();
                    tool.onClick();
                  }}
                  title={tool.title}
                  data-testid={`explorer-cmd-${tool.id}`}
                >
                  <span className={styles.menuCheck}>
                    <Icon name={tool.icon} size={15} />
                  </span>
                  <span className={styles.menuLabel}>{tool.label}</span>
                  {tool.active ? <Icon name="check" size={13} /> : null}
                </button>
              ))
            }
          </Dropdown>
        ) : null}
      </div>
    </div>
  );
}
