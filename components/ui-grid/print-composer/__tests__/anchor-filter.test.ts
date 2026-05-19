import { describe, expect, it } from "vitest";
import { applyAnchorFilter } from "@/components/ui-grid/print-composer/anchor-filter";

const rows = [
  { id: "1", local: "Loja 1", estado_venda: "DISPONÍVEL" },
  { id: "2", local: "Loja 2", estado_venda: "DISPONÍVEL" },
  { id: "3", local: "Loja 1", estado_venda: "VENDIDO" },
  { id: "4", local: "Loja 3", estado_venda: "DISPONÍVEL" }
];

describe("applyAnchorFilter", () => {
  it("returns all rows when filter is null", () => {
    expect(applyAnchorFilter(rows, null)).toHaveLength(4);
  });

  it("returns all rows when filter has no values", () => {
    expect(applyAnchorFilter(rows, { values: {} })).toHaveLength(4);
  });

  it("filters by a single column whitelist", () => {
    const filtered = applyAnchorFilter(rows, { values: { local: ["Loja 1"] } });
    expect(filtered.map((row) => row.id)).toEqual(["1", "3"]);
  });

  it("treats multiple columns as AND", () => {
    const filtered = applyAnchorFilter(rows, {
      values: { local: ["Loja 1", "Loja 2"], estado_venda: ["DISPONÍVEL"] }
    });
    expect(filtered.map((row) => row.id)).toEqual(["1", "2"]);
  });

  it("ignores columns with empty allowed lists", () => {
    const filtered = applyAnchorFilter(rows, {
      values: { local: ["Loja 1"], estado_venda: [] }
    });
    expect(filtered.map((row) => row.id)).toEqual(["1", "3"]);
  });

  it("returns empty when no row matches", () => {
    const filtered = applyAnchorFilter(rows, { values: { local: ["Galpão"] } });
    expect(filtered).toHaveLength(0);
  });
});
