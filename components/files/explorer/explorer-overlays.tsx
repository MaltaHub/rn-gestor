"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "@/components/files/explorer/explorer.module.css";
import { FilePreview } from "@/components/files/explorer/explorer-details-pane";
import { Icon, type ExplorerIconName } from "@/components/files/explorer/explorer-icons";
import { isFolderLocked } from "@/components/files/explorer/folder-rules";
import {
  folderLabel,
  getFolderPathLabel,
  isSameOrDescendant,
  normalizeSearchText,
  type ExplorerModel
} from "@/components/files/explorer/model";
import { signedUrlStore } from "@/components/files/explorer/signed-url-store";
import { FolderIcon, getFolderIconKind } from "@/components/files/icons";
import type { ExplorerFile } from "@/lib/files/explorer-types";
import { formatBytes } from "@/lib/files/shared";

// ------------------------------------------------------------ menu de contexto

export type MenuItem =
  | { type: "separator" }
  | {
      type?: "item";
      label: string;
      icon?: ExplorerIconName;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8))
    });
  }, [x, y]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className={styles.contextMenu} style={position} role="menu" data-testid="explorer-context-menu" onContextMenu={(event) => event.preventDefault()}>
      {items.map((item, position) =>
        item.type === "separator" ? (
          <div key={`sep-${position}`} className={styles.menuSep} />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${item.danger ? styles.dangerText : ""}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className={styles.menuCheck}>{item.icon ? <Icon name={item.icon} size={15} /> : null}</span>
            <span className={styles.menuLabel}>{item.label}</span>
            {item.shortcut ? <kbd className={styles.kbd}>{item.shortcut}</kbd> : null}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

// ------------------------------------------------------------------ diálogo

export function Dialog({
  title,
  children,
  footer,
  onClose,
  wide = false,
  testId
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`${styles.dialog} ${wide ? styles.dialogWide : ""}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className={styles.dialogHead}>
          <strong>{title}</strong>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className={styles.dialogBody}>{children}</div>
        {footer ? <div className={styles.dialogFoot}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      testId="explorer-confirm"
      footer={
        <>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? styles.dangerBtn : styles.primaryBtn}
            onClick={() => {
              onClose();
              onConfirm();
            }}
            data-testid="explorer-confirm-ok"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className={styles.dialogText}>{message}</div>
    </Dialog>
  );
}

// ------------------------------------------------------ escolher pasta destino

export function MoveDialog({
  model,
  movingFolderIds,
  initialFolderId,
  title,
  onConfirm,
  onClose
}: {
  model: ExplorerModel;
  movingFolderIds: string[];
  initialFolderId: string | null;
  title: string;
  onConfirm: (folderId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(initialFolderId);

  const options = useMemo(() => {
    const normalized = normalizeSearchText(query);
    return Array.from(model.foldersById.values())
      .filter((folder) => !movingFolderIds.some((id) => isSameOrDescendant(model, id, folder.id)))
      .map((folder) => ({ folder, path: getFolderPathLabel(model, folder.id) }))
      .filter(({ path, folder }) => !normalized || normalizeSearchText(`${path} ${folder.name}`).includes(normalized))
      .sort((left, right) => left.path.localeCompare(right.path, "pt-BR", { numeric: true }))
      .slice(0, 200);
  }, [model, movingFolderIds, query]);

  return (
    <Dialog
      title={title}
      onClose={onClose}
      testId="explorer-move-dialog"
      footer={
        <>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!target}
            onClick={() => {
              if (!target) return;
              onClose();
              onConfirm(target);
            }}
          >
            Mover aqui
          </button>
        </>
      }
    >
      <label className={styles.search}>
        <Icon name="search" size={15} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar pastas" />
      </label>
      <div className={styles.pickList} role="listbox">
        {options.map(({ folder, path }) => (
          <button
            key={folder.id}
            type="button"
            role="option"
            aria-selected={target === folder.id}
            className={`${styles.pickItem} ${target === folder.id ? styles.pickItemActive : ""}`}
            onClick={() => setTarget(folder.id)}
            onDoubleClick={() => {
              onClose();
              onConfirm(folder.id);
            }}
          >
            <FolderIcon kind={getFolderIconKind(folder)} size={15} />
            <span className={styles.pickPath}>{path}</span>
            {isFolderLocked(folder) ? <span className={styles.tag}>auto</span> : null}
          </button>
        ))}
        {options.length === 0 ? <p className={styles.paneHint}>Nenhuma pasta encontrada.</p> : null}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------- visualizador

export function FileViewer({
  files,
  startIndex,
  onClose,
  onDownload
}: {
  files: ExplorerFile[];
  startIndex: number;
  onClose: () => void;
  onDownload: (file: ExplorerFile) => void;
}) {
  const [position, setPosition] = useState(startIndex);
  const file = files[position];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setPosition((value) => Math.min(files.length - 1, value + 1));
      if (event.key === "ArrowLeft") setPosition((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length, onClose]);

  // Pré-carrega as imagens vizinhas: avançar/voltar fica instantâneo.
  useEffect(() => {
    const neighbors = [files[position - 1], files[position + 1]].filter(
      (entry): entry is ExplorerFile => Boolean(entry) && entry.mimeType.startsWith("image/")
    );
    if (neighbors.length === 0) return;
    void signedUrlStore.ensure(neighbors.map((entry) => entry.id), "original").then(() => {
      for (const neighbor of neighbors) {
        const url = signedUrlStore.get(neighbor.id, "original")?.url;
        if (url) new window.Image().src = url;
      }
    });
  }, [files, position]);

  if (!file || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={file.name} data-testid="explorer-viewer">
      <div className={styles.viewerBar}>
        <span className={styles.viewerTitle} title={file.name}>
          {file.name}
        </span>
        <span className={styles.viewerMeta}>
          {position + 1} de {files.length} · {formatBytes(file.sizeBytes)}
        </span>
        <button type="button" className={styles.viewerBtn} onClick={() => onDownload(file)} aria-label="Baixar">
          <Icon name="download" />
        </button>
        <button type="button" className={styles.viewerBtn} onClick={onClose} aria-label="Fechar (Esc)">
          <Icon name="close" />
        </button>
      </div>
      <div className={styles.viewerStage} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <button
          type="button"
          className={`${styles.viewerNav} ${styles.viewerPrev}`}
          onClick={() => setPosition((value) => Math.max(0, value - 1))}
          disabled={position === 0}
          aria-label="Anterior"
        >
          <Icon name="back" size={22} />
        </button>
        <FilePreview key={file.id} file={file} variant="viewer" />
        <button
          type="button"
          className={`${styles.viewerNav} ${styles.viewerNext}`}
          onClick={() => setPosition((value) => Math.min(files.length - 1, value + 1))}
          disabled={position === files.length - 1}
          aria-label="Próximo"
        >
          <Icon name="forward" size={22} />
        </button>
      </div>
    </div>,
    document.body
  );
}

export function folderDisplay(model: ExplorerModel, folderId: string | null) {
  return folderId ? folderLabel(model.foldersById.get(folderId)) : "Arquivos";
}
