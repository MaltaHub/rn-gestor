import { describe, expect, it } from "vitest";
import { buildGridRect, gridPositionToPixels } from "@/components/playground/domain/geometry";
import {
  findNearestAvailableGridPosition,
  gridRectsOverlap,
  isGridPlacementAvailable
} from "@/components/playground/domain/collision";
import {
  DEFAULT_PLAYGROUND_FEED_QUERY,
  buildCombinedFragmentFeedQuery,
  buildFeedFilterExpressionFromSelection,
  buildExcludedValuesExpression,
  buildFragmentFeedQuery,
  buildGroupedFragmentValueLiteral,
  buildParentFeedQueryExcludingFragments,
  normalizeFeedQuery,
  parseFeedFilterSelection,
  toggleFeedSort,
  withFeedFilterSelection
} from "@/components/playground/domain/feed-query";
import {
  createFeedFragments,
  createGroupedFeedFragment,
  removeFeedFragment
} from "@/components/playground/domain/feed-fragments";
import {
  buildPlaygroundFeedCellIndex,
  buildPlaygroundFeedDataTargets,
  buildPlaygroundFeedRequestKey,
  stableStringify
} from "@/components/playground/domain/feed-data";
import {
  buildFeedTargetGridRect,
  getFeedTargetGridSize,
  moveFeedTargetInPage
} from "@/components/playground/domain/feed-placement";
import {
  applyAreaResizePlan,
  buildAreaRect,
  calculateAreaResizePlan,
  type PlaygroundArea
} from "@/components/playground/domain/playground-area";
import { normalizeCellStyle, sanitizeStyleColor } from "@/components/playground/domain/cell-style";
import type { PlaygroundFeed, PlaygroundPage } from "@/components/playground/types";

function feedFixture(): PlaygroundFeed {
  return {
    id: "feed-1",
    table: "carros" as never,
    position: { row: 1, col: 1 },
    columns: ["placa", "local"],
    columnLabels: {
      placa: "Placa",
      local: "Loja"
    },
    query: {
      ...DEFAULT_PLAYGROUND_FEED_QUERY,
      filters: {
        estado_venda: "=DISPONIVEL"
      },
      pageSize: 25
    },
    displayColumnOverrides: {
      modelo_id: "modelo"
    },
    showPaginationInHeader: false,
    hideColumnHeader: false,
    hidden: false,
    fragments: [],
    anchorFilterColumns: [],
    targetRow: 1,
    targetCol: 1,
    renderedAt: "2026-04-27T00:00:00.000Z"
  };
}

describe("playground domain geometry and collision", () => {
  it("detects overlap and rejects occupied placements", () => {
    const occupied = buildGridRect({ row: 2, col: 2 }, { rowSpan: 3, colSpan: 2 });
    const candidate = buildGridRect({ row: 4, col: 3 }, { rowSpan: 2, colSpan: 2 });

    expect(gridRectsOverlap(occupied, candidate)).toBe(true);
    expect(isGridPlacementAvailable(candidate, { rowCount: 10, colCount: 10 }, [occupied])).toBe(false);
  });

  it("snaps to the nearest free position inside bounds", () => {
    const occupied = [
      buildGridRect({ row: 0, col: 0 }, { rowSpan: 2, colSpan: 2 }),
      buildGridRect({ row: 0, col: 2 }, { rowSpan: 2, colSpan: 2 })
    ];

    expect(
      findNearestAvailableGridPosition({
        desiredPosition: { row: 0, col: 1 },
        size: { rowSpan: 2, colSpan: 2 },
        bounds: { rowCount: 6, colCount: 6 },
        occupiedRects: occupied
      })
    ).toEqual({ row: 2, col: 1 });
  });

  it("converts grid position to pixels from track metrics", () => {
    expect(
      gridPositionToPixels(
        { row: 2, col: 2 },
        {
          rowHeights: { "0": 20, "1": 30 },
          columnWidths: { "0": 50 },
          defaultRowHeight: 10,
          defaultColumnWidth: 25,
          rowHeaderWidth: 40,
          columnHeaderHeight: 18
        }
      )
    ).toEqual({ top: 68, left: 115 });
  });
});

describe("playground feed query domain", () => {
  it("normalizes invalid query state", () => {
    expect(
      normalizeFeedQuery({
        matchMode: "invalid" as never,
        page: -1,
        pageSize: 999,
        filters: { placa: "=ABC1234" },
        sort: [{ column: "placa", dir: "asc" }, { column: "bad", dir: "sideways" as never }]
      })
    ).toMatchObject({
      matchMode: "contains",
      page: 1,
      pageSize: 200,
      filters: { placa: "=ABC1234" },
      sort: [{ column: "placa", dir: "asc" }]
    });
  });

  it("builds parent exclusions and fragment filters", () => {
    const parent = {
      ...DEFAULT_PLAYGROUND_FEED_QUERY,
      filters: { estado_venda: "=DISPONIVEL" }
    };

    expect(buildExcludedValuesExpression(["loja_3", "loja_5", "loja_3"])).toBe("EXCETO loja_3|loja_5");
    expect(
      buildParentFeedQueryExcludingFragments({
        parentQuery: parent,
        sourceColumn: "local",
        valueLiterals: ["loja_3"]
      }).filters
    ).toEqual({
      estado_venda: "=DISPONIVEL",
      local: "EXCETO loja_3"
    });
    expect(
      buildFragmentFeedQuery({
        parentQuery: parent,
        sourceColumn: "local",
        valueLiteral: "loja_3"
      }).filters
    ).toEqual({
      estado_venda: "=DISPONIVEL",
      local: "=loja_3"
    });
  });

  it("updates isolated feed filters and sort rules", () => {
    const query = {
      ...DEFAULT_PLAYGROUND_FEED_QUERY,
      filters: { local: "=Loja 1" },
      sort: []
    };

    expect(parseFeedFilterSelection("=AAA1A11")).toEqual(["AAA1A11"]);
    expect(parseFeedFilterSelection("AAA1A11|BBB2B22")).toEqual(["AAA1A11", "BBB2B22"]);
    expect(parseFeedFilterSelection("EXCETO Loja 3")).toEqual([]);
    expect(buildFeedFilterExpressionFromSelection(["AAA1A11"])).toBe("=AAA1A11");
    expect(buildFeedFilterExpressionFromSelection(["AAA1A11", "BBB2B22"])).toBe("AAA1A11|BBB2B22");

    expect(withFeedFilterSelection(query, "placa", ["AAA1A11"]).filters).toEqual({
      local: "=Loja 1",
      placa: "=AAA1A11"
    });
    expect(withFeedFilterSelection(query, "local", []).filters).toEqual({});
    expect(toggleFeedSort(query, "placa", false).sort).toEqual([{ column: "placa", dir: "asc" }]);
    expect(toggleFeedSort({ ...query, sort: [{ column: "placa", dir: "asc" }] }, "placa", false).sort).toEqual([
      { column: "placa", dir: "desc" }
    ]);
    expect(toggleFeedSort({ ...query, sort: [{ column: "placa", dir: "desc" }] }, "placa", false).sort).toEqual([]);

    // Sort agora acumula: clicar uma nova coluna anexa ao final da cadeia (não reseta).
    expect(
      toggleFeedSort({ ...query, sort: [{ column: "placa", dir: "asc" }] }, "local", false).sort
    ).toEqual([
      { column: "placa", dir: "asc" },
      { column: "local", dir: "asc" }
    ]);
  });

  it("builds isolated feed data targets and stable request keys", () => {
    const feed = {
      ...feedFixture(),
      anchorFilterColumns: ["estado_venda"],
      fragments: createFeedFragments({
        feed: feedFixture(),
        sourceColumn: "local",
        options: [{ literal: "loja_3", label: "Loja 3" }],
        selectedLiterals: ["loja_3"],
        positionForIndex: () => ({ row: 10, col: 1 }),
        createId: () => "fragment-1"
      })
    };

    const targets = buildPlaygroundFeedDataTargets([feed]);

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      id: "feed-1",
      kind: "feed",
      query: {
        filters: {
          estado_venda: "=DISPONIVEL",
          local: "EXCETO loja_3"
        }
      },
      lockedFilterColumns: ["local", "estado_venda"]
    });
    expect(targets[1]).toMatchObject({
      id: "fragment-1",
      kind: "fragment",
      feedId: "feed-1",
      position: { row: 10, col: 1 },
      query: {
        filters: {
          estado_venda: "=DISPONIVEL",
          local: "=loja_3"
        }
      },
      lockedFilterColumns: ["local", "estado_venda"]
    });
    expect(buildPlaygroundFeedRequestKey(targets[0])).toBe(buildPlaygroundFeedRequestKey({ ...targets[0] }));
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("forces parent anchor filters onto fragments even when fragment query drifted", () => {
    const parent: PlaygroundFeed = {
      ...feedFixture(),
      query: {
        ...DEFAULT_PLAYGROUND_FEED_QUERY,
        filters: { estado_venda: "=NOVO" }
      },
      anchorFilterColumns: ["estado_venda"],
      fragments: [
        {
          id: "fragment-drift",
          parentFeedId: "feed-1",
          sourceColumn: "local",
          valueLiteral: "loja_3",
          valueLabel: "Loja 3",
          position: { row: 12, col: 1 },
          query: {
            ...DEFAULT_PLAYGROUND_FEED_QUERY,
            // Drifted: fragment stored a stale anchor expression
            filters: { estado_venda: "=USADO", local: "=loja_3" }
          },
          displayColumnOverrides: {}
        }
      ]
    };

    const targets = buildPlaygroundFeedDataTargets([parent]);
    const fragmentTarget = targets.find((target) => target.kind === "fragment");

    expect(fragmentTarget).toBeDefined();
    expect(fragmentTarget?.query.filters).toMatchObject({
      estado_venda: "=NOVO",
      local: "=loja_3"
    });
    expect(fragmentTarget?.lockedFilterColumns).toContain("estado_venda");
    expect(fragmentTarget?.lockedFilterColumns).toContain("local");
  });

  it("projects cached feed rows into transient cells", () => {
    const target = buildPlaygroundFeedDataTargets([feedFixture()])[0];
    const cells = buildPlaygroundFeedCellIndex(
      [target],
      {
        [target.id]: [
          {
            placa: "ABC1D23",
            local: "loja_3"
          }
        ]
      }
    );

    expect(cells["1:1"]).toMatchObject({ value: "Placa", feedId: "feed-1" });
    expect(cells["1:2"]).toMatchObject({ value: "Loja", feedId: "feed-1" });
    expect(cells["2:1"]).toMatchObject({ value: "ABC1D23", feedId: "feed-1" });
    expect(cells["2:2"]).toMatchObject({ value: "loja_3", feedId: "feed-1" });
  });

  it("preserves manual cell styles over projected feed values", () => {
    const target = buildPlaygroundFeedDataTargets([feedFixture()])[0];
    const cells = buildPlaygroundFeedCellIndex(
      [target],
      {
        [target.id]: [
          {
            placa: "ABC1D23",
            local: "loja_3"
          }
        ]
      },
      {
        "2:1": {
          value: "",
          style: {
            background: "#ffe08a",
            color: "#111827",
            bold: true
          }
        }
      }
    );

    expect(cells["2:1"]).toMatchObject({
      value: "ABC1D23",
      feedId: "feed-1",
      style: {
        background: "#ffe08a",
        color: "#111827",
        bold: true
      }
    });
  });

  it("projects FK display overrides through relation lookup", () => {
    const target = buildPlaygroundFeedDataTargets([
      {
        ...feedFixture(),
        columns: ["modelo_id"],
        columnLabels: { modelo_id: "Modelo" },
        displayColumnOverrides: { modelo_id: "nome" }
      }
    ])[0];
    const cells = buildPlaygroundFeedCellIndex(
      [target],
      {
        [target.id]: [{ modelo_id: "modelo-1" }]
      },
      {},
      {
        [target.id]: {
          modelo_id: {
            "modelo-1": "Civic"
          }
        }
      }
    );

    expect(cells["2:1"]).toMatchObject({ value: "Civic", feedId: "feed-1" });
  });

  it("builds bounded placement rects and moves parent feeds", () => {
    const target = buildPlaygroundFeedDataTargets([feedFixture()])[0];
    const page: PlaygroundPage = {
      id: "page-1",
      name: "Pagina 1",
      rowCount: 80,
      colCount: 26,
      cells: {},
      rowHeights: {},
      columnWidths: {},
      hiddenRows: {},
      hiddenColumns: {},
      feeds: [feedFixture()],
      updatedAt: "2026-04-27T00:00:00.000Z"
    };

    expect(getFeedTargetGridSize(target)).toEqual({ rowSpan: 12, colSpan: 2 });
    expect(buildFeedTargetGridRect(target)).toEqual({ row: 1, col: 1, rowSpan: 12, colSpan: 2 });

    const moved = moveFeedTargetInPage({
      page,
      target,
      position: { row: 8, col: 5 }
    });

    expect(moved.feeds[0]).toMatchObject({
      position: { row: 8, col: 5 },
      targetRow: 8,
      targetCol: 5
    });
  });

  it("moves fragments without moving the parent feed", () => {
    const feed = {
      ...feedFixture(),
      fragments: createFeedFragments({
        feed: feedFixture(),
        sourceColumn: "local",
        options: [{ literal: "loja_3", label: "Loja 3" }],
        selectedLiterals: ["loja_3"],
        positionForIndex: () => ({ row: 10, col: 1 }),
        createId: () => "fragment-1"
      })
    };
    const fragmentTarget = buildPlaygroundFeedDataTargets([feed]).find((target) => target.kind === "fragment");
    const page: PlaygroundPage = {
      id: "page-1",
      name: "Pagina 1",
      rowCount: 80,
      colCount: 26,
      cells: {},
      rowHeights: {},
      columnWidths: {},
      hiddenRows: {},
      hiddenColumns: {},
      feeds: [feed],
      updatedAt: "2026-04-27T00:00:00.000Z"
    };

    if (!fragmentTarget) throw new Error("missing fragment target");

    const moved = moveFeedTargetInPage({
      page,
      target: fragmentTarget,
      position: { row: 14, col: 6 }
    });

    expect(moved.feeds[0]).toMatchObject({
      position: { row: 1, col: 1 },
      targetRow: 1,
      targetCol: 1
    });
    expect(moved.feeds[0]?.fragments[0]).toMatchObject({
      id: "fragment-1",
      position: { row: 14, col: 6 }
    });
  });
});

describe("playground fragment and style domain", () => {
  it("creates and removes feed fragments", () => {
    const feed = feedFixture();
    const fragments = createFeedFragments({
      feed,
      sourceColumn: "local",
      options: [
        { literal: "loja_1", label: "Loja 1" },
        { literal: "loja_3", label: "Loja 3" }
      ],
      selectedLiterals: ["loja_3"],
      positionForIndex: (index) => ({ row: 4 + index, col: 6 }),
      createId: (index) => `fragment-${index}`
    });

    expect(fragments).toHaveLength(1);
    expect(fragments[0]).toMatchObject({
      id: "fragment-0",
      parentFeedId: "feed-1",
      sourceColumn: "local",
      valueLiteral: "loja_3",
      valueLabel: "Loja 3",
      position: { row: 4, col: 6 },
      query: {
        filters: {
          estado_venda: "=DISPONIVEL",
          local: "=loja_3"
        },
        pageSize: 25
      }
    });

    expect(removeFeedFragment({ ...feed, fragments }, "fragment-0").fragments).toEqual([]);
  });

  it("builds combined fragment query and grouped literal key", () => {
    expect(buildGroupedFragmentValueLiteral(["loja_2", "loja_1", "loja_1", "  "])).toBe("loja_1|loja_2");

    const grouped = buildCombinedFragmentFeedQuery({
      parentQuery: {
        ...DEFAULT_PLAYGROUND_FEED_QUERY,
        filters: { estado_venda: "=DISPONIVEL" }
      },
      sourceColumn: "local",
      valueLiterals: ["loja_1", "loja_2"]
    });

    expect(grouped.filters).toEqual({
      estado_venda: "=DISPONIVEL",
      local: "loja_1|loja_2"
    });
  });

  it("creates a single grouped fragment aggregating selected literals", () => {
    const feed = feedFixture();
    const fragment = createGroupedFeedFragment({
      feed,
      sourceColumn: "local",
      options: [
        { literal: "loja_1", label: "Loja 1" },
        { literal: "loja_2", label: "Loja 2" },
        { literal: "loja_3", label: "Loja 3" }
      ],
      selectedLiterals: ["loja_1", "loja_3"],
      position: { row: 4, col: 6 },
      id: "fragment-grouped"
    });

    expect(fragment).not.toBeNull();
    expect(fragment).toMatchObject({
      id: "fragment-grouped",
      parentFeedId: "feed-1",
      sourceColumn: "local",
      valueLiteral: "loja_1|loja_3",
      valueLabel: "Loja 1, Loja 3",
      position: { row: 4, col: 6 },
      query: {
        filters: {
          estado_venda: "=DISPONIVEL",
          local: "loja_1|loja_3"
        },
        pageSize: 25
      }
    });
  });

  it("returns null when no selected literals match the available options", () => {
    const feed = feedFixture();
    expect(
      createGroupedFeedFragment({
        feed,
        sourceColumn: "local",
        options: [{ literal: "loja_1", label: "Loja 1" }],
        selectedLiterals: ["loja_99"],
        position: { row: 0, col: 0 },
        id: "fragment-empty"
      })
    ).toBeNull();
  });

  it("normalizes cell styles", () => {
    expect(sanitizeStyleColor("#abc")).toBe("#aabbcc");
    expect(
      normalizeCellStyle({
        background: "#ABCDEF",
        color: "invalid",
        bold: true
      })
    ).toEqual({
      background: "#abcdef",
      bold: true
    });
  });
});

describe("playground area resize domain", () => {
  function areaFixture(partial: Partial<PlaygroundArea> & Pick<PlaygroundArea, "id" | "origin">): PlaygroundArea {
    return {
      kind: "feed",
      size: {
        rows: 3,
        cols: 3
      },
      ...partial
    };
  }

  function pageFixture(): PlaygroundPage {
    return {
      id: "page-1",
      name: "Pagina 1",
      rowCount: 30,
      colCount: 12,
      cells: {},
      rowHeights: {},
      columnWidths: {},
      hiddenRows: {},
      hiddenColumns: {},
      feeds: [],
      updatedAt: "2026-04-27T00:00:00.000Z"
    };
  }

  it("builds area rects from origin and size", () => {
    expect(buildAreaRect(areaFixture({ id: "area-1", origin: { row: 2, col: 3 }, size: { rows: 4, cols: 2 } }))).toEqual({
      row: 2,
      col: 3,
      rowSpan: 4,
      colSpan: 2
    });
  });

  it("expands by shifting only cells inside the affected column range", () => {
    const page = {
      ...pageFixture(),
      cells: {
        "5:2": { value: "inside" },
        "5:7": { value: "parallel" }
      }
    };
    const plan = calculateAreaResizePlan({
      page,
      areas: [areaFixture({ id: "feed-a", origin: { row: 2, col: 2 }, size: { rows: 3, cols: 3 } })],
      areaId: "feed-a",
      nextRows: 5,
      mode: "shift-range"
    });

    expect(plan.deltaRows).toBe(2);
    expect(plan.affectedColumns).toEqual({ startCol: 2, endCol: 4 });
    expect(plan.movedCells).toEqual([
      {
        key: "5:2",
        from: { row: 5, col: 2 },
        to: { row: 7, col: 2 }
      }
    ]);

    const applied = applyAreaResizePlan(page, plan);
    expect(applied.cells["7:2"]).toMatchObject({ value: "inside" });
    expect(applied.cells["5:2"]).toBeUndefined();
    expect(applied.cells["5:7"]).toMatchObject({ value: "parallel" });
  });

  it("contracts by pulling only cells inside the affected column range", () => {
    const page = {
      ...pageFixture(),
      cells: {
        "4:2": { value: "old area style" },
        "7:3": { value: "below" },
        "7:8": { value: "parallel" }
      }
    };
    const plan = calculateAreaResizePlan({
      page,
      areas: [areaFixture({ id: "feed-a", origin: { row: 1, col: 2 }, size: { rows: 5, cols: 3 } })],
      areaId: "feed-a",
      nextRows: 3,
      mode: "shift-range"
    });

    expect(plan.deltaRows).toBe(-2);
    expect(plan.removedCells.map((cell) => cell.key)).toEqual(["4:2"]);
    expect(plan.movedCells).toEqual([
      {
        key: "7:3",
        from: { row: 7, col: 3 },
        to: { row: 5, col: 3 }
      }
    ]);

    const applied = applyAreaResizePlan(page, plan);
    expect(applied.cells["4:2"]).toBeUndefined();
    expect(applied.cells["5:3"]).toMatchObject({ value: "below" });
    expect(applied.cells["7:8"]).toMatchObject({ value: "parallel" });
  });

  it("moves intersecting downstream areas while preserving horizontal parallels", () => {
    const areas = [
      areaFixture({ id: "feed-a", origin: { row: 1, col: 2 }, size: { rows: 4, cols: 3 } }),
      areaFixture({ id: "feed-b", origin: { row: 6, col: 3 }, size: { rows: 2, cols: 2 } }),
      areaFixture({ id: "feed-parallel", origin: { row: 6, col: 8 }, size: { rows: 2, cols: 2 } })
    ];
    const plan = calculateAreaResizePlan({
      page: pageFixture(),
      areas,
      areaId: "feed-a",
      nextRows: 6,
      mode: "shift-range"
    });

    expect(plan.movedAreas).toEqual([
      {
        areaId: "feed-b",
        from: { row: 6, col: 3 },
        to: { row: 8, col: 3 },
        partiallyIntersectsColumns: false
      }
    ]);
  });

  it("marks crossing areas as conflicts instead of splitting them", () => {
    const plan = calculateAreaResizePlan({
      page: pageFixture(),
      areas: [
        areaFixture({ id: "feed-a", origin: { row: 1, col: 2 }, size: { rows: 4, cols: 3 } }),
        areaFixture({ id: "crossing", origin: { row: 4, col: 3 }, size: { rows: 4, cols: 2 } })
      ],
      areaId: "feed-a",
      nextRows: 6,
      mode: "shift-range"
    });

    expect(plan.safeToApply).toBe(false);
    expect(plan.conflicts[0]).toMatchObject({
      kind: "resize_boundary_crossed",
      areaIds: ["crossing"]
    });
  });

  it("keeps fixed mode structural changes local to the area", () => {
    const plan = calculateAreaResizePlan({
      page: {
        ...pageFixture(),
        cells: {
          "5:2": { value: "inside" }
        }
      },
      areas: [areaFixture({ id: "feed-a", origin: { row: 2, col: 2 }, size: { rows: 3, cols: 3 } })],
      areaId: "feed-a",
      nextRows: 6,
      mode: "fixed"
    });

    expect(plan.deltaRows).toBe(3);
    expect(plan.movedCells).toEqual([]);
    expect(plan.movedAreas).toEqual([]);
    expect(plan.safeToApply).toBe(true);
  });
});
