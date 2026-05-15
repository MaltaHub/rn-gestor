import { buildGridRect, normalizeGridPosition, type GridSize } from "@/components/playground/domain/geometry";
import { normalizeFeedQuery } from "@/components/playground/domain/feed-query";
import type { GridPosition, GridRect, PlaygroundFeed, PlaygroundFeedFragment, PlaygroundPage } from "@/components/playground/types";
import type { PlaygroundFeedDataTarget } from "@/components/playground/domain/feed-data";

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
