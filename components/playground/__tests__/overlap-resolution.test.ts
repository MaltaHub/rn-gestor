import { describe, expect, it } from "vitest";
import { resolveFeedOverlapsInPage, getFeedTargetGridSize } from "@/components/playground/domain/feed-placement";
import { DEFAULT_PLAYGROUND_FEED_QUERY } from "@/components/playground/domain/feed-query";
import { createWorkbook } from "@/components/playground/grid-utils";
import type { PlaygroundFeed, PlaygroundPage } from "@/components/playground/types";

function makeFeed(partial: {
  id: string;
  columns: string[];
  targetRow: number;
  targetCol: number;
}): PlaygroundFeed {
  return {
    id: partial.id,
    table: "carros",
    title: undefined,
    position: { row: partial.targetRow, col: partial.targetCol },
    columns: partial.columns,
    columnLabels: Object.fromEntries(partial.columns.map((column) => [column, column])),
    query: DEFAULT_PLAYGROUND_FEED_QUERY,
    displayColumnOverrides: {},
    showPaginationInHeader: false,
    hideColumnHeader: false,
    hidden: false,
    fragments: [],
    anchorFilterColumns: [],
    prochColumns: [],
    targetRow: partial.targetRow,
    targetCol: partial.targetCol,
    renderedAt: "2026-05-30T00:00:00.000Z"
  };
}

function makePage(feeds: PlaygroundFeed[]): PlaygroundPage {
  const fallback = createWorkbook().pages[0];
  return { ...fallback, feeds };
}

describe("resolveFeedOverlapsInPage", () => {
  it("nao mexe em ninguem quando nao ha sobreposicao", () => {
    const feedA = makeFeed({ id: "a", columns: ["c1", "c2"], targetRow: 0, targetCol: 0 });
    const feedB = makeFeed({ id: "b", columns: ["c1"], targetRow: 0, targetCol: 5 });
    const page = makePage([feedA, feedB]);
    const result = resolveFeedOverlapsInPage({ page, priorityFeedId: "a" });
    expect(result.resolutions).toEqual([]);
    expect(result.page).toBe(page);
  });

  it("mantem o feed prioritario parado e move o vizinho que passou a sobrepor", () => {
    // A: 4 colunas em col 0 -> ocupa cols [0..3].
    // B: 2 colunas em col 2 -> sobrepoe A em cols [2..3].
    const feedA = makeFeed({ id: "a", columns: ["c1", "c2", "c3", "c4"], targetRow: 0, targetCol: 0 });
    const feedB = makeFeed({ id: "b", columns: ["x", "y"], targetRow: 0, targetCol: 2 });
    const page = makePage([feedA, feedB]);
    const result = resolveFeedOverlapsInPage({ page, priorityFeedId: "a" });

    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0].target.feedId).toBe("b");

    const movedB = result.page.feeds.find((feed) => feed.id === "b");
    expect(movedB).toBeTruthy();
    if (!movedB) return;
    const aRect = { row: 0, col: 0, ...getFeedTargetGridSize({ columns: feedA.columns, query: feedA.query }) };
    const bRect = {
      row: movedB.position.row,
      col: movedB.position.col,
      ...getFeedTargetGridSize({ columns: movedB.columns, query: movedB.query })
    };
    // B agora deve estar fora do retangulo de A.
    const aEndRow = aRect.row + aRect.rowSpan - 1;
    const aEndCol = aRect.col + aRect.colSpan - 1;
    const bEndRow = bRect.row + bRect.rowSpan - 1;
    const bEndCol = bRect.col + bRect.colSpan - 1;
    const overlap =
      bRect.row <= aEndRow && bEndRow >= aRect.row && bRect.col <= aEndCol && bEndCol >= aRect.col;
    expect(overlap).toBe(false);

    // O feed A permaneceu na posicao original.
    const stayedA = result.page.feeds.find((feed) => feed.id === "a");
    expect(stayedA?.position).toEqual({ row: 0, col: 0 });
  });

  it("move o fragmento vizinho quando o feed prioritario expandiu", () => {
    const feedA = makeFeed({ id: "a", columns: ["c1", "c2", "c3"], targetRow: 0, targetCol: 0 });
    const feedB: PlaygroundFeed = {
      ...makeFeed({ id: "b", columns: ["x"], targetRow: 20, targetCol: 0 }),
      fragments: [
        {
          id: "frag-1",
          parentFeedId: "b",
          sourceColumn: "x",
          valueLiteral: "value",
          valueLabel: "Fragmento",
          // Posicionado sobre A (sobrepoe).
          position: { row: 2, col: 1 },
          query: DEFAULT_PLAYGROUND_FEED_QUERY,
          displayColumnOverrides: {}
        }
      ]
    };
    const page = makePage([feedA, feedB]);
    const result = resolveFeedOverlapsInPage({ page, priorityFeedId: "a" });

    expect(result.resolutions.length).toBeGreaterThan(0);
    const resolvedFragment = result.resolutions.find((entry) => entry.target.fragmentId === "frag-1");
    expect(resolvedFragment).toBeTruthy();

    // Estado na pagina final.
    const updatedB = result.page.feeds.find((feed) => feed.id === "b");
    const updatedFrag = updatedB?.fragments.find((fragment) => fragment.id === "frag-1");
    expect(updatedFrag).toBeTruthy();
    if (!updatedFrag) return;
    // Fragmento foi reposicionado para fora do (0,0)-(2,2) de A.
    const aColSpan = feedA.columns.length;
    const isInsideA =
      updatedFrag.position.col < aColSpan && updatedFrag.position.col >= 0 && updatedFrag.position.row < 13;
    // (A ocupa cols 0..2 e ~12 linhas). Se sobrepoe, falha.
    if (isInsideA && updatedFrag.position.col <= 2) {
      throw new Error(`Fragmento permaneceu sobre A: ${JSON.stringify(updatedFrag.position)}`);
    }
  });

  it("nao move o feed prioritario mesmo que ele sobreponha alguem", () => {
    // A move-se para uma posicao onde B ja estava. Esperamos que B se mova, nao A.
    const feedA = makeFeed({ id: "a", columns: ["c1", "c2"], targetRow: 0, targetCol: 0 });
    const feedB = makeFeed({ id: "b", columns: ["x"], targetRow: 0, targetCol: 1 });
    const page = makePage([feedA, feedB]);
    const result = resolveFeedOverlapsInPage({ page, priorityFeedId: "a" });

    const finalA = result.page.feeds.find((feed) => feed.id === "a");
    expect(finalA?.position).toEqual({ row: 0, col: 0 });
    const finalB = result.page.feeds.find((feed) => feed.id === "b");
    expect(finalB?.position.col).not.toBe(1); // B foi movido
  });
});
