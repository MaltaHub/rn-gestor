import { describe, expect, it } from "vitest";
import {
  describeFilterNode,
  filterAnd,
  filterLeaf,
  filterOr,
  filterRelation,
  fromGridFilters,
  normalizeFilterNode,
  splitConjunction,
  toGridFilters
} from "@/components/ui-grid/core/filter-predicate";

describe("fromGridFilters", () => {
  it("vira um AND de folhas, ignorando expressoes vazias", () => {
    const node = fromGridFilters({ estado_venda: "=DISPONÍVEL", local: "  ", cor: "preto" });
    expect(node.op).toBe("and");
    expect(node.children).toEqual([
      { kind: "leaf", column: "estado_venda", expression: "=DISPONÍVEL" },
      { kind: "leaf", column: "cor", expression: "preto" }
    ]);
  });
});

describe("splitConjunction", () => {
  it("separa folhas (GridFilters) das relacoes", () => {
    const node = filterAnd(
      filterLeaf("estado_venda", "=DISPONÍVEL"),
      filterRelation({
        column: "carro_id",
        table: "carros",
        keyColumn: "id",
        where: filterLeaf("estado_venda", "=DISPONÍVEL")
      })
    );

    const split = splitConjunction(node);
    expect(split.leafFilters).toEqual({ estado_venda: "=DISPONÍVEL" });
    expect(split.relations).toHaveLength(1);
    expect(split.relations[0].table).toBe("carros");
    expect(split.supported).toBe(true);
  });

  it("marca supported=false quando ha OR (nao representavel no GridFilters)", () => {
    const node = filterOr(filterLeaf("cor", "preto"), filterLeaf("cor", "branco"));
    expect(splitConjunction(node).supported).toBe(false);
  });

  it("toGridFilters extrai so as folhas aplicaveis", () => {
    const node = filterAnd(filterLeaf("a", "=1"), filterLeaf("b", "x|y"));
    expect(toGridFilters(node)).toEqual({ a: "=1", b: "x|y" });
  });
});

describe("normalizeFilterNode", () => {
  it("remove folhas vazias e achata grupo de um filho", () => {
    const node = filterAnd(filterLeaf("a", "=1"), filterLeaf("b", "   "));
    expect(normalizeFilterNode(node)).toEqual({ kind: "leaf", column: "a", expression: "=1" });
  });

  it("descarta relacao sem sub-predicado", () => {
    const node = filterRelation({ column: "carro_id", table: "carros", keyColumn: "id", where: filterLeaf("x", "") });
    expect(normalizeFilterNode(node)).toBeNull();
  });

  it("achata grupos do mesmo operador", () => {
    const node = filterAnd(filterLeaf("a", "=1"), filterAnd(filterLeaf("b", "=2"), filterLeaf("c", "=3")));
    const normalized = normalizeFilterNode(node);
    expect(normalized?.kind).toBe("group");
    if (normalized?.kind !== "group") return;
    expect(normalized.children).toHaveLength(3);
  });
});

describe("describeFilterNode", () => {
  it("descreve relacao aninhada de forma legivel", () => {
    const node = filterRelation({
      column: "carro_id",
      table: "carros",
      keyColumn: "id",
      where: filterLeaf("estado_venda", "=DISPONÍVEL")
    });
    const text = describeFilterNode(node, {
      column: (c) => (c === "carro_id" ? "Carro" : c === "estado_venda" ? "Estado de venda" : c),
      table: (t) => (t === "carros" ? "Carros" : t)
    });
    expect(text).toBe("Carro em Carros onde (Estado de venda: =DISPONÍVEL)");
  });
});
