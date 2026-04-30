import { describe, expect, it } from "vitest";
import { applyGridFilters, buildGridFacetOptions } from "../service";

type QueryCall = {
  method: string;
  column: string;
  operator?: string;
  value?: unknown;
};

function createQueryRecorder() {
  const calls: QueryCall[] = [];
  const query = {
    calls,
    eq(column: string, value: unknown) {
      calls.push({ method: "eq", column, value });
      return query;
    },
    neq(column: string, value: unknown) {
      calls.push({ method: "neq", column, value });
      return query;
    },
    gt(column: string, value: unknown) {
      calls.push({ method: "gt", column, value });
      return query;
    },
    gte(column: string, value: unknown) {
      calls.push({ method: "gte", column, value });
      return query;
    },
    lt(column: string, value: unknown) {
      calls.push({ method: "lt", column, value });
      return query;
    },
    lte(column: string, value: unknown) {
      calls.push({ method: "lte", column, value });
      return query;
    },
    like(column: string, value: string) {
      calls.push({ method: "like", column, value });
      return query;
    },
    ilike(column: string, value: string) {
      calls.push({ method: "ilike", column, value });
      return query;
    },
    is(column: string, value: unknown) {
      calls.push({ method: "is", column, value });
      return query;
    },
    not(column: string, operator: string, value: unknown) {
      calls.push({ method: "not", column, operator, value });
      return query;
    },
    in(column: string, value: unknown[]) {
      calls.push({ method: "in", column, value });
      return query;
    },
    or(column: string) {
      calls.push({ method: "or", column });
      return query;
    }
  };

  return query;
}

describe("grid service helpers", () => {
  it("applies EXCETO with multiple excluded values", () => {
    const query = createQueryRecorder();

    applyGridFilters(query, { local: "EXCETO loja_3|loja_5" });

    expect(query.calls).toEqual([
      { method: "neq", column: "local", value: "loja_3" },
      { method: "neq", column: "local", value: "loja_5" }
    ]);
  });

  it("applies EXCETO VAZIO as a non-null condition", () => {
    const query = createQueryRecorder();

    applyGridFilters(query, { local: "EXCETO VAZIO|loja_3" });

    expect(query.calls).toEqual([
      { method: "not", column: "local", operator: "is", value: null },
      { method: "neq", column: "local", value: "loja_3" }
    ]);
  });

  it("builds facet options with stable empty and counted literals", () => {
    const options = buildGridFacetOptions(
      [{ local: null }, { local: "loja_3" }, { local: "loja_3" }, { local: "loja_1" }],
      "local"
    );

    expect(options).toEqual([
      { literal: "VAZIO", label: "(vazio)", count: 1 },
      { literal: "loja_1", label: "loja_1", count: 1 },
      { literal: "loja_3", label: "loja_3", count: 2 }
    ]);
  });
});
