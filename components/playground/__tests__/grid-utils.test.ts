import { describe, expect, it } from "vitest";
import {
  applyColumnWidths,
  applyRowHeights,
  calculateAutoColumnWidths,
  calculateAutoRowHeights,
  cellKey,
  clearSelectionStyle,
  clearSelectionValues,
  createPlaygroundPage,
  getActualUsedRange,
  hideColumns,
  hideRows,
  PLAYGROUND_MAX_COLS,
  PLAYGROUND_MAX_ROWS,
  removeFeedFromPage,
  paintSelection,
  renderFeedIntoPage,
  resizeColumns,
  resizeRows,
  showAllColumns,
  showAllRows,
  trimPageSize,
  upsertFeedDefinitionInPage
} from "@/components/playground/grid-utils";
import { DEFAULT_PLAYGROUND_FEED_QUERY } from "@/components/playground/domain/feed-query";
import type { PlaygroundFeed } from "@/components/playground/types";

function testFeed(partial: Pick<PlaygroundFeed, "id" | "table" | "columns" | "columnLabels" | "targetRow" | "targetCol" | "renderedAt">): PlaygroundFeed {
  return {
    ...partial,
    position: {
      row: partial.targetRow,
      col: partial.targetCol
    },
    query: DEFAULT_PLAYGROUND_FEED_QUERY,
    displayColumnOverrides: {},
    fragments: []
  };
}

describe("playground grid utils", () => {
  it("clears stale cells before rerendering the same feed", () => {
    const firstRender = renderFeedIntoPage({
      page: createPlaygroundPage(1),
      feed: {
        id: "feed-1",
        table: "carros" as never,
        columns: ["placa", "status"],
        columnLabels: {
          placa: "Placa",
          status: "Status"
        },
        targetRow: 0,
        targetCol: 0
      },
      rows: [
        { placa: "AAA1A11", status: "novo" },
        { placa: "BBB2B22", status: "usado" }
      ]
    });

    const rerendered = renderFeedIntoPage({
      page: firstRender,
      feed: {
        id: "feed-1",
        table: "carros" as never,
        columns: ["placa"],
        columnLabels: {
          placa: "Placa"
        },
        targetRow: 3,
        targetCol: 2
      },
      rows: [{ placa: "CCC3C33" }]
    });

    expect(rerendered.cells[cellKey(0, 0)]).toBeUndefined();
    expect(rerendered.cells[cellKey(0, 1)]).toBeUndefined();
    expect(rerendered.cells[cellKey(1, 0)]).toBeUndefined();
    expect(rerendered.cells[cellKey(1, 1)]).toBeUndefined();
    expect(rerendered.cells[cellKey(2, 0)]).toBeUndefined();
    expect(rerendered.cells[cellKey(2, 1)]).toBeUndefined();
    expect(rerendered.cells[cellKey(3, 2)]).toMatchObject({ value: "Placa", feedId: "feed-1" });
    expect(rerendered.cells[cellKey(4, 2)]).toMatchObject({ value: "CCC3C33", feedId: "feed-1" });
    expect(rerendered.feeds).toHaveLength(1);
    expect(rerendered.feeds[0]?.id).toBe("feed-1");
  });

  it("truncates feed writes to the capped page bounds", () => {
    const basePage = {
      ...createPlaygroundPage(1),
      rowCount: PLAYGROUND_MAX_ROWS - 1,
      colCount: PLAYGROUND_MAX_COLS - 1
    };

    const rendered = renderFeedIntoPage({
      page: basePage,
      feed: {
        id: "feed-edge",
        table: "carros" as never,
        columns: ["visible", "hidden"],
        columnLabels: {
          visible: "Visible",
          hidden: "Hidden"
        },
        targetRow: PLAYGROUND_MAX_ROWS - 1,
        targetCol: PLAYGROUND_MAX_COLS - 1
      },
      rows: [{ visible: "ok", hidden: "out" }]
    });

    expect(rendered.rowCount).toBe(PLAYGROUND_MAX_ROWS);
    expect(rendered.colCount).toBe(PLAYGROUND_MAX_COLS);
    expect(rendered.cells[cellKey(PLAYGROUND_MAX_ROWS - 1, PLAYGROUND_MAX_COLS - 1)]).toMatchObject({
      value: "Visible",
      feedId: "feed-edge"
    });
    expect(rendered.cells[cellKey(PLAYGROUND_MAX_ROWS - 1, PLAYGROUND_MAX_COLS)]).toBeUndefined();
    expect(rendered.cells[cellKey(PLAYGROUND_MAX_ROWS, PLAYGROUND_MAX_COLS - 1)]).toBeUndefined();

    for (const key of Object.keys(rendered.cells)) {
      const [row, col] = key.split(":").map(Number);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(rendered.rowCount);
      expect(col).toBeLessThan(rendered.colCount);
    }
  });

  it("removes feed cells without touching unrelated content", () => {
    const rendered = renderFeedIntoPage({
      page: createPlaygroundPage(1),
      feed: {
        id: "feed-1",
        table: "carros" as never,
        columns: ["placa"],
        columnLabels: {
          placa: "Placa"
        },
        targetRow: 1,
        targetCol: 1
      },
      rows: [{ placa: "AAA1A11" }]
    });

    rendered.cells[cellKey(0, 0)] = { value: "manual" };

    const cleaned = removeFeedFromPage(rendered, "feed-1");

    expect(cleaned.cells[cellKey(0, 0)]).toMatchObject({ value: "manual" });
    expect(cleaned.cells[cellKey(1, 1)]).toBeUndefined();
    expect(cleaned.cells[cellKey(2, 1)]).toBeUndefined();
    expect(cleaned.feeds).toHaveLength(0);
  });

  it("upserts feed definitions without materializing live rows into cells", () => {
    const result = upsertFeedDefinitionInPage({
      page: createPlaygroundPage(1),
      feed: {
        id: "feed-1",
        table: "carros" as never,
        columns: ["placa", "local"],
        columnLabels: {
          placa: "Placa",
          local: "Local"
        },
        targetRow: 3,
        targetCol: 2,
        query: {
          ...DEFAULT_PLAYGROUND_FEED_QUERY,
          pageSize: 25,
          filters: {
            local: "=loja_3"
          }
        }
      }
    });

    expect(result.page.cells).toEqual({});
    expect(result.feed).toMatchObject({
      id: "feed-1",
      position: { row: 3, col: 2 },
      targetRow: 3,
      targetCol: 2,
      query: {
        pageSize: 25,
        filters: {
          local: "=loja_3"
        }
      }
    });
    expect(result.page.feeds).toHaveLength(1);
  });

  it("clears styles and computes the actual used range", () => {
    const painted = paintSelection(
      createPlaygroundPage(1),
      {
        startRow: 2,
        startCol: 3,
        endRow: 3,
        endCol: 4
      },
      {
        background: "#ffe8a3",
        color: "#0f172a",
        bold: true
      }
    );

    const withValue = {
      ...painted,
      cells: {
        ...painted.cells,
        [cellKey(5, 6)]: { value: "ok" }
      }
    };

    expect(getActualUsedRange(withValue)).toEqual({
      startRow: 2,
      startCol: 3,
      endRow: 5,
      endCol: 6
    });

    const cleared = clearSelectionStyle(
      withValue,
      {
        startRow: 2,
        startCol: 3,
        endRow: 3,
        endCol: 4
      }
    );

    expect(cleared.cells[cellKey(2, 3)]).toBeUndefined();
    expect(cleared.cells[cellKey(3, 4)]).toBeUndefined();
    expect(getActualUsedRange(cleared)).toEqual({
      startRow: 5,
      startCol: 6,
      endRow: 5,
      endCol: 6
    });
  });

  it("clears values in a selection while preserving feed ownership and styles", () => {
    const page = {
      ...createPlaygroundPage(1),
      cells: {
        [cellKey(0, 0)]: {
          value: "manual"
        },
        [cellKey(0, 1)]: {
          value: "styled",
          style: { background: "#fff3a6" }
        },
        [cellKey(0, 2)]: {
          value: "fed",
          feedId: "feed-1"
        }
      }
    };

    const cleared = clearSelectionValues(page, {
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 2
    });

    expect(cleared.cells[cellKey(0, 0)]).toBeUndefined();
    expect(cleared.cells[cellKey(0, 1)]).toMatchObject({
      value: "",
      style: { background: "#fff3a6" }
    });
    expect(cleared.cells[cellKey(0, 2)]).toMatchObject({
      value: "",
      feedId: "feed-1"
    });
  });

  it("trims out-of-bounds feeds and hidden metadata when shrinking the page", () => {
    const page = {
      ...createPlaygroundPage(1),
      rowCount: 20,
      colCount: 10,
      cells: {
        [cellKey(4, 4)]: { value: "keep" },
        [cellKey(19, 9)]: { value: "drop" }
      },
      rowHeights: {
        "4": 34,
        "19": 40
      },
      columnWidths: {
        "4": 140,
        "9": 180
      },
      hiddenRows: {
        "3": true,
        "19": true
      },
      hiddenColumns: {
        "2": true,
        "9": true
      },
      feeds: [
        testFeed({
          id: "feed-keep",
          table: "carros" as never,
          columns: ["placa"],
          columnLabels: {
            placa: "Placa"
          },
          targetRow: 4,
          targetCol: 4,
          renderedAt: new Date().toISOString()
        }),
        testFeed({
          id: "feed-drop",
          table: "carros" as never,
          columns: ["placa"],
          columnLabels: {
            placa: "Placa"
          },
          targetRow: 18,
          targetCol: 9,
          renderedAt: new Date().toISOString()
        })
      ]
    };

    const trimmed = trimPageSize(page, 8, 5);

    expect(trimmed.cells[cellKey(4, 4)]).toMatchObject({ value: "keep" });
    expect(trimmed.cells[cellKey(19, 9)]).toBeUndefined();
    expect(trimmed.rowHeights).toEqual({ "4": 34 });
    expect(trimmed.columnWidths).toEqual({ "4": 140 });
    expect(trimmed.hiddenRows).toEqual({ "3": true });
    expect(trimmed.hiddenColumns).toEqual({ "2": true });
    expect(trimmed.feeds.map((feed) => feed.id)).toEqual(["feed-keep"]);
  });

  it("resizes multiple columns and rows in one operation", () => {
    const page = createPlaygroundPage(1);
    const resized = resizeRows(resizeColumns(page, [0, 1, 2], 156), [0, 3], 44);

    expect(resized.columnWidths).toMatchObject({
      "0": 156,
      "1": 156,
      "2": 156
    });
    expect(resized.rowHeights).toMatchObject({
      "0": 44,
      "3": 44
    });
  });

  it("calculates autofit sizes from materialized cell content", () => {
    const page = {
      ...createPlaygroundPage(1),
      cells: {
        [cellKey(0, 1)]: { value: "conteudo bem mais longo" },
        [cellKey(2, 0)]: { value: "linha 1\nlinha 2\nlinha 3" }
      }
    };

    const widths = calculateAutoColumnWidths(page, [0, 1]);
    const heights = calculateAutoRowHeights(page, [0, 2]);
    const applied = applyRowHeights(applyColumnWidths(page, widths), heights);

    expect(widths["1"]).toBeGreaterThan(widths["0"]);
    expect(heights["2"]).toBeGreaterThan(heights["0"]);
    expect(applied.columnWidths["1"]).toBe(widths["1"]);
    expect(applied.rowHeights["2"]).toBe(heights["2"]);
  });

  it("hides and restores rows and columns", () => {
    const page = createPlaygroundPage(1);
    const hidden = hideColumns(hideRows(page, [1, 3]), [2, 4]);

    expect(hidden.hiddenRows).toEqual({
      "1": true,
      "3": true
    });
    expect(hidden.hiddenColumns).toEqual({
      "2": true,
      "4": true
    });
    expect(showAllRows(hidden).hiddenRows).toEqual({});
    expect(showAllColumns(hidden).hiddenColumns).toEqual({});
  });
});
