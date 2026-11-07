"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/files/explorer/explorer-icons";
import type { SheetConfig, SheetKey } from "@/components/ui-grid/types";
import styles from "@/components/ui-grid/tables-drawer.module.css";

type TableInsight = { pendingActionCount?: number; missingDataCount?: number; hasPendingAction?: boolean };

/**
 * Gaveta de tabelas no desenho da árvore da aba Arquivos: uma linha por tabela
 * (nome, avisos, cadeado se for só leitura), filtro por nome e a descrição como
 * dica — no lugar dos cartões com texto e selo RW/RO em cada um.
 */
export function TablesDrawer(props: {
  open: boolean;
  onClose: () => void;
  groups: Array<[string, SheetConfig[]]>;
  activeKey: SheetKey;
  onSelect: (key: SheetKey) => void;
  insights: Partial<Record<SheetKey, TableInsight>>;
  isReadOnly: (sheet: SheetConfig) => boolean;
}) {
  const { open, onClose } = props;
  const [filter, setFilter] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Portal no body: dentro do layout a gaveta ficava presa no contexto de
  // empilhamento dele e o topo sumia atras do cabecalho do app.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Só no desktop: no celular o foco abriria o teclado por cima da lista.
    if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return props.groups;
    return props.groups
      .map(([name, sheets]) => [name, sheets.filter((sheet) => `${sheet.label} ${sheet.key} ${sheet.description ?? ""}`.toLowerCase().includes(term))] as [string, SheetConfig[]])
      .filter(([, sheets]) => sheets.length > 0);
  }, [filter, props.groups]);

  if (!mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`${styles.backdrop} ${open ? `${styles.backdropOpen} is-open` : ""}`}
        aria-label="Fechar navegacao de tabelas"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        data-testid="sheet-sidebar-backdrop"
      />
      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} id="sheet-sidebar" data-testid="sheet-sidebar" aria-hidden={!open}>
        <div className={styles.head}>
          <strong>Tabelas</strong>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar" title="Fechar (Esc)" data-testid="sidebar-close">
            <Icon name="close" />
          </button>
        </div>
        <label className={styles.search}>
          <Icon name="search" size={14} />
          <input
            ref={searchRef}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtrar tabelas…"
            aria-label="Filtrar tabelas"
            data-testid="sidebar-search"
            tabIndex={open ? 0 : -1}
          />
        </label>
        <nav className={styles.nav} aria-label="Planilhas">
          {groups.length === 0 ? <p className={styles.empty}>Nenhuma tabela com esse nome.</p> : null}
          {groups.map(([groupName, sheets]) => (
            <section key={groupName} className={styles.group}>
              <h2 className={styles.groupTitle}>{groupName}</h2>
              {sheets.map((sheet) => {
                const insight = props.insights[sheet.key];
                const count = (insight?.pendingActionCount ?? 0) + (insight?.missingDataCount ?? 0);
                const readOnly = props.isReadOnly(sheet);
                return (
                  <button
                    key={sheet.key}
                    type="button"
                    className={`${styles.row} ${sheet.key === props.activeKey ? styles.rowActive : ""}`}
                    onClick={() => {
                      props.onSelect(sheet.key);
                      onClose();
                    }}
                    title={sheet.description ?? undefined}
                    aria-current={sheet.key === props.activeKey ? "page" : undefined}
                    tabIndex={open ? 0 : -1}
                    data-testid={`sheet-tab-${sheet.key}`}
                  >
                    <span className={styles.name}>{sheet.label}</span>
                    {insight?.hasPendingAction && count > 0 ? (
                      <span className={styles.count} title={`${count} aviso(s) nesta tabela`} aria-label={`${count} aviso(s) nesta tabela`}>
                        {count}
                      </span>
                    ) : null}
                    {readOnly ? (
                      <span className={styles.lock} title="Somente leitura" aria-label="Somente leitura">
                        <Icon name="lock" size={13} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>
    </>,
    document.body
  );
}
