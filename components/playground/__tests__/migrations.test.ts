import { describe, expect, it } from "vitest";
import { migratePlaygroundWorkbook } from "@/components/playground/infra/playground-migrations";

describe("playground workbook migrations", () => {
  it("migrates v1 workbook into v2 and strips materialized feed cells", () => {
    const migrated = migratePlaygroundWorkbook({
      version: 1,
      activePageId: "page-1",
      pages: [
        {
          id: "page-1",
          name: "Operacao",
          rowCount: 20,
          colCount: 10,
          cells: {
            "0:0": { value: "manual" },
            "1:1": { value: "fed header", feedId: "feed-1" },
            "2:1": { value: "fed value", feedId: "feed-1", style: { background: "#fff3a6" } },
            "4:4": { value: "styled", style: { background: "#ABC", color: "#123456", bold: true } }
          },
          rowHeights: { "3": 44 },
          columnWidths: { "2": 150 },
          hiddenRows: { "8": true, "9": false },
          hiddenColumns: { "6": true },
          feeds: [
            {
              id: "feed-1",
              table: "carros",
              columns: ["placa", "local"],
              columnLabels: { placa: "Placa", local: "Loja" },
              targetRow: 1,
              targetCol: 1,
              renderedAt: "2026-04-27T00:00:00.000Z"
            }
          ],
          updatedAt: "2026-04-27T00:00:00.000Z"
        }
      ]
    });

    expect(migrated.version).toBe(2);
    expect(migrated.preferences).toEqual({ showGridLines: true, printMargin: "compact" });
    expect(migrated.activePageId).toBe("page-1");
    expect(migrated.pages[0].cells).toEqual({
      "0:0": { value: "manual" },
      "4:4": {
        value: "styled",
        style: { background: "#aabbcc", color: "#123456", bold: true }
      }
    });
    expect(migrated.pages[0].hiddenRows).toEqual({ "8": true });
    expect(migrated.pages[0].hiddenColumns).toEqual({ "6": true });
    expect(migrated.pages[0].feeds[0]).toMatchObject({
      id: "feed-1",
      table: "carros",
      position: { row: 1, col: 1 },
      targetRow: 1,
      targetCol: 1,
      columns: ["placa", "local"],
      columnLabels: { placa: "Placa", local: "Loja" },
      query: {
        query: "",
        matchMode: "contains",
        filters: {},
        sort: [],
        page: 1,
        pageSize: 50
      },
      displayColumnOverrides: {},
      showPaginationInHeader: false,
      fragments: [],
      anchorFilterColumns: []
    });
  });

  it("normalizes v2 fragments and keeps compatibility aliases aligned", () => {
    const migrated = migratePlaygroundWorkbook({
      version: 2,
      activePageId: "page-1",
      preferences: { showGridLines: false },
      pages: [
        {
          id: "page-1",
          name: "Fragmentos",
          rowCount: 30,
          colCount: 12,
          cells: {},
          feeds: [
            {
              id: "feed-1",
              table: "carros",
              position: { row: 3, col: 4 },
              targetRow: 1,
              targetCol: 1,
              columns: ["placa", "local"],
              columnLabels: { placa: "Placa", local: "Loja" },
              query: {
                filters: { estado_venda: "=DISPONIVEL" },
                pageSize: 25
              },
              showPaginationInHeader: true,
              displayColumnOverrides: { modelo_id: "modelo" },
              anchorFilterColumns: ["estado_venda", "missing"],
              fragments: [
                {
                  id: "fragment-1",
                  parentFeedId: "feed-1",
                  sourceColumn: "local",
                  valueLiteral: "loja_3",
                  valueLabel: "Loja 3",
                  position: { row: 8, col: 4 },
                  query: { filters: { local: "=loja_3" }, pageSize: 25 },
                  displayColumnOverrides: { modelo_id: "nome" }
                }
              ],
              renderedAt: "2026-04-27T00:00:00.000Z"
            }
          ],
          updatedAt: "2026-04-27T00:00:00.000Z"
        }
      ]
    });

    expect(migrated.preferences.showGridLines).toBe(false);
    expect(migrated.pages[0].feeds[0]).toMatchObject({
      position: { row: 3, col: 4 },
      targetRow: 3,
      targetCol: 4,
      query: {
        filters: { estado_venda: "=DISPONIVEL" },
        pageSize: 25
      },
      showPaginationInHeader: true,
      anchorFilterColumns: ["estado_venda"]
    });
    expect(migrated.pages[0].feeds[0].fragments[0]).toMatchObject({
      id: "fragment-1",
      parentFeedId: "feed-1",
      sourceColumn: "local",
      valueLiteral: "loja_3",
      position: { row: 8, col: 4 },
      displayColumnOverrides: { modelo_id: "nome" }
    });
  });
});
