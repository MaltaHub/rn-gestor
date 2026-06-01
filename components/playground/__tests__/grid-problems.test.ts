import { describe, expect, it } from "vitest";
import { detectPlaygroundProblems, getRenderedFeedRect } from "@/components/playground/domain/grid-problems";
import { DEFAULT_PLAYGROUND_FEED_QUERY } from "@/components/playground/domain/feed-query";
import type { PlaygroundFeedDataRecord, PlaygroundFeedDataTarget } from "@/components/playground/domain/feed-data";
import type { PlaygroundCell } from "@/components/playground/types";

function makeTarget(partial: {
  id: string;
  row: number;
  col: number;
  columns: string[];
  hideColumnHeader?: boolean;
  title?: string;
}): PlaygroundFeedDataTarget {
  return {
    id: partial.id,
    feedId: partial.id,
    kind: "feed",
    table: "carros",
    title: partial.title,
    position: { row: partial.row, col: partial.col },
    columns: partial.columns,
    columnLabels: Object.fromEntries(partial.columns.map((column) => [column, column])),
    query: DEFAULT_PLAYGROUND_FEED_QUERY,
    displayColumnOverrides: {},
    showPaginationInHeader: false,
    hideColumnHeader: partial.hideColumnHeader ?? false,
    lockedFilterColumns: [],
    prochColumns: []
  };
}

function makeRecord(targetId: string, rowCount: number): PlaygroundFeedDataRecord {
  return {
    targetId,
    requestKey: targetId,
    rows: Array.from({ length: rowCount }, (_value, index) => ({ id: index })),
    totalRows: rowCount,
    status: "ready",
    loadedAt: "2026-06-01T00:00:00.000Z"
  };
}

const emptyCell: Record<string, PlaygroundCell> = {};

describe("getRenderedFeedRect", () => {
  it("usa o numero real de linhas carregadas (linhas + cabecalho)", () => {
    const target = makeTarget({ id: "a", row: 2, col: 1, columns: ["c1", "c2"] });
    const rect = getRenderedFeedRect(target, makeRecord("a", 5));
    expect(rect).toEqual({ row: 2, col: 1, rowSpan: 6, colSpan: 2 });
  });

  it("sem cabecalho, o span e exatamente o numero de linhas", () => {
    const target = makeTarget({ id: "a", row: 0, col: 0, columns: ["c1"], hideColumnHeader: true });
    const rect = getRenderedFeedRect(target, makeRecord("a", 4));
    expect(rect.rowSpan).toBe(4);
  });
});

describe("detectPlaygroundProblems", () => {
  it("nao aponta problema quando nada colide nem ha valor encoberto", () => {
    const a = makeTarget({ id: "a", row: 0, col: 0, columns: ["c1"] });
    const b = makeTarget({ id: "b", row: 0, col: 5, columns: ["c1"] });
    const problems = detectPlaygroundProblems({
      targets: [a, b],
      recordsByTargetId: { a: makeRecord("a", 2), b: makeRecord("b", 2) },
      feedDisplayCells: { "0:0": { value: "header" }, "0:5": { value: "header" } },
      manualCells: emptyCell
    });
    expect(problems).toEqual([]);
  });

  it("aponta valor manual encoberto por alimentador", () => {
    const a = makeTarget({ id: "a", row: 0, col: 0, columns: ["c1"] });
    const problems = detectPlaygroundProblems({
      targets: [a],
      recordsByTargetId: { a: makeRecord("a", 1) },
      feedDisplayCells: { "0:0": { value: "Modelo" }, "1:0": { value: "Gol" } },
      // O usuario digitou algo na celula que o feed agora cobre.
      manualCells: { "1:0": { value: "valor manual" } }
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("covered");
    expect(problems[0].row).toBe(1);
    expect(problems[0].col).toBe(0);
  });

  it("ignora celula manual vazia sob o feed", () => {
    const a = makeTarget({ id: "a", row: 0, col: 0, columns: ["c1"] });
    const problems = detectPlaygroundProblems({
      targets: [a],
      recordsByTargetId: { a: makeRecord("a", 1) },
      feedDisplayCells: { "1:0": { value: "Gol" } },
      manualCells: { "1:0": { value: "   " } }
    });
    expect(problems).toEqual([]);
  });

  it("detecta sobreposicao entre alimentadores usando o tamanho real", () => {
    // A: cols 0-1, 5 linhas + header => linhas 0..5.
    const a = makeTarget({ id: "a", row: 0, col: 0, columns: ["c1", "c2"], title: "Topo" });
    // B comeca na linha 3, col 0 => invade A apos crescer.
    const b = makeTarget({ id: "b", row: 3, col: 0, columns: ["x"], title: "Baixo" });
    const problems = detectPlaygroundProblems({
      targets: [a, b],
      recordsByTargetId: { a: makeRecord("a", 5), b: makeRecord("b", 2) },
      feedDisplayCells: {},
      manualCells: emptyCell
    });
    const overlap = problems.find((problem) => problem.kind === "feed-overlap");
    expect(overlap).toBeTruthy();
    expect(overlap?.message).toContain("Topo");
    expect(overlap?.message).toContain("Baixo");
  });
});
