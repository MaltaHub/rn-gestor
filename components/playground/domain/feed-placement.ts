import { buildGridRect, normalizeGridPosition, type GridSize } from "@/components/playground/domain/geometry";
import { normalizeFeedQuery } from "@/components/playground/domain/feed-query";
import {
  findCollidingGridRect,
  findNearestAvailableGridPosition
} from "@/components/playground/domain/collision";
import type { GridPosition, GridRect, PlaygroundFeed, PlaygroundFeedFragment, PlaygroundPage } from "@/components/playground/types";
import {
  buildPlaygroundFeedDataTargets,
  type PlaygroundFeedDataTarget
} from "@/components/playground/domain/feed-data";

const MAX_FEED_BLOCK_ROW_SPAN = 12;
const MIN_FEED_BLOCK_ROW_SPAN = 3;

export function getFeedTargetGridSize(
  target: Pick<PlaygroundFeedDataTarget, "columns" | "query"> & Partial<Pick<PlaygroundFeedDataTarget, "hideColumnHeader">>
): GridSize {
  const query = normalizeFeedQuery(target.query);
  const baseRowSpan = target.hideColumnHeader ? query.pageSize : query.pageSize + 1;

  return {
    rowSpan: Math.max(MIN_FEED_BLOCK_ROW_SPAN, Math.min(MAX_FEED_BLOCK_ROW_SPAN, baseRowSpan)),
    colSpan: Math.max(1, target.columns.length)
  };
}

export function buildFeedTargetGridRect(target: PlaygroundFeedDataTarget): GridRect {
  return buildGridRect(target.position, getFeedTargetGridSize(target));
}

export function buildOccupiedFeedTargetRects(targets: PlaygroundFeedDataTarget[], movingTargetId?: string) {
  return targets
    .filter((target) => target.id !== movingTargetId)
    .map(buildFeedTargetGridRect);
}

function moveFragment(fragment: PlaygroundFeedFragment, position: GridPosition): PlaygroundFeedFragment {
  return {
    ...fragment,
    position: normalizeGridPosition(position),
    renderedAt: new Date().toISOString()
  };
}

function moveFeed(feed: PlaygroundFeed, position: GridPosition): PlaygroundFeed {
  const nextPosition = normalizeGridPosition(position);

  return {
    ...feed,
    position: nextPosition,
    targetRow: nextPosition.row,
    targetCol: nextPosition.col,
    renderedAt: new Date().toISOString()
  };
}

type OverlapResolution = {
  target: PlaygroundFeedDataTarget;
  nextPosition: GridPosition;
};

/**
 * Apos uma mudanca em um feed (ex.: adicionar/remover coluna que altera o
 * colSpan), reposiciona os outros feeds/fragmentos que passaram a sobrepor
 * o priorityFeedId. O feed prioritario fica parado; cada colidido vai para
 * o slot vazio mais proximo do seu lugar original. Anti-overlap passa a ser
 * incremental: cada novo target resolvido tambem entra na lista de ocupados.
 */
export function resolveFeedOverlapsInPage(params: {
  page: PlaygroundPage;
  priorityFeedId: string;
}): { page: PlaygroundPage; resolutions: OverlapResolution[] } {
  const bounds = { rowCount: params.page.rowCount, colCount: params.page.colCount };
  const targets = buildPlaygroundFeedDataTargets(params.page.feeds);
  if (targets.length === 0) {
    return { page: params.page, resolutions: [] };
  }

  // Ordena: prioridade primeiro (parent feed e seus fragmentos),
  // depois o restante na ordem natural do array.
  const priorityTargets = targets.filter((target) => target.feedId === params.priorityFeedId);
  const otherTargets = targets.filter((target) => target.feedId !== params.priorityFeedId);
  const ordered = [...priorityTargets, ...otherTargets];

  const placedRects: GridRect[] = [];
  const resolutions: OverlapResolution[] = [];

  for (const target of ordered) {
    const size = getFeedTargetGridSize(target);
    const originalRect = buildGridRect(target.position, size);
    const isPriority = target.feedId === params.priorityFeedId;

    // Prioridade fica parado mesmo sobrepondo: ele e a referencia.
    if (isPriority) {
      placedRects.push(originalRect);
      continue;
    }

    const collision = findCollidingGridRect(originalRect, placedRects);
    if (!collision) {
      placedRects.push(originalRect);
      continue;
    }

    const nextPosition = findNearestAvailableGridPosition({
      desiredPosition: target.position,
      size,
      bounds,
      occupiedRects: placedRects
    });

    if (!nextPosition) {
      // Sem espaco disponivel: deixa onde estava e adiciona ao ocupado.
      placedRects.push(originalRect);
      continue;
    }

    const nextRect = buildGridRect(nextPosition, size);
    placedRects.push(nextRect);
    resolutions.push({ target, nextPosition });
  }

  if (resolutions.length === 0) {
    return { page: params.page, resolutions: [] };
  }

  let nextPage = params.page;
  for (const resolution of resolutions) {
    nextPage = moveFeedTargetInPage({
      page: nextPage,
      target: resolution.target,
      position: resolution.nextPosition
    });
  }

  return { page: nextPage, resolutions };
}

export function moveFeedTargetInPage(params: {
  page: PlaygroundPage;
  target: Pick<PlaygroundFeedDataTarget, "feedId" | "fragmentId" | "kind">;
  position: GridPosition;
}): PlaygroundPage {
  const now = new Date().toISOString();
  const feeds = params.page.feeds.map((feed) => {
    if (params.target.kind === "feed" && feed.id === params.target.feedId) {
      return moveFeed(feed, params.position);
    }

    if (params.target.kind === "fragment" && feed.id === params.target.feedId && params.target.fragmentId) {
      return {
        ...feed,
        fragments: feed.fragments.map((fragment) =>
          fragment.id === params.target.fragmentId ? moveFragment(fragment, params.position) : fragment
        )
      };
    }

    return feed;
  });

  return {
    ...params.page,
    feeds,
    updatedAt: now
  };
}
