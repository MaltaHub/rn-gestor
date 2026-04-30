import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
};

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

export function usePlaygroundDrag(params: UsePlaygroundDragParams) {
  const { bounds, columnTracks, onCommit, rowTracks, targets } = params;
  const [dragState, setDragState] = useState<PlaygroundDragState | null>(null);
  const dragStateRef = useRef<PlaygroundDragState | null>(null);
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

      const nextState = {
        targetId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
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

      dragStateRef.current = nextState;
      setDragState(nextState);
    },
    [columnTrackByIndex, rowTrackByIndex, targetById, targets]
  );

  const cancelDrag = useCallback(() => {
    dragStateRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;
      if (event.pointerId !== activeDrag.pointerId) return;

      const desiredLeft = activeDrag.originPixel.left + event.clientX - activeDrag.startClientX;
      const desiredTop = activeDrag.originPixel.top + event.clientY - activeDrag.startClientY;
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

    function handlePointerUp(event: PointerEvent) {
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;
      if (event.pointerId !== activeDrag.pointerId) return;

      if (activeDrag.previewStatus !== "blocked") {
        onCommit(activeDrag.targetId, activeDrag.previewPosition);
      }

      dragStateRef.current = null;
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cancelDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", cancelDrag);
    };
  }, [bounds, cancelDrag, columnTracks, onCommit, rowTracks]);

  return {
    dragState,
    startDrag,
    cancelDrag
  };
}
