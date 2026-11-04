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
  title?: string;
};

function Dropdown({ label, icon, children }: { label: string; icon: ExplorerIconName; children: (close: () => void) => ReactNode }) {
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
      <button type="button" className={styles.cmdBtn} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
        <Icon name={icon} />
        <span className={styles.cmdLabel}>{label}</span>
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
  trailing?: ReactNode;
};

export function ExplorerCommandBar(props: CommandBarProps) {
  const visible = props.actions.filter((action) => !action.hidden);

  return (
    <div className={styles.commandRow} role="toolbar" aria-label="Comandos">
      <div className={styles.commandScroll}>
        {visible.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`${styles.cmdBtn} ${action.primary ? styles.cmdPrimary : ""} ${action.danger ? styles.cmdDanger : ""}`}
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
          <span className={styles.cmdLabel}>Detalhes</span>
        </button>
        {props.trailing}
      </div>
    </div>
  );
}
