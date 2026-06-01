import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import { findNearestAvailableGridPosition, isGridPlacementAvailable } from "@/components/playground/domain/collision";
import { buildGridRect, type GridBounds, type GridSize } from "@/components/playground/domain/geometry";
import type { GridPosition, GridRect } from "@/components/playground/types";

export type PlaygroundDragTrack = {
  index: number;
  start: number;
  size: number;
  end: number;
};

export type PlaygroundDragTarget = {
  id: string;
  position: GridPosition;
  size: GridSize;
};

type DragStatus = "free" | "snapped" | "blocked";

export type PlaygroundDragState = {
  targetId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  originPosition: GridPosition;
  originPixel: {
    left: number;
    top: number;
  };
  size: GridSize;
  previewPosition: GridPosition;
  previewStatus: DragStatus;
  occupiedRects: GridRect[];
};

type UsePlaygroundDragParams = {
  targets: PlaygroundDragTarget[];
  rowTracks: PlaygroundDragTrack[];
  columnTracks: PlaygroundDragTrack[];
  bounds: GridBounds;
  onCommit: (targetId: string, position: GridPosition) => void;
  /** Container rolavel do grid: usado para auto-scroll ao arrastar perto da borda. */
  scrollRef?: RefObject<HTMLDivElement | null>;
};

// Auto-scroll: quanto o ponteiro precisa chegar perto da borda (px) e o passo
// maximo por frame na borda extrema.
const PLAYGROUND_DRAG_EDGE_SIZE = 56;
const PLAYGROUND_DRAG_MAX_SCROLL_STEP = 22;

function mapByIndex(tracks: PlaygroundDragTrack[]) {
  return new Map(tracks.map((track) => [track.index, track]));
}

function findClosestTrackIndex(tracks: PlaygroundDragTrack[], pixel: number, fallback: number) {
  if (tracks.length === 0) return fallback;

  let best = tracks[0];
  let bestDistance = Math.abs(tracks[0].start - pixel);

  for (const track of tracks) {
    if (pixel >= track.start && pixel < track.end) {
      return track.index;
    }

    const distance = Math.abs(track.start - pixel);
    if (distance < bestDistance) {
      best = track;
      bestDistance = distance;
    }
  }

  return best.index;
}

function buildOccupiedRects(targets: PlaygroundDragTarget[], movingTargetId: string) {
  return targets
    .filter((target) => target.id !== movingTargetId)
    .map((target) => buildGridRect(target.position, target.size));
}

function resolveDragPosition(params: {
  origin: GridPosition;
  desired: GridPosition;
  size: GridSize;
  bounds: GridBounds;
  occupiedRects: GridRect[];
}): { position: GridPosition; status: DragStatus } {
  const candidate = buildGridRect(params.desired, params.size);

  if (isGridPlacementAvailable(candidate, params.bounds, params.occupiedRects)) {
    return {
      position: params.desired,
      status: "free"
    };
  }

  const snapped = findNearestAvailableGridPosition({
    desiredPosition: params.desired,
    size: params.size,
    bounds: params.bounds,
    occupiedRects: params.occupiedRects
  });

  if (!snapped) {
    return {
      position: params.origin,
      status: "blocked"
    };
  }

  return {
    position: snapped,
    status: "snapped"
  };
}

/** Passo de auto-scroll em um eixo dado a distancia ate cada borda. */
function edgeScrollStep(distanceToStart: number, distanceToEnd: number) {
  const ramp = (distance: number) =>
    Math.ceil(PLAYGROUND_DRAG_MAX_SCROLL_STEP * (1 - Math.max(0, Math.min(PLAYGROUND_DRAG_EDGE_SIZE, distance)) / PLAYGROUND_DRAG_EDGE_SIZE));

  if (distanceToStart < PLAYGROUND_DRAG_EDGE_SIZE) return -ramp(distanceToStart);
  if (distanceToEnd < PLAYGROUND_DRAG_EDGE_SIZE) return ramp(distanceToEnd);
  return 0;
}

export function usePlaygroundDrag(params: UsePlaygroundDragParams) {
  const { bounds, columnTracks, onCommit, rowTracks, scrollRef, targets } = params;
  const [dragState, setDragState] = useState<PlaygroundDragState | null>(null);
  const dragStateRef = useRef<PlaygroundDragState | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const targetById = useMemo(() => new Map(targets.map((target) => [target.id, target])), [targets]);
  const rowTrackByIndex = useMemo(() => mapByIndex(rowTracks), [rowTracks]);
  const columnTrackByIndex = useMemo(() => mapByIndex(columnTracks), [columnTracks]);

  const startDrag = useCallback(
    (targetId: string, event: ReactPointerEvent<HTMLElement>) => {
      const target = targetById.get(targetId);
      if (!target) return;

      const rowTrack = rowTrackByIndex.get(target.position.row);
      const colTrack = columnTrackByIndex.get(target.position.col);
      if (!rowTrack || !colTrack) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const scrollNode = scrollRef?.current ?? null;
      const nextState = {
        targetId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: scrollNode?.scrollLeft ?? 0,
        startScrollTop: scrollNode?.scrollTop ?? 0,
        originPosition: target.position,
        originPixel: {
          left: colTrack.start,
          top: rowTrack.start
        },
        size: target.size,
        previewPosition: target.position,
        previewStatus: "free",
        occupiedRects: buildOccupiedRects(targets, targetId)
      } satisfies PlaygroundDragState;

      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      dragStateRef.current = nextState;
      setDragState(nextState);
    },
    [columnTrackByIndex, rowTrackByIndex, scrollRef, targetById, targets]
  );

  const cancelDrag = useCallback(() => {
    dragStateRef.current = null;
    lastPointerRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => {
    const scrollNode = scrollRef?.current ?? null;

    // Recalcula a previa a partir do ponteiro atual, ja somando o quanto o
    // container rolou desde o inicio do drag (assim arrastar + rolar combinam).
    function updatePreviewFromPointer(clientX: number, clientY: number) {
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;

      const scrollLeftDelta = (scrollNode?.scrollLeft ?? activeDrag.startScrollLeft) - activeDrag.startScrollLeft;
      const scrollTopDelta = (scrollNode?.scrollTop ?? activeDrag.startScrollTop) - activeDrag.startScrollTop;

      const desiredLeft = activeDrag.originPixel.left + (clientX - activeDrag.startClientX) + scrollLeftDelta;
      const desiredTop = activeDrag.originPixel.top + (clientY - activeDrag.startClientY) + scrollTopDelta;
      const desired = {
        row: findClosestTrackIndex(rowTracks, desiredTop, activeDrag.originPosition.row),
        col: findClosestTrackIndex(columnTracks, desiredLeft, activeDrag.originPosition.col)
      };
      const preview = resolveDragPosition({
        origin: activeDrag.originPosition,
        desired,
        size: activeDrag.size,
        bounds,
        occupiedRects: activeDrag.occupiedRects
      });

      const nextState = {
        ...activeDrag,
        previewPosition: preview.position,
        previewStatus: preview.status
      };

      dragStateRef.current = nextState;
      setDragState(nextState);
    }

    function stopAutoScroll() {
      if (autoScrollFrameRef.current != null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    }

    function autoScrollTick() {
      autoScrollFrameRef.current = null;
      if (!dragStateRef.current || !scrollNode || !lastPointerRef.current) return;

      const rect = scrollNode.getBoundingClientRect();
      const { x, y } = lastPointerRef.current;
      const stepX = edgeScrollStep(x - rect.left, rect.right - x);
      const stepY = edgeScrollStep(y - rect.top, rect.bottom - y);

      if (stepX !== 0 || stepY !== 0) {
        scrollNode.scrollBy(stepX, stepY);
        updatePreviewFromPointer(x, y);
      }

      // Continua o loop enquanto o drag estiver ativo (so rola perto da borda).
      autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick);
    }

    function ensureAutoScrollLoop() {
      if (autoScrollFrameRef.current == null && scrollNode) {
        autoScrollFrameRef.current = requestAnimationFrame(autoScrollTick);
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;
      if (event.pointerId !== activeDrag.pointerId) return;

      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      updatePreviewFromPointer(event.clientX, event.clientY);
      ensureAutoScrollLoop();
    }

    function handlePointerUp(event: PointerEvent) {
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;
      if (event.pointerId !== activeDrag.pointerId) return;

      stopAutoScroll();

      if (activeDrag.previewStatus !== "blocked") {
        onCommit(activeDrag.targetId, activeDrag.previewPosition);
      }

      dragStateRef.current = null;
      lastPointerRef.current = null;
      setDragState(null);
    }

    function handlePointerCancel() {
      stopAutoScroll();
      cancelDrag();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      stopAutoScroll();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [bounds, cancelDrag, columnTracks, onCommit, rowTracks, scrollRef]);

  return {
    dragState,
    startDrag,
    cancelDrag
  };
}
