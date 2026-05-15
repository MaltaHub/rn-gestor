import type { GridPosition, PlaygroundFeed, PlaygroundFeedFragment, PlaygroundFeedQuery } from "@/components/playground/types";
import {
  DEFAULT_PLAYGROUND_FEED_QUERY,
  buildCombinedFragmentFeedQuery,
  buildFragmentFeedQuery,
  buildGroupedFragmentValueLiteral,
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

/**
 * Expande os valueLiterals dos fragmentos para os literais "atomicos" que eles
 * consomem. Fragmentos agrupados sao armazenados como "v1|v2|v3" (canonical key
 * de buildGroupedFragmentValueLiteral) - aqui dividimos para que o dialog de
 * fragmentar possa esconder os valores que ja foram tomados, mesmo via grupo.
 */
export function getEffectiveFragmentLiterals(
  fragments: PlaygroundFeedFragment[],
  sourceColumn?: string
): Set<string> {
  const literals = new Set<string>();
  for (const fragment of fragments) {
    if (sourceColumn && fragment.sourceColumn !== sourceColumn) continue;
    for (const part of fragment.valueLiteral.split("|")) {
      const trimmed = part.trim();
      if (trimmed) literals.add(trimmed);
    }
  }
  return literals;
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

export type CreateGroupedFeedFragmentParams = {
  feed: PlaygroundFeed;
  sourceColumn: string;
  options: FragmentFacetOption[];
  selectedLiterals: string[];
  position: GridPosition;
  id: string;
  label?: string;
};

/**
 * Creates a single fragment that aggregates the occurrences of every selected
 * literal (OR semantics). The fragment's `valueLiteral` is a canonical pipe-
 * separated key built from the selected literals so that the parent feed's
 * exclusion logic continues to behave correctly when joining literals with `|`.
 */
export function createGroupedFeedFragment(params: CreateGroupedFeedFragmentParams): PlaygroundFeedFragment | null {
  const selected = new Set(params.selectedLiterals);
  const selectedOptions = params.options.filter((option) => selected.has(option.literal));
  if (selectedOptions.length === 0) return null;

  const literals = selectedOptions.map((option) => option.literal);
  const composedLiteral = buildGroupedFragmentValueLiteral(literals);
  const composedLabel = params.label?.trim()
    ? params.label.trim()
    : selectedOptions
        .map((option) => option.label || option.literal)
        .filter((value) => value && value.length > 0)
        .join(", ");

  const query: PlaygroundFeedQuery = buildCombinedFragmentFeedQuery({
    parentQuery: params.feed.query ?? DEFAULT_PLAYGROUND_FEED_QUERY,
    sourceColumn: params.sourceColumn,
    valueLiterals: literals,
    fragmentQuery: {
      ...DEFAULT_PLAYGROUND_FEED_QUERY,
      pageSize: normalizeFeedQuery(params.feed.query).pageSize
    }
  });

  return {
    id: params.id,
    parentFeedId: params.feed.id,
    sourceColumn: params.sourceColumn,
    valueLiteral: composedLiteral,
    valueLabel: composedLabel || composedLiteral,
    position: params.position,
    query,
    displayColumnOverrides: {},
    renderedAt: undefined
  };
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

