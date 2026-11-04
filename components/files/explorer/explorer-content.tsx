"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import type { ViewMode } from "@/components/files/explorer/explorer-command-bar";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { FileThumb, FolderThumb, type ThumbSize } from "@/components/files/explorer/explorer-thumb";
import {
  entryTypeLabel,
  findHighlightRange,
  type EntryKey,
  type ExplorerEntry,
  type SortDirection,
  type SortKey
} from "@/components/files/explorer/model";
import type { ExplorerDnd } from "@/components/files/explorer/use-explorer-dnd";
import type { UploadItem } from "@/components/files/explorer/use-upload-queue";
import { FileKindIcon } from "@/components/files/icons";
import { formatBytes, getFilePreviewKind } from "@/lib/files/shared";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function formatExplorerDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

export type SearchLocation = { label: string; folderId: string | null };

type ContentProps = {
  entries: ExplorerEntry[];
  viewMode: ViewMode;
  selected: ReadonlySet<EntryKey>;
  focusKey: EntryKey | null;
  cutKeys: ReadonlySet<EntryKey>;
  renamingKey: EntryKey | null;
  pendingFolderName: string | null;
  uploads: UploadItem[];
  coverFileId: string | null;
  locations: Map<EntryKey, SearchLocation> | null;
  query: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  canManage: boolean;
  dnd: ExplorerDnd;
  contentRef: RefObject<HTMLDivElement | null>;
  emptyState: ReactNode;
  onSortHeader: (key: SortKey) => void;
  onEntryClick: (entry: ExplorerEntry, event: MouseEvent) => void;
  onEntryOpen: (entry: ExplorerEntry) => void;
  onEntryContextMenu: (entry: ExplorerEntry, event: MouseEvent) => void;
  onToggleCheck: (entry: ExplorerEntry) => void;
  onBackgroundClick: () => void;
  onBackgroundContextMenu: (event: MouseEvent) => void;
  onRenameSubmit: (entry: ExplorerEntry, name: string) => void;
  onRenameCancel: () => void;
  onPendingFolderSubmit: (name: string) => void;
  onPendingFolderCancel: () => void;
  onOpenLocation: (folderId: string | null) => void;
  onMoveFocus: (delta: number, extend: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

function Highlight({ text, query }: { text: string; query: string }) {
  const range = query ? findHighlightRange(text, query) : null;
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className={styles.mark}>{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

/** Edição inline (F2 / Nova pasta): Enter confirma, Esc cancela, sair do campo confirma. */
function InlineNameInput({
  initial,
  selectBaseName,
  submitUnchanged = false,
  onSubmit,
  onCancel
}: {
  initial: string;
  selectBaseName: boolean;
  submitUnchanged?: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const dot = initial.lastIndexOf(".");
    input.setSelectionRange(0, selectBaseName && dot > 0 ? dot : initial.length);
  }, [initial, selectBaseName]);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const value = ref.current?.value.trim() ?? "";
    if (commit && value && (value !== initial || submitUnchanged)) onSubmit(value);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      className={styles.renameInput}
      defaultValue={initial}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      aria-label="Nome"
      data-testid="explorer-rename-input"
    />
  );
}

const THUMB_BY_VIEW: Record<ViewMode, ThumbSize> = { details: "sm", list: "sm", tiles: "md", large: "lg" };

export function ExplorerContent(props: ContentProps) {
  const { entries, viewMode, selected, focusKey, dnd, contentRef } = props;
  const thumbSize = THUMB_BY_VIEW[viewMode];
  const isGrid = viewMode === "tiles" || viewMode === "large";

  useEffect(() => {
    if (!focusKey) return;
    const element = contentRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [contentRef, focusKey]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const vertical = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const horizontal = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if ((vertical || horizontal) && !event.altKey) {
      event.preventDefault();
      if (isGrid) {
        const container = contentRef.current?.querySelector<HTMLElement>("[data-grid]");
        const first = container?.querySelector<HTMLElement>("[data-key]");
        const columns = container && first ? Math.max(1, Math.round(container.clientWidth / first.offsetWidth)) : 1;
        props.onMoveFocus(horizontal || vertical * columns, event.shiftKey);
      } else {
        props.onMoveFocus(vertical || horizontal, event.shiftKey);
      }
      return;
    }
    props.onKeyDown(event);
  };

  const renderName = (entry: ExplorerEntry) =>
    props.renamingKey === entry.key ? (
      <InlineNameInput
        initial={entry.kind === "folder" ? entry.folder.name : entry.name}
        selectBaseName={entry.kind === "file"}
        onSubmit={(name) => props.onRenameSubmit(entry, name)}
        onCancel={props.onRenameCancel}
      />
    ) : (
      <span className={styles.entryName} title={entry.name}>
        <Highlight text={entry.name} query={props.query} />
      </span>
    );

  const entryProps = (entry: ExplorerEntry) => {
    const isSelected = selected.has(entry.key);
    const drag = dnd.entryDragProps(entry);
    const drop =
      entry.kind === "folder" ? dnd.folderDropProps(entry.id) : props.locations ? {} : dnd.fileReorderProps(entry.id);
    const className = [
      styles.entry,
      isSelected ? styles.entrySelected : "",
      focusKey === entry.key ? styles.entryFocused : "",
      props.cutKeys.has(entry.key) ? styles.entryCut : "",
      entry.kind === "folder" && dnd.dropTargetId === entry.id ? styles.dropTarget : "",
      entry.kind === "file" && dnd.reorderTargetId === entry.id ? styles.reorderTarget : ""
    ]
      .filter(Boolean)
      .join(" ");

    return {
      "data-key": entry.key,
      className,
      role: "option" as const,
      "aria-selected": isSelected,
      onClick: (event: MouseEvent) => {
        event.stopPropagation();
        props.onEntryClick(entry, event);
      },
      onDoubleClick: (event: MouseEvent) => {
        event.stopPropagation();
        props.onEntryOpen(entry);
      },
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        props.onEntryContextMenu(entry, event);
      },
      ...drag,
      ...drop
    };
  };

  const check = (entry: ExplorerEntry) => (
    <span
      role="checkbox"
      aria-checked={selected.has(entry.key)}
      aria-label={`Selecionar ${entry.name}`}
      className={styles.check}
      onClick={(event) => {
        event.stopPropagation();
        props.onToggleCheck(entry);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {selected.has(entry.key) ? <Icon name="check" size={12} /> : null}
    </span>
  );

  const thumb = (entry: ExplorerEntry) =>
    entry.kind === "folder" ? (
      <FolderThumb folder={entry.folder} size={thumbSize} />
    ) : (
      <FileThumb file={entry.file} size={thumbSize} isCover={props.coverFileId === entry.id} />
    );

  // Detalhes: ícone+nome dividem a coluna "Nome"; ícones: miniatura em cima, nome embaixo.
  const nameCell = (thumbNode: ReactNode, nameNode: ReactNode) =>
    viewMode === "details" ? (
      <span className={styles.colName}>
        {thumbNode}
        {nameNode}
      </span>
    ) : (
      <>
        {thumbNode}
        <span className={styles.entryText}>{nameNode}</span>
      </>
    );

  const pendingFolderRow =
    props.pendingFolderName !== null ? (
      <div className={`${styles.entry} ${styles.entrySelected}`} data-testid="explorer-new-folder">
        {viewMode === "details" ? <span className={styles.check} /> : null}
        {nameCell(
          <div className={`${styles.thumb} ${styles[`thumb_${thumbSize}`]} ${styles.thumbFolder}`}>
            <Icon name="folderPlus" size={thumbSize === "sm" ? 16 : 36} />
          </div>,
          <InlineNameInput
            initial={props.pendingFolderName}
            selectBaseName={false}
            submitUnchanged
            onSubmit={props.onPendingFolderSubmit}
            onCancel={props.onPendingFolderCancel}
          />
        )}
      </div>
    ) : null;

  const uploadRows = props.uploads.map((item) => (
    <div key={item.id} className={`${styles.entry} ${styles.entryGhost}`} data-status={item.status}>
      {viewMode === "details" ? <span className={styles.check} /> : null}
      {nameCell(
        <div className={`${styles.thumb} ${styles[`thumb_${thumbSize}`]}`}>
          <FileKindIcon kind={getFilePreviewKind(item.mimeType, item.name)} size={thumbSize === "sm" ? 18 : 36} />
        </div>,
        <span className={styles.entryName} title={item.error ?? item.name}>
          {item.name}
        </span>
      )}
      <span className={styles.uploadBar} aria-label={`${Math.round(item.progress * 100)}%`}>
        <span style={{ width: `${Math.round((item.status === "done" ? 1 : item.progress) * 100)}%` }} />
      </span>
      <span className={styles.uploadState}>
        {item.status === "failed" ? item.error ?? "Falhou" : item.status === "done" ? "Enviado" : item.status === "finalizing" ? "Registrando…" : item.status === "queued" ? "Na fila" : `${Math.round(item.progress * 100)}%`}
      </span>
    </div>
  ));

  const isEmpty = entries.length === 0 && props.pendingFolderName === null && props.uploads.length === 0;

  const sortHeader = (key: SortKey, label: string, className: string) => (
    <button
      type="button"
      className={`${styles.colHead} ${className}`}
      onClick={() => props.onSortHeader(key)}
      aria-pressed={props.sortKey === key}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}
      {props.sortKey === key ? <Icon name={props.sortDirection === "asc" ? "chevronDown" : "up"} size={11} /> : null}
    </button>
  );

  return (
    <div
      ref={contentRef}
      className={`${styles.content} ${dnd.surfaceActive ? styles.contentDrop : ""}`}
      tabIndex={0}
      role="listbox"
      aria-multiselectable="true"
      aria-label="Itens da pasta"
      data-view={viewMode}
      data-testid="explorer-content"
      onKeyDown={handleKeyDown}
      onClick={props.onBackgroundClick}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onBackgroundContextMenu(event);
      }}
      {...dnd.surfaceDropProps}
    >
      {viewMode === "details" ? (
        <div className={`${styles.details} ${props.locations ? styles.detailsSearch : ""}`}>
          <div className={styles.detailsHead} role="presentation">
            <span />
            {sortHeader("name", "Nome", styles.colName)}
            {props.locations ? <span className={`${styles.colHead} ${styles.colLocation}`}>Local</span> : null}
            {sortHeader("modified", "Data de modificação", styles.colDate)}
            {sortHeader("type", "Tipo", styles.colType)}
            {sortHeader("size", "Tamanho", styles.colSize)}
          </div>
          {pendingFolderRow}
          {entries.map((entry) => {
            const location = props.locations?.get(entry.key);
            return (
              <div key={entry.key} {...entryProps(entry)}>
                {check(entry)}
                <span className={styles.colName}>
                  {thumb(entry)}
                  {renderName(entry)}
                  {entry.kind === "file" && props.coverFileId === entry.id ? <span className={styles.tag}>Capa</span> : null}
                </span>
                {props.locations ? (
                  <button
                    type="button"
                    className={`${styles.colLocation} ${styles.locationLink}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onOpenLocation(location?.folderId ?? null);
                    }}
                    title={location?.label || "Arquivos"}
                  >
                    {location?.label || "Arquivos"}
                  </button>
                ) : null}
                <span className={styles.colDate}>{formatExplorerDate(entry.modifiedAt)}</span>
                <span className={styles.colType}>{entryTypeLabel(entry)}</span>
                <span className={styles.colSize}>
                  {entry.kind === "file" ? formatBytes(entry.sizeBytes) : `${entry.itemCount} ${entry.itemCount === 1 ? "item" : "itens"}`}
                </span>
              </div>
            );
          })}
          {uploadRows}
        </div>
      ) : (
        <div className={viewMode === "list" ? styles.list : `${styles.grid} ${viewMode === "large" ? styles.gridLarge : ""}`} data-grid={isGrid || undefined}>
          {pendingFolderRow}
          {entries.map((entry) => (
            <div key={entry.key} {...entryProps(entry)} title={props.locations?.get(entry.key)?.label ?? undefined}>
              {check(entry)}
              {nameCell(
                thumb(entry),
                <>
                  {renderName(entry)}
                  {viewMode === "large" ? (
                    <span className={styles.entrySub}>
                      {entry.kind === "file" ? formatBytes(entry.sizeBytes) : `${entry.itemCount} ${entry.itemCount === 1 ? "item" : "itens"}`}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          ))}
          {uploadRows}
        </div>
      )}
      {isEmpty ? <div className={styles.empty}>{props.emptyState}</div> : null}
      {dnd.surfaceActive ? <div className={styles.dropOverlay}>Solte para enviar</div> : null}
    </div>
  );
}
