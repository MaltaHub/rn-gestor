"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { folderLabel, getChildFolders, getFolderPath, type ExplorerModel } from "@/components/files/explorer/model";
import type { ExplorerDnd } from "@/components/files/explorer/use-explorer-dnd";
import { FolderIcon, getFolderIconKind } from "@/components/files/icons";

export type SearchScope = "all" | "folder";

type AddressBarProps = {
  model: ExplorerModel;
  currentFolderId: string | null;
  canBack: boolean;
  canForward: boolean;
  canUp: boolean;
  refreshing: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onNavigate: (folderId: string | null) => void;
  query: string;
  onQueryChange: (value: string) => void;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  dnd: ExplorerDnd;
  onToggleTree: () => void;
  /** Filtro por inconsistência na pesquisa (só quem vê as inconsistências). */
  issueKinds?: Array<{ value: string; label: string }>;
  onIssueFilter?: (kind: string) => void;
};

export function ExplorerAddressBar(props: AddressBarProps) {
  const { model, currentFolderId, onNavigate, query, onQueryChange, scope, onScopeChange, searchRef, dnd } = props;
  const path = getFolderPath(model, currentFolderId);
  const [menu, setMenu] = useState<{ parentId: string | null; hidden?: boolean } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !barRef.current?.contains(event.target as Node)) {
        setMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  // Caminho longo: mostra raiz … e os 2 últimos (o resto fica no menu "…").
  const collapse = path.length > 3;
  const hiddenSegments = collapse ? path.slice(0, path.length - 2) : [];
  const visibleSegments = collapse ? path.slice(path.length - 2) : path;
  const currentLabel = path.length > 0 ? folderLabel(path[path.length - 1]) : "Arquivos";

  const menuFolders =
    menu === null
      ? []
      : menu.hidden
        ? hiddenSegments
        : getChildFolders(model, menu.parentId);

  return (
    <div className={styles.addressRow}>
      <div className={styles.navButtons}>
        <button type="button" className={`${styles.iconBtn} ${styles.mobileOnly}`} onClick={props.onToggleTree} aria-label="Pastas">
          <Icon name="menu" />
        </button>
        <button type="button" className={styles.iconBtn} onClick={props.onBack} disabled={!props.canBack} aria-label="Voltar" title="Voltar (Alt+←)">
          <Icon name="back" />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.desktopOnly}`}
          onClick={props.onForward}
          disabled={!props.canForward}
          aria-label="Avançar"
          title="Avançar (Alt+→)"
        >
          <Icon name="forward" />
        </button>
        <button type="button" className={styles.iconBtn} onClick={props.onUp} disabled={!props.canUp} aria-label="Pasta acima" title="Pasta acima (Backspace)">
          <Icon name="up" />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${props.refreshing ? styles.spinning : ""}`}
          onClick={props.onRefresh}
          aria-label="Atualizar"
          title="Atualizar"
        >
          <Icon name="refresh" />
        </button>
      </div>

      <div className={styles.address} ref={barRef} data-testid="explorer-address">
        <nav className={styles.crumbs} aria-label="Caminho">
          <button
            type="button"
            className={styles.crumb}
            onClick={() => onNavigate(null)}
            {...(currentFolderId ? {} : { "aria-current": "page" as const })}
          >
            <Icon name="home" size={14} />
            <span className={styles.desktopOnlyInline}>Arquivos</span>
          </button>
          <button
            type="button"
            className={styles.crumbSep}
            onClick={() => setMenu(menu && !menu.hidden && menu.parentId === null ? null : { parentId: null })}
            aria-label="Pastas raiz"
          >
            <Icon name="chevronRight" size={12} />
          </button>
          {collapse ? (
            <>
              <button type="button" className={styles.crumb} onClick={() => setMenu(menu?.hidden ? null : { parentId: null, hidden: true })} aria-label="Mostrar caminho completo">
                …
              </button>
              <span className={styles.crumbSepStatic}>
                <Icon name="chevronRight" size={12} />
              </span>
            </>
          ) : null}
          {visibleSegments.map((folder, position) => {
            const isLast = position === visibleSegments.length - 1;
            return (
              <span key={folder.id} className={styles.crumbGroup}>
                <button
                  type="button"
                  className={`${styles.crumb} ${dnd.dropTargetId === folder.id ? styles.dropTarget : ""}`}
                  onClick={() => onNavigate(folder.id)}
                  {...dnd.folderDropProps(folder.id)}
                  {...(isLast ? { "aria-current": "page" as const } : {})}
                  title={folderLabel(folder)}
                >
                  {folderLabel(folder)}
                </button>
                {(model.childFolderIds.get(folder.id)?.length ?? 0) > 0 ? (
                  <button
                    type="button"
                    className={styles.crumbSep}
                    onClick={() => setMenu(menu && !menu.hidden && menu.parentId === folder.id ? null : { parentId: folder.id })}
                    aria-label={`Subpastas de ${folderLabel(folder)}`}
                  >
                    <Icon name="chevronRight" size={12} />
                  </button>
                ) : null}
              </span>
            );
          })}
        </nav>
        {menu && menuFolders.length > 0 ? (
          <div className={styles.crumbMenu} role="menu">
            {menuFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setMenu(null);
                  onNavigate(folder.id);
                }}
              >
                <FolderIcon kind={getFolderIconKind(folder)} size={15} />
                <span>{folderLabel(folder)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <label className={styles.search}>
        <Icon name="search" size={15} />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onQueryChange("");
              event.currentTarget.blur();
            }
          }}
          placeholder={scope === "folder" && currentFolderId ? `Pesquisar em ${currentLabel}` : "Pesquisar pastas e arquivos"}
          aria-label="Pesquisar"
          data-testid="explorer-search"
        />
        {props.issueKinds && props.onIssueFilter ? (
          <span className={styles.issueFilterBtn} title="Filtrar por inconsistência">
            <Icon name="filter" size={14} />
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) props.onIssueFilter?.(event.target.value);
              }}
              aria-label="Filtrar por inconsistência"
              data-testid="explorer-issue-filter"
            >
              <option value="">Filtrar por inconsistência…</option>
              <option value="all">Todas as inconsistências</option>
              {props.issueKinds.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </span>
        ) : null}
        {currentFolderId ? (
          <button
            type="button"
            className={styles.scopeChip}
            onClick={() => onScopeChange(scope === "all" ? "folder" : "all")}
            title="Escopo da pesquisa"
          >
            {scope === "all" ? "Tudo" : "Nesta pasta"}
          </button>
        ) : null}
      </label>
    </div>
  );
}

/** Cabeçalho exibido enquanto o índice carrega: já no último caminho aberto. */
export function AddressSkeleton({ path }: { path: Array<{ id: string; label: string }> }) {
  return (
    <div className={styles.addressRow} data-testid="explorer-address-skeleton">
      <div className={styles.navButtons}>
        {(["back", "forward", "up", "refresh"] as const).map((name) => (
          <button key={name} type="button" className={styles.iconBtn} disabled aria-hidden="true">
            <Icon name={name} />
          </button>
        ))}
      </div>
      <div className={styles.address}>
        <nav className={styles.crumbs} aria-label="Caminho">
          <span className={styles.crumb}>
            <Icon name="home" size={14} />
            <span className={styles.desktopOnlyInline}>Arquivos</span>
          </span>
          {path.map((segment) => (
            <span key={segment.id} className={styles.crumbGroup}>
              <span className={styles.crumbSepStatic}>
                <Icon name="chevronRight" size={12} />
              </span>
              <span className={styles.crumb}>{segment.label}</span>
            </span>
          ))}
        </nav>
      </div>
      <label className={styles.search}>
        <Icon name="search" size={15} />
        <input type="search" disabled placeholder="Carregando…" aria-label="Pesquisar" />
      </label>
    </div>
  );
}
