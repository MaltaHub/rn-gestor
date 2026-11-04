"use client";

import { memo, type CSSProperties } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { folderLabel, type ExplorerModel } from "@/components/files/explorer/model";
import type { ExplorerDnd } from "@/components/files/explorer/use-explorer-dnd";
import { FolderIcon, getFolderIconKind } from "@/components/files/icons";

type TreeProps = {
  model: ExplorerModel;
  currentFolderId: string | null;
  expanded: ReadonlySet<string>;
  dnd: ExplorerDnd;
  onToggle: (folderId: string) => void;
  onNavigate: (folderId: string | null) => void;
  onContextMenu: (folderId: string, x: number, y: number) => void;
};

/** Painel de navegação: só os nós expandidos são renderizados. */
export const ExplorerTree = memo(function ExplorerTree(props: TreeProps) {
  const { model, currentFolderId, onNavigate } = props;
  const roots = model.childFolderIds.get(null) ?? [];

  return (
    <nav className={styles.tree} aria-label="Pastas">
      <button
        type="button"
        className={`${styles.treeRow} ${currentFolderId === null ? styles.treeRowActive : ""}`}
        style={{ "--depth": 0 } as CSSProperties}
        onClick={() => onNavigate(null)}
      >
        <span className={styles.treeCaret} aria-hidden="true" />
        <Icon name="home" size={16} className={styles.treeIcon} />
        <span className={styles.treeLabel}>Arquivos</span>
      </button>
      <div role="tree">
        {roots.map((id) => (
          <TreeNode key={id} {...props} folderId={id} depth={1} />
        ))}
      </div>
    </nav>
  );
});

function TreeNode(props: TreeProps & { folderId: string; depth: number }) {
  const { model, folderId, depth, expanded, currentFolderId, dnd, onToggle, onNavigate, onContextMenu } = props;
  const folder = model.foldersById.get(folderId);
  if (!folder) return null;
  const children = model.childFolderIds.get(folderId) ?? [];
  const isOpen = expanded.has(folderId);
  const isActive = currentFolderId === folderId;
  const isDrop = dnd.dropTargetId === folderId;
  const label = folderLabel(folder);

  return (
    <div role="treeitem" aria-expanded={children.length > 0 ? isOpen : undefined} aria-selected={isActive}>
      <div
        className={`${styles.treeRow} ${isActive ? styles.treeRowActive : ""} ${isDrop ? styles.dropTarget : ""}`}
        style={{ "--depth": depth } as CSSProperties}
        {...dnd.folderDropProps(folderId)}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(folderId, event.clientX, event.clientY);
        }}
      >
        <button
          type="button"
          className={styles.treeCaret}
          onClick={() => onToggle(folderId)}
          tabIndex={-1}
          aria-label={isOpen ? `Recolher ${label}` : `Expandir ${label}`}
          disabled={children.length === 0}
        >
          {children.length > 0 ? <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={12} /> : null}
        </button>
        <button
          type="button"
          className={styles.treeMain}
          onClick={() => onNavigate(folderId)}
          onDoubleClick={() => children.length > 0 && onToggle(folderId)}
          title={label}
        >
          <FolderIcon kind={getFolderIconKind(folder)} size={16} className={styles.treeIcon} />
          <span className={styles.treeLabel}>{label}</span>
        </button>
      </div>
      {isOpen && children.length > 0 ? (
        <div role="group">
          {children.map((id) => (
            <TreeNode key={id} {...props} folderId={id} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
