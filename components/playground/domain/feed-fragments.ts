import type { GridPosition, PlaygroundFeed, PlaygroundFeedFragment, PlaygroundFeedQuery } from "@/components/playground/types";
import {
  DEFAULT_PLAYGROUND_FEED_QUERY,
  buildFragmentFeedQuery,
  normalizeFeedQuery
} from "@/components/playground/domain/feed-query";

export type FragmentFacetOption = {
  literal: string;
  label: string;
  count?: number;
};

export type CreateFeedFragmentsParams = {
  feed: PlaygroundFeed;
  sourceColumn: string;
  options: FragmentFacetOption[];
  selectedLiterals: string[];
  positionForIndex: (index: number, option: FragmentFacetOption) => GridPosition;
  createId: (index: number, option: FragmentFacetOption) => string;
};

export function getFeedFragmentColumns(feed: PlaygroundFeed, fragment: PlaygroundFeedFragment) {
  return fragment.columns && fragment.columns.length > 0 ? fragment.columns : feed.columns;
}

export function getFeedFragmentColumnLabels(feed: PlaygroundFeed, fragment: PlaygroundFeedFragment) {
  return fragment.columnLabels && Object.keys(fragment.columnLabels).length > 0 ? fragment.columnLabels : feed.columnLabels;
}

export function getFeedFragmentDisplayColumnOverrides(feed: PlaygroundFeed, fragment: PlaygroundFeedFragment) {
  return {
    ...feed.displayColumnOverrides,
    ...fragment.displayColumnOverrides
  };
}

export function getFragmentValueLiterals(fragments: PlaygroundFeedFragment[], sourceColumn?: string) {
  return fragments
    .filter((fragment) => !sourceColumn || fragment.sourceColumn === sourceColumn)
    .map((fragment) => fragment.valueLiteral);
}

export function createFeedFragments(params: CreateFeedFragmentsParams) {
  const selected = new Set(params.selectedLiterals);
  const selectedOptions = params.options.filter((option) => selected.has(option.literal));

  return selectedOptions.map<PlaygroundFeedFragment>((option, index) => {
    const query: PlaygroundFeedQuery = buildFragmentFeedQuery({
      parentQuery: params.feed.query ?? DEFAULT_PLAYGROUND_FEED_QUERY,
      sourceColumn: params.sourceColumn,
      valueLiteral: option.literal,
      fragmentQuery: {
        ...DEFAULT_PLAYGROUND_FEED_QUERY,
        pageSize: normalizeFeedQuery(params.feed.query).pageSize
      }
    });

    return {
      id: params.createId(index, option),
      parentFeedId: params.feed.id,
      sourceColumn: params.sourceColumn,
      valueLiteral: option.literal,
      valueLabel: option.label,
      position: params.positionForIndex(index, option),
      query,
      displayColumnOverrides: {},
      renderedAt: undefined
    };
  });
}

export function removeFeedFragment(feed: PlaygroundFeed, fragmentId: string): PlaygroundFeed {
  return {
    ...feed,
    fragments: feed.fragments.filter((fragment) => fragment.id !== fragmentId)
  };
}

export function upsertFeedFragments(feed: PlaygroundFeed, fragments: PlaygroundFeedFragment[]): PlaygroundFeed {
  const incomingIds = new Set(fragments.map((fragment) => fragment.id));

  return {
    ...feed,
    fragments: [...feed.fragments.filter((fragment) => !incomingIds.has(fragment.id)), ...fragments]
  };
}

