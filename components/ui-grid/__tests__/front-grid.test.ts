import { describe, expect, it } from "vitest";
import { matchesFrontFilterExpression } from "../front-grid";

describe("front grid filters", () => {
  it("matches EXCETO with multiple values", () => {
    expect(matchesFrontFilterExpression("loja_3", "EXCETO loja_3|loja_5")).toBe(false);
    expect(matchesFrontFilterExpression("loja_5", "EXCETO loja_3|loja_5")).toBe(false);
    expect(matchesFrontFilterExpression("loja_2", "EXCETO loja_3|loja_5")).toBe(true);
  });

  it("matches EXCETO VAZIO with additional values", () => {
    expect(matchesFrontFilterExpression(null, "EXCETO VAZIO|loja_3")).toBe(false);
    expect(matchesFrontFilterExpression("", "EXCETO VAZIO|loja_3")).toBe(false);
    expect(matchesFrontFilterExpression("loja_3", "EXCETO VAZIO|loja_3")).toBe(false);
    expect(matchesFrontFilterExpression("loja_4", "EXCETO VAZIO|loja_3")).toBe(true);
  });
});
