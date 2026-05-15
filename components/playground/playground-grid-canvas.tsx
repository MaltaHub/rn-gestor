"use client";

import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import {
  cellKey,
  columnLabel,
  computePrintPageBreakOffsets,
  getCell,
  getColumnWidth,
  getPrintBodyHeight,
  getRowHeight,
  isCellSelected,
  normalizeSelection,
  PLAYGROUND_DEFAULT_COLUMN_WIDTH,
  PLAYGROUND_PRINT_PAGE_WIDTH_PX,
  PLAYGROUND_ROW_HEADER_WIDTH
} from "@/components/playground/grid-utils";
import type { PlaygroundFeedDataRecord, PlaygroundFeedDataTarget } from "@/components/playground/domain/feed-data";
import { getFeedTargetGridSize } from "@/components/playground/domain/feed-placement";
import type { AreaResizePlan } from "@/components/playground/domain/playground-area";
import { usePlaygroundDrag } from "@/components/playground/hooks/use-playground-drag";
import type { GridPosition, PlaygroundMode, PlaygroundPage, PlaygroundSelection } from "@/components/playground/types";

const PLAYGROUND_COLUMN_HEADER_HEIGHT = 40;
const PLAYGROUND_FEED_HEADER_HEIGHT = 32;
const PLAYGROUND_VIRTUAL_OVERSCAN = 4;

type CellCoords = {
  row: number;
  col: number;
};

type Track = {
  index: number;
  start: number;
  size: number;
  end: number;
};

type Viewport = {
  scrollLeft: number;
  scrollTop: number;
  width: number;
  height: number;
};

type PlaygroundGridCanvasProps = {
  page: PlaygroundPage;
  mode: PlaygroundMode;
  scrollRef: RefObject<HTMLDivElement | null>;
  selection: PlaygroundSelection | null;
  activeCell: CellCoords | null;
  editingCell: CellCoords | null;
  editingValue: string;
  feedTargets: PlaygroundFeedDataTarget[];
  feedRecordsByTargetId: Record<string, PlaygroundFeedDataRecord>;
  tableLabelByKey: Record<string, string>;
  showGridLines: boolean;
  areaResizePreviewPlan?: AreaResizePlan | null;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onSelectWholeSheet: () => void;
  onSelectColumn: (col: number) => void;
  onSelectRow: (row: number) => void;
  onColumnResizeStart: (col: number, pointerX: number) => void;
  onRowResizeStart: (row: number, pointerY: number) => void;
  onColumnAutoFit: (col: number) => void;
  onRowAutoFit: (row: number) => void;
  onCellPointerDown: (event: ReactMouseEvent<HTMLElement>, row: number, col: number) => void;
  onCellPointerEnter: (row: number, col: number) => void;
  onCellDoubleClick: (row: number, col: number) => void;
  onCellClick: (row: number, col: number) => void;
  onEditingValueChange: (value: string) => void;
  onCommitCellEdit: () => void;
  onCancelCellEdit: () => void;
  onEditFeed: (feedId: string) => void;
  onRefreshFeed: (feedId: string) => void;
  onFragmentFeed: (feedId: string) => void;
  onRemoveFragment: (fragmentId: string) => void;
  onOpenFeedActiveFilters: (targetId: string) => void;
  onChangeFeedPage: (targetId: string, page: number) => void;
  onMoveFeedTarget: (targetId: string, position: GridPosition) => void;
  onToggleFeedColumnSort: (targetId: string, column: string, withChain: boolean) => void;
  onOpenFeedColumnFilter: (targetId: string, column: string, rect: DOMRect) => void;
};

type VisibleFeedBlock = {
  target: PlaygroundFeedDataTarget;
  record?: PlaygroundFeedDataRecord;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

type FeedAreaSizing = {
  height: number;
  width: number;
};

type FeedHeaderCell = {
  target: PlaygroundFeedDataTarget;
  column: string;
  displayOverride?: string;
  sortIndex: number;
  sortDir: "asc" | "desc" | null;
  filterActive: boolean;
  filterLocked: boolean;
};

type PixelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function buildTracks(params: {
  count: number;
  hidden: Record<string, boolean>;
  getSize: (index: number) => number;
}) {
  const tracks: Track[] = [];
  let offset = 0;

  for (let index = 0; index < params.count; index += 1) {
    if (params.hidden[String(index)] === true) continue;

    const size = params.getSize(index);
    tracks.push({
      index,
      start: offset,
      size,
      end: offset + size
    });
    offset += size;
  }

  return {
    tracks,
    totalSize: offset,
    byIndex: new Map(tracks.map((track) => [track.index, track]))
  };
}

function getVisibleTracks(tracks: Track[], start: number, end: number) {
  const paddedStart = Math.max(0, start);
  const paddedEnd = Math.max(paddedStart, end);
  const first = tracks.findIndex((track) => track.end >= paddedStart);
  if (first === -1) return [];

  let last = first;
  while (last < tracks.length && tracks[last].start <= paddedEnd) {
    last += 1;
  }

  return tracks.slice(Math.max(0, first - PLAYGROUND_VIRTUAL_OVERSCAN), Math.min(tracks.length, last + PLAYGROUND_VIRTUAL_OVERSCAN));
}

function isRowSelectionActive(selection: PlaygroundSelection | null, page: PlaygroundPage, row: number) {
  if (!selection) return false;
  const normalized = normalizeSelection(selection);

  return (
    normalized.startCol === 0 &&
    normalized.endCol === page.colCount - 1 &&
    row >= normalized.startRow &&
    row <= normalized.endRow
  );
}

function isColumnSelectionActive(selection: PlaygroundSelection | null, page: PlaygroundPage, col: number) {
  if (!selection) return false;
  const normalized = normalizeSelection(selection);

  return (
    normalized.startRow === 0 &&
    normalized.endRow === page.rowCount - 1 &&
    col >= normalized.startCol &&
    col <= normalized.endCol
  );
}

function isWholeSheetSelected(selection: PlaygroundSelection | null, page: PlaygroundPage) {
  if (!selection) return false;
  const normalized = normalizeSelection(selection);
  return normalized.startRow === 0 && normalized.startCol === 0 && normalized.endRow === page.rowCount - 1 && normalized.endCol === page.colCount - 1;
}

function intersectsViewport(rect: { left: number; top: number; width: number; height: number }, viewport: Viewport) {
  return (
    rect.left + rect.width >= viewport.scrollLeft &&
    rect.left <= viewport.scrollLeft + viewport.width &&
    rect.top + rect.height >= viewport.scrollTop &&
    rect.top <= viewport.scrollTop + viewport.height
  );
}

function sumValues(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function getFeedAreaGridSize(target: PlaygroundFeedDataTarget, record?: PlaygroundFeedDataRecord) {
  const fallback = getFeedTargetGridSize(target);
  const loadedRows = record?.rows.length ?? 0;

  return {
    rowSpan: loadedRows > 0 || record?.status === "ready" ? Math.max(1, loadedRows + 1) : fallback.rowSpan,
    colSpan: Math.max(1, target.columns.length)
  };
}

function getFeedAreaSizing(params: {
  page: PlaygroundPage;
  target: PlaygroundFeedDataTarget;
  record?: PlaygroundFeedDataRecord;
}) {
  const gridSize = getFeedAreaGridSize(params.target, params.record);
  const columnWidths = params.target.columns.map((_column, offset) =>
    getColumnWidth(params.page, params.target.position.col + offset)
  );
  const rowHeights = Array.from({ length: gridSize.rowSpan }, (_value, offset) =>
    getRowHeight(params.page, params.target.position.row + offset)
  );
  const width = Math.max(PLAYGROUND_DEFAULT_COLUMN_WIDTH, sumValues(columnWidths));

  return {
    height: sumValues(rowHeights),
    width
  } satisfies FeedAreaSizing;
}

function getFeedBlockEstimate(sizing: FeedAreaSizing) {
  return sizing.height;
}

function getGridRectPixels(params: {
  page: PlaygroundPage;
  rowMetrics: ReturnType<typeof buildTracks>;
  columnMetrics: ReturnType<typeof buildTracks>;
  rect: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
  };
}): PixelRect | null {
  const rowTrack = params.rowMetrics.byIndex.get(params.rect.row);
  const columnTrack = params.columnMetrics.byIndex.get(params.rect.col);
  if (!rowTrack || !columnTrack) return null;

  const width = Array.from({ length: params.rect.colSpan }, (_value, offset) =>
    getColumnWidth(params.page, params.rect.col + offset)
  ).reduce((total, value) => total + value, 0);
  const height = Array.from({ length: params.rect.rowSpan }, (_value, offset) =>
    getRowHeight(params.page, params.rect.row + offset)
  ).reduce((total, value) => total + value, 0);

  return {
    left: PLAYGROUND_ROW_HEADER_WIDTH + columnTrack.start,
    top: PLAYGROUND_COLUMN_HEADER_HEIGHT + rowTrack.start,
    width,
    height
  };
}

function findFeedHeaderCell(
  targets: PlaygroundFeedDataTarget[],
  recordsByTargetId: Record<string, PlaygroundFeedDataRecord>,
  row: number,
  col: number
): FeedHeaderCell | null {
  for (const target of targets) {
    if (target.hideColumnHeader) continue;
    if (row !== target.position.row) continue;

    const gridSize = getFeedAreaGridSize(target, recordsByTargetId[target.id]);
    const columnOffset = col - target.position.col;
    if (columnOffset < 0 || columnOffset >= gridSize.colSpan) continue;

    const column = target.columns[columnOffset];
    if (!column) continue;

    const sortIndex = target.query.sort.findIndex((rule) => rule.column === column);
    const sortDir = sortIndex >= 0 ? target.query.sort[sortIndex].dir : null;

    return {
      target,
      column,
      displayOverride: target.displayColumnOverrides[column],
      sortIndex,
      sortDir,
      filterActive: (target.query.filters[column] ?? "").trim().length > 0,
      filterLocked: target.lockedFilterColumns.includes(column)
    };
  }

  return null;
}

function clampFeedPage(page: number, totalPages: number) {
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.min(Math.max(1, totalPages), Math.round(page)));
}

function parseFeedPageDraft(value: string, totalPages: number) {
  const [pageRaw] = value.split("/");
  return clampFeedPage(Number(pageRaw.trim()), totalPages);
}

function PlaygroundFeedHeader(props: {
  target: PlaygroundFeedDataTarget;
  label: string;
  record?: PlaygroundFeedDataRecord;
  headerTop?: number;
  isPinned?: boolean;
  onEdit: () => void;
  onRefresh: () => void;
  onFragment: () => void;
  onRemoveFragment: () => void;
  onOpenActiveFilters: () => void;
  onChangePage: (page: number) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const totalPages = Math.max(1, Math.ceil((props.record?.totalRows ?? 0) / Math.max(1, props.target.query.pageSize)));
  const currentPage = clampFeedPage(props.target.query.page, totalPages);
  const pageLabel = `${currentPage}/${totalPages}`;
  const [pageDraft, setPageDraft] = useState(pageLabel);
  const activeFilterCount = props.target.lockedFilterColumns
    ? Object.entries(props.target.query.filters).filter(
        ([column, expression]) => !props.target.lockedFilterColumns.includes(column) && expression.trim().length > 0
      ).length
    : 0;
  const showPager = props.target.kind === "feed" && props.target.showPaginationInHeader;
  const statusLabel =
    props.record?.status === "loading"
      ? "Sincronizando"
      : props.record?.status === "error"
        ? "Erro"
        : props.record?.status === "ready"
          ? `${props.record.rows.length}/${props.record.totalRows}`
          : "Pendente";

  useEffect(() => {
    setPageDraft(pageLabel);
  }, [pageLabel]);

  function commitPageDraft(value = pageDraft) {
    const nextPage = parseFeedPageDraft(value, totalPages);
    setPageDraft(`${nextPage}/${totalPages}`);

    if (nextPage !== currentPage) {
      props.onChangePage(nextPage);
    }
  }

  return (
    <div
      className={`playground-feed-block-header ${props.isPinned ? "is-pinned" : ""}`.trim()}
      data-testid={`playground-feed-header-${props.target.id}`}
      style={props.headerTop == null ? undefined : { top: props.headerTop }}
    >
      <div className="playground-feed-block-main">
        <div className="playground-feed-block-title" data-testid={`playground-feed-drag-${props.target.id}`} onPointerDown={props.onDragStart}>
          <strong>{props.target.title ?? props.label}</strong>
        </div>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className="playground-feed-block-filter"
            data-testid={`playground-feed-active-filters-${props.target.id}`}
            aria-label={`${activeFilterCount} filtros ativos`}
            title={`${activeFilterCount} filtros ativos`}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onOpenActiveFilters();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />
            </svg>
            <span>{activeFilterCount}</span>
          </button>
        ) : null}
        {showPager ? (
          <div
            className="playground-feed-header-pager"
            data-testid={`playground-feed-header-pager-${props.target.id}`}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Pagina anterior"
              title="Pagina anterior"
              data-testid={`playground-feed-page-prev-${props.target.id}`}
              disabled={currentPage <= 1}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onChangePage(currentPage - 1);
              }}
            >
              {"<"}
            </button>
            <input
              value={pageDraft}
              aria-label="Pagina atual"
              data-testid={`playground-feed-page-input-${props.target.id}`}
              onChange={(event) => setPageDraft(event.target.value)}
              onBlur={() => commitPageDraft()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitPageDraft();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setPageDraft(pageLabel);
                }
              }}
            />
            <button
              type="button"
              aria-label="Proxima pagina"
              title="Proxima pagina"
              data-testid={`playground-feed-page-next-${props.target.id}`}
              disabled={currentPage >= totalPages}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onChangePage(currentPage + 1);
              }}
            >
              {">"}
            </button>
          </div>
        ) : null}
        <details className="playground-feed-block-menu">
          <summary data-testid={`playground-feed-menu-${props.target.id}`} aria-label="Opcoes do alimentador">...</summary>
          <div className="playground-feed-block-menu-panel">
            <button type="button" data-testid={`playground-feed-refresh-${props.target.id}`} onClick={props.onRefresh}>
              Atualizar
            </button>
            {props.target.kind === "feed" ? (
              <>
                <button type="button" data-testid={`playground-feed-edit-${props.target.id}`} onClick={props.onEdit}>
                  Reconfigurar
                </button>
                <button type="button" data-testid={`playground-feed-fragment-${props.target.id}`} onClick={props.onFragment}>
                  Fragmentar
                </button>
              </>
            ) : (
              <button type="button" data-testid={`playground-feed-remove-fragment-${props.target.id}`} onClick={props.onRemoveFragment}>
                Remover fragmento
              </button>
            )}
          </div>
        </details>
      </div>
      <span className="playground-feed-block-status">{statusLabel}</span>
    </div>
  );
}

function PlaygroundFeedBlock(props: {
  target: PlaygroundFeedDataTarget;
  record?: PlaygroundFeedDataRecord;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  headerTop?: number;
  isHeaderPinned?: boolean;
  transform?: string;
  dragStatus?: "free" | "snapped" | "blocked";
  isHovered: boolean;
  onEditFeed: (feedId: string) => void;
  onRefreshFeed: (feedId: string) => void;
  onFragmentFeed: (feedId: string) => void;
  onRemoveFragment: (fragmentId: string) => void;
  onOpenFeedActiveFilters: (targetId: string) => void;
  onChangeFeedPage: (targetId: string, page: number) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <article
      className={`playground-feed-block playground-feed-block-${props.target.kind} ${props.dragStatus ? `is-${props.dragStatus}` : ""} ${props.isHovered ? "is-hovered" : ""} ${props.isHeaderPinned ? "is-header-pinned" : ""}`.trim()}
      data-testid={`playground-feed-block-${props.target.id}`}
      style={{
        left: props.left,
        top: props.top,
        width: props.width,
        height: props.height,
        transform: props.transform
      }}
    >
      <PlaygroundFeedHeader
        target={props.target}
        label={props.label}
        record={props.record}
        headerTop={props.headerTop}
        isPinned={props.isHeaderPinned}
        onEdit={() => props.onEditFeed(props.target.feedId)}
        onRefresh={() => props.onRefreshFeed(props.target.id)}
        onFragment={() => props.onFragmentFeed(props.target.feedId)}
        onRemoveFragment={() => props.onRemoveFragment(props.target.id)}
        onOpenActiveFilters={() => props.onOpenFeedActiveFilters(props.target.id)}
        onChangePage={(page) => props.onChangeFeedPage(props.target.id, page)}
        onDragStart={props.onDragStart}
      />
      {props.record?.status === "error" ? (
        <div className="playground-feed-block-state">{props.record.error ?? "Falha ao carregar alimentador."}</div>
      ) : null}
    </article>
  );
}

export function PlaygroundGridCanvas(props: PlaygroundGridCanvasProps) {
  const [hoveredFeedTargetId, setHoveredFeedTargetId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    scrollLeft: 0,
    scrollTop: 0,
    width: 0,
    height: 0
  });

  const rowMetrics = useMemo(
    () =>
      buildTracks({
        count: props.page.rowCount,
        hidden: props.page.hiddenRows,
        getSize: (row) => getRowHeight(props.page, row)
      }),
    [props.page]
  );
  const columnMetrics = useMemo(
    () =>
      buildTracks({
        count: props.page.colCount,
        hidden: props.page.hiddenColumns,
        getSize: (col) => getColumnWidth(props.page, col)
      }),
    [props.page]
  );
  const dragTargets = useMemo(
    () =>
      props.feedTargets.map((target) => {
        const record = props.feedRecordsByTargetId[target.id];

        return {
          id: target.id,
          position: target.position,
          size: getFeedAreaGridSize(target, record)
        };
      }),
    [props.feedRecordsByTargetId, props.feedTargets]
  );
  const dragBounds = useMemo(
    () => ({
      rowCount: props.page.rowCount,
      colCount: props.page.colCount
    }),
    [props.page.colCount, props.page.rowCount]
  );
  const { dragState, startDrag } = usePlaygroundDrag({
    targets: dragTargets,
    rowTracks: rowMetrics.tracks,
    columnTracks: columnMetrics.tracks,
    bounds: dragBounds,
    onCommit: props.onMoveFeedTarget
  });

  useEffect(() => {
    const node = props.scrollRef.current;
    if (!node) return;
    const scrollNode = node;

    function syncViewport() {
      setViewport({
        scrollLeft: scrollNode.scrollLeft,
        scrollTop: scrollNode.scrollTop,
        width: scrollNode.clientWidth,
        height: scrollNode.clientHeight
      });
    }

    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(scrollNode);

    return () => observer.disconnect();
  }, [props.scrollRef]);

  const visibleRows = useMemo(
    () =>
      getVisibleTracks(
        rowMetrics.tracks,
        viewport.scrollTop - PLAYGROUND_COLUMN_HEADER_HEIGHT,
        viewport.scrollTop + viewport.height - PLAYGROUND_COLUMN_HEADER_HEIGHT
      ),
    [rowMetrics.tracks, viewport.height, viewport.scrollTop]
  );
  const printPageBreaks = useMemo(() => {
    const columnSizes = columnMetrics.tracks.map((track) => track.size);
    const rowSizes = rowMetrics.tracks.map((track) => track.size);
    // Conservative body height so the marker never promises more rows than the
    // print actually fits. Assumes sheet indexes are enabled (thead repeats on
    // every printer page); when disabled the print may fit one more row than
    // the marker shows, which is the safe direction.
    const printBodyHeight = getPrintBodyHeight({ showSheetIndexes: true });

    return {
      vertical: computePrintPageBreakOffsets(columnSizes, PLAYGROUND_PRINT_PAGE_WIDTH_PX),
      horizontal: computePrintPageBreakOffsets(rowSizes, printBodyHeight),
      contentWidth: columnMetrics.totalSize,
      contentHeight: rowMetrics.totalSize
    };
  }, [columnMetrics.totalSize, columnMetrics.tracks, rowMetrics.totalSize, rowMetrics.tracks]);
  const visibleColumns = useMemo(
    () =>
      getVisibleTracks(
        columnMetrics.tracks,
        viewport.scrollLeft - PLAYGROUND_ROW_HEADER_WIDTH,
        viewport.scrollLeft + viewport.width - PLAYGROUND_ROW_HEADER_WIDTH
      ),
    [columnMetrics.tracks, viewport.scrollLeft, viewport.width]
  );
  const visibleFeedBlocks = useMemo<VisibleFeedBlock[]>(
    () =>
      props.feedTargets.flatMap((target) => {
          const rowTrack = rowMetrics.byIndex.get(target.position.row);
          const colTrack = columnMetrics.byIndex.get(target.position.col);
          if (!rowTrack || !colTrack) return [];
          const previewPosition = dragState?.targetId === target.id ? dragState.previewPosition : null;
          const previewRowTrack = previewPosition ? rowMetrics.byIndex.get(previewPosition.row) : null;
          const previewColTrack = previewPosition ? columnMetrics.byIndex.get(previewPosition.col) : null;

          const record = props.feedRecordsByTargetId[target.id];
          const sizing = getFeedAreaSizing({
            page: props.page,
            target,
            record
          });
          const rect = {
            left: PLAYGROUND_ROW_HEADER_WIDTH + colTrack.start,
            top: PLAYGROUND_COLUMN_HEADER_HEIGHT + rowTrack.start,
            width: sizing.width,
            height: getFeedBlockEstimate(sizing)
          };
          const previewRect = previewRowTrack && previewColTrack
            ? {
                ...rect,
                left: PLAYGROUND_ROW_HEADER_WIDTH + previewColTrack.start,
                top: PLAYGROUND_COLUMN_HEADER_HEIGHT + previewRowTrack.start
              }
            : rect;

          if (!intersectsViewport(previewRect, viewport)) return [];

          return [{
            target,
            record,
            rect: {
              ...rect,
              height: previewRect.height
            }
          }];
        }),
    [columnMetrics.byIndex, dragState, props.feedRecordsByTargetId, props.feedTargets, props.page, rowMetrics.byIndex, viewport]
  );
  const stickyFeedHeader = useMemo(() => {
    const anchorTop = viewport.scrollTop + PLAYGROUND_COLUMN_HEADER_HEIGHT;
    const candidates = visibleFeedBlocks.filter((block) => {
      const naturalHeaderTop = block.rect.top - PLAYGROUND_FEED_HEADER_HEIGHT;
      const lastPinnedTop = block.rect.top + block.rect.height - PLAYGROUND_FEED_HEADER_HEIGHT;

      return anchorTop >= naturalHeaderTop && anchorTop <= lastPinnedTop;
    });

    if (candidates.length === 0) return null;

    const selected =
      candidates.find((block) => block.target.id === hoveredFeedTargetId) ??
      candidates
        .slice()
        .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left)[0];
    const top = Math.max(
      -PLAYGROUND_FEED_HEADER_HEIGHT,
      Math.min(selected.rect.height - PLAYGROUND_FEED_HEADER_HEIGHT, anchorTop - selected.rect.top)
    );

    return {
      targetId: selected.target.id,
      top
    };
  }, [hoveredFeedTargetId, viewport.scrollTop, visibleFeedBlocks]);
  const areaResizePreviewRect = useMemo(
    () =>
      props.areaResizePreviewPlan
        ? getGridRectPixels({
            page: props.page,
            rowMetrics,
            columnMetrics,
            rect: props.areaResizePreviewPlan.newRect
          })
        : null,
    [columnMetrics, props.areaResizePreviewPlan, props.page, rowMetrics]
  );
  const feedTargetAtCell = (row: number, col: number) =>
    props.feedTargets.find((target) => {
      const size = getFeedAreaGridSize(target, props.feedRecordsByTargetId[target.id]);

      return (
        row >= target.position.row &&
        row < target.position.row + size.rowSpan &&
        col >= target.position.col &&
        col < target.position.col + size.colSpan
      );
    }) ?? null;

  return (
    <div
      className={`playground-grid-scroll ${props.showGridLines ? "" : "is-grid-lines-hidden"}`.trim()}
      data-testid="playground-grid-scroll"
      ref={props.scrollRef}
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      onScroll={(event) => {
        const node = event.currentTarget;
        setViewport({
          scrollLeft: node.scrollLeft,
          scrollTop: node.scrollTop,
          width: node.clientWidth,
          height: node.clientHeight
        });
      }}
    >
      <div
        className={`playground-grid-canvas ${props.mode === "target_select" ? "is-target-mode" : ""} ${props.showGridLines ? "" : "is-grid-lines-hidden"}`.trim()}
        data-testid="playground-grid"
        onMouseLeave={() => setHoveredFeedTargetId(null)}
        style={{
          width: PLAYGROUND_ROW_HEADER_WIDTH + columnMetrics.totalSize,
          height: PLAYGROUND_COLUMN_HEADER_HEIGHT + rowMetrics.totalSize
        }}
      >
        <div
          className={`playground-canvas-corner ${isWholeSheetSelected(props.selection, props.page) ? "is-selected" : ""}`}
          style={{
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
            width: PLAYGROUND_ROW_HEADER_WIDTH,
            height: PLAYGROUND_COLUMN_HEADER_HEIGHT
          }}
        >
          <button type="button" className="playground-header-button" data-testid="playground-select-all" onClick={props.onSelectWholeSheet} aria-label="Selecionar toda a planilha">
            All
          </button>
        </div>

        {visibleColumns.map((col) => (
          <div
            key={`header-${col.index}`}
            className={`playground-canvas-col-header ${isColumnSelectionActive(props.selection, props.page, col.index) ? "is-selected" : ""}`}
            style={{
              left: PLAYGROUND_ROW_HEADER_WIDTH + col.start,
              top: viewport.scrollTop,
              width: col.size,
              height: PLAYGROUND_COLUMN_HEADER_HEIGHT
            }}
          >
            <div className="playground-col-header-inner">
              <button type="button" className="playground-header-button" onClick={() => props.onSelectColumn(col.index)} aria-label={`Selecionar coluna ${columnLabel(col.index)}`}>
                {columnLabel(col.index)}
              </button>
              <button
                type="button"
                className="playground-col-resizer"
                data-testid={`playground-col-resizer-${col.index}`}
                aria-label={`Redimensionar coluna ${columnLabel(col.index)}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onColumnResizeStart(col.index, event.clientX);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onColumnAutoFit(col.index);
                }}
              />
            </div>
          </div>
        ))}

        {visibleRows.map((row) => (
          <div
            key={`row-header-${row.index}`}
            className={`playground-canvas-row-header ${isRowSelectionActive(props.selection, props.page, row.index) ? "is-selected" : ""}`}
            style={{
              left: viewport.scrollLeft,
              top: PLAYGROUND_COLUMN_HEADER_HEIGHT + row.start,
              width: PLAYGROUND_ROW_HEADER_WIDTH,
              height: row.size
            }}
          >
            <div className="playground-row-header-inner">
              <button type="button" className="playground-header-button" onClick={() => props.onSelectRow(row.index)} aria-label={`Selecionar linha ${row.index + 1}`}>
                {row.index + 1}
              </button>
              <button
                type="button"
                className="playground-row-resizer"
                data-testid={`playground-row-resizer-${row.index}`}
                aria-label={`Redimensionar linha ${row.index + 1}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onRowResizeStart(row.index, event.clientY);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onRowAutoFit(row.index);
                }}
              />
            </div>
          </div>
        ))}

        {visibleRows.map((row) =>
          visibleColumns.map((col) => {
            const key = cellKey(row.index, col.index);
            const cell = getCell(props.page, row.index, col.index);
            const selected = isCellSelected(props.selection, row.index, col.index);
            const editing = props.editingCell?.row === row.index && props.editingCell?.col === col.index;
            const isActive = props.activeCell?.row === row.index && props.activeCell?.col === col.index;
            const feedHeaderCell = findFeedHeaderCell(props.feedTargets, props.feedRecordsByTargetId, row.index, col.index);

            return (
              <div
                key={key}
                className={`playground-canvas-cell ${selected ? "is-selected" : ""} ${isActive ? "is-active" : ""} ${props.mode === "target_select" ? "is-targetable" : ""} ${feedHeaderCell ? "is-feed-header-cell" : ""}`.trim()}
                style={{
                  left: PLAYGROUND_ROW_HEADER_WIDTH + col.start,
                  top: PLAYGROUND_COLUMN_HEADER_HEIGHT + row.start,
                  width: col.size,
                  height: row.size,
                  background: cell.style?.background,
                  color: cell.style?.color,
                  fontWeight: cell.style?.bold ? 700 : 500
                }}
                onMouseDown={(event) => props.onCellPointerDown(event, row.index, col.index)}
                onMouseEnter={() => {
                  props.onCellPointerEnter(row.index, col.index);
                  setHoveredFeedTargetId(feedTargetAtCell(row.index, col.index)?.id ?? null);
                }}
                onDoubleClick={() => props.onCellDoubleClick(row.index, col.index)}
                onClick={() => props.onCellClick(row.index, col.index)}
                data-testid={`playground-cell-${row.index}-${col.index}`}
              >
                {editing ? (
                  <input
                    className="playground-cell-input"
                    autoFocus
                    value={props.editingValue}
                    onChange={(event) => props.onEditingValueChange(event.target.value)}
                    onBlur={props.onCommitCellEdit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        props.onCommitCellEdit();
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        props.onCancelCellEdit();
                      }
                    }}
                  />
                ) : (
                  <>
                    <div className={`playground-cell-value ${feedHeaderCell ? "has-feed-column-controls" : ""}`.trim()} title={cell.value}>
                      {cell.value || ""}
                    </div>
                    {feedHeaderCell ? (
                      <div className="playground-feed-column-controls">
                        {feedHeaderCell.sortDir ? (
                          <span className="playground-feed-sort-pill" title={`Ordenacao ${feedHeaderCell.sortDir}`}>
                            {feedHeaderCell.sortIndex + 1}
                          </span>
                        ) : null}
                        {feedHeaderCell.displayOverride ? (
                          <span className="playground-feed-relation-pill" title={`FK: ${feedHeaderCell.displayOverride}`}>
                            FK
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={`playground-feed-column-btn playground-feed-sort-btn ${feedHeaderCell.sortDir ? "is-active" : ""}`}
                          title="Ordenar coluna do alimentador"
                          aria-label={`Ordenar coluna ${feedHeaderCell.column}`}
                          data-testid={`playground-feed-sort-${feedHeaderCell.target.id}-${feedHeaderCell.column}`}
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onToggleFeedColumnSort(feedHeaderCell.target.id, feedHeaderCell.column, event.shiftKey);
                          }}
                        >
                          {feedHeaderCell.sortDir === "desc" ? "ZA" : "AZ"}
                        </button>
                        <button
                          type="button"
                          className={`playground-feed-column-btn playground-feed-filter-btn ${feedHeaderCell.filterActive ? "is-active" : ""}`}
                          title={feedHeaderCell.filterLocked ? "Filtro fixo do alimentador" : "Filtrar coluna do alimentador"}
                          aria-label={`Filtrar coluna ${feedHeaderCell.column}`}
                          data-testid={`playground-feed-filter-${feedHeaderCell.target.id}-${feedHeaderCell.column}`}
                          disabled={feedHeaderCell.filterLocked}
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onOpenFeedColumnFilter(
                              feedHeaderCell.target.id,
                              feedHeaderCell.column,
                              event.currentTarget.getBoundingClientRect()
                            );
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />
                          </svg>
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );
          })
        )}

        {props.areaResizePreviewPlan && areaResizePreviewRect ? (
          <div
            className={`playground-area-resize-preview ${props.areaResizePreviewPlan.safeToApply ? "" : "is-blocked"} ${props.areaResizePreviewPlan.mode === "shift-range" ? "is-shift-range" : "is-fixed"}`.trim()}
            style={areaResizePreviewRect}
            data-testid={`playground-area-resize-preview-${props.areaResizePreviewPlan.areaId}`}
          >
            <span>{props.areaResizePreviewPlan.deltaRows > 0 ? "+" : ""}{props.areaResizePreviewPlan.deltaRows} linhas</span>
          </div>
        ) : null}

        <div
          className="playground-print-break-layer"
          aria-hidden="true"
          data-testid="playground-print-break-layer"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 4
          }}
        >
          {printPageBreaks.vertical.map((offset, index) => (
            <div
              key={`print-break-v-${index}`}
              data-testid={`playground-print-break-vertical-${index}`}
              title={`Quebra horizontal (pagina ${index + 2})`}
              style={{
                position: "absolute",
                left: PLAYGROUND_ROW_HEADER_WIDTH + offset - 1,
                top: PLAYGROUND_COLUMN_HEADER_HEIGHT,
                width: 0,
                height: printPageBreaks.contentHeight,
                borderLeft: "2px dashed rgba(220, 38, 38, 0.55)",
                pointerEvents: "none"
              }}
            />
          ))}
          {printPageBreaks.horizontal.map((offset, index) => (
            <div
              key={`print-break-h-${index}`}
              data-testid={`playground-print-break-horizontal-${index}`}
              title={`Quebra vertical (pagina ${index + 2})`}
              style={{
                position: "absolute",
                left: PLAYGROUND_ROW_HEADER_WIDTH,
                top: PLAYGROUND_COLUMN_HEADER_HEIGHT + offset - 1,
                width: printPageBreaks.contentWidth,
                height: 0,
                borderTop: "2px dashed rgba(220, 38, 38, 0.55)",
                pointerEvents: "none"
              }}
            />
          ))}
        </div>

        <div className="playground-feed-block-layer" aria-hidden={props.feedTargets.length === 0}>
          {visibleFeedBlocks.map((block) => {
            const isDragging = dragState?.targetId === block.target.id;
            const previewRowTrack = isDragging ? rowMetrics.byIndex.get(dragState.previewPosition.row) : null;
            const previewColTrack = isDragging ? columnMetrics.byIndex.get(dragState.previewPosition.col) : null;
            const transform =
              previewRowTrack && previewColTrack
                ? `translate(${PLAYGROUND_ROW_HEADER_WIDTH + previewColTrack.start - block.rect.left}px, ${PLAYGROUND_COLUMN_HEADER_HEIGHT + previewRowTrack.start - block.rect.top}px)`
                : undefined;
            const isHeaderPinned = stickyFeedHeader?.targetId === block.target.id;

            return (
              <PlaygroundFeedBlock
                key={block.target.id}
                target={block.target}
                record={block.record}
                label={props.tableLabelByKey[block.target.table] ?? block.target.table}
                left={block.rect.left}
                top={block.rect.top}
                width={block.rect.width}
                height={block.rect.height}
                headerTop={isHeaderPinned ? stickyFeedHeader.top : undefined}
                isHeaderPinned={isHeaderPinned}
                transform={transform}
                dragStatus={isDragging ? dragState.previewStatus : undefined}
                isHovered={hoveredFeedTargetId === block.target.id || isDragging}
                onEditFeed={props.onEditFeed}
                onRefreshFeed={props.onRefreshFeed}
                onFragmentFeed={props.onFragmentFeed}
                onRemoveFragment={props.onRemoveFragment}
                onOpenFeedActiveFilters={props.onOpenFeedActiveFilters}
                onChangeFeedPage={props.onChangeFeedPage}
                onDragStart={(event) => startDrag(block.target.id, event)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
