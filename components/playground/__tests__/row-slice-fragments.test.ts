import { describe, expect, it } from "vitest";
import { createRowSliceFragment } from "@/components/playground/domain/feed-fragments";
import { DEFAULT_PLAYGROUND_FEED_QUERY } from "@/components/playground/domain/feed-query";
import type { PlaygroundFeed } from "@/components/playground/types";

const feed: PlaygroundFeed = {
  id: "feed-a",
  table: "carros",
  title: undefined,
  position: { row: 0, col: 0 },
  columns: ["placa", "modelo_id"],
  columnLabels: { placa: "Placa", modelo_id: "Modelo" },
  query: { ...DEFAULT_PLAYGROUND_FEED_QUERY, pageSize: 100, sort: [{ column: "placa", dir: "asc" }] },
  displayColumnOverrides: {},
  showPaginationInHeader: false,
  hideColumnHeader: false,
  hidden: false,
  fragments: [],
  prochColumns: [],
  anchorFilterColumns: [],
  targetRow: 0,
  targetCol: 0,
  renderedAt: "2026-06-01T00:00:00.000Z"
};

describe("createRowSliceFragment", () => {
  it("recorta o bloco com page/pageSize e rotula o intervalo", () => {
    const fragment = createRowSliceFragment({
      feed,
      page: 2,
      rowsPerBlock: 10,
      totalRows: 25,
      position: { row: 5, col: 0 },
      id: "frag-2"
    });

    expect(fragment.kind).toBe("rows");
    expect(fragment.sourceColumn).toBe("");
    expect(fragment.valueLabel).toBe("Linhas 11-20");
    expect(fragment.query.page).toBe(2);
    expect(fragment.query.pageSize).toBe(10);
    // Herda sort/filtros do pai.
    expect(fragment.query.sort).toEqual([{ column: "placa", dir: "asc" }]);
  });

  it("o ultimo bloco para no total de linhas", () => {
    const fragment = createRowSliceFragment({
      feed,
      page: 3,
      rowsPerBlock: 10,
      totalRows: 25,
      position: { row: 0, col: 0 },
      id: "frag-3"
    });

    expect(fragment.valueLabel).toBe("Linhas 21-25");
  });
});
