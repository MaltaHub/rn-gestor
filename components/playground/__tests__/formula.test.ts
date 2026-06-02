import { describe, expect, it } from "vitest";
import {
  evaluateFormula,
  isFormula,
  type FormulaContext,
  type FormulaScalar
} from "@/components/playground/domain/formula/engine";
import { evaluateSheetFormulas, formatFormulaResult } from "@/components/playground/domain/formula/sheet";

/** Contexto de teste: grade A1 a partir de uma matriz e colunas de alimentador nomeadas. */
function makeContext(
  grid: FormulaScalar[][],
  columns: Record<string, FormulaScalar[]> = {}
): FormulaContext {
  return {
    getCellValue: (row, col) => grid[row]?.[col] ?? null,
    getColumnValues: (feed, column) => columns[`${feed}.${column}`] ?? []
  };
}

function value(formula: string, ctx: FormulaContext) {
  const result = evaluateFormula(formula, ctx);
  return "value" in result ? result.value : `ERR:${result.error}`;
}

describe("formula engine - parsing e aritmetica", () => {
  const ctx = makeContext([]);

  it("detects formulas", () => {
    expect(isFormula("=1+1")).toBe(true);
    expect(isFormula("1+1")).toBe(false);
    expect(isFormula("=")).toBe(false);
    expect(isFormula(123 as never)).toBe(false);
  });

  it("evaluates arithmetic with precedence and parentheses", () => {
    expect(value("=2+3*4", ctx)).toBe(14);
    expect(value("=(2+3)*4", ctx)).toBe(20);
    expect(value("=-5+2", ctx)).toBe(-3);
    expect(value("=10/4", ctx)).toBe(2.5);
  });

  it("returns #DIV/0! on division by zero", () => {
    expect(value("=1/0", ctx)).toBe("ERR:#DIV/0!");
  });

  it("evaluates comparisons to booleans", () => {
    expect(value("=3>2", ctx)).toBe(true);
    expect(value('="a"="a"', ctx)).toBe(true);
    expect(value("=2<>2", ctx)).toBe(false);
  });

  it("reports #NOME? for unknown bareword and #ERRO! for malformed input", () => {
    expect(value("=foo", ctx)).toBe("ERR:#NOME?");
    expect(value("=1+", ctx)).toBe("ERR:#ERRO!");
  });
});

describe("formula engine - referencias", () => {
  // grid: A1=10, B1=20 ; A2="loja 1", B2=5 ; A3="loja 2", B3=7
  const grid: FormulaScalar[][] = [
    [10, 20],
    ["loja 1", 5],
    ["loja 2", 7]
  ];
  const columns = {
    "alim1.local": ["loja 1", "loja 2", "loja 1"],
    "alim1.preco": [100, 200, 50]
  };
  const ctx = makeContext(grid, columns);

  it("resolves single cell and range references", () => {
    expect(value("=A1", ctx)).toBe(10);
    expect(value("=A1+B1", ctx)).toBe(30);
    expect(value("=SOMA(A1:B1)", ctx)).toBe(30);
    expect(value("=SOMA(B1:B3)", ctx)).toBe(32);
  });

  it("resolves feed column references", () => {
    expect(value('=CONT.SE(alim1.local;"loja 1")', ctx)).toBe(2);
    expect(value("=SOMA(alim1.preco)", ctx)).toBe(350);
    expect(value('=SOMASE(alim1.local;"loja 1";alim1.preco)', ctx)).toBe(150);
  });
});

describe("formula engine - funcoes", () => {
  const grid: FormulaScalar[][] = [
    [5, "x"],
    [10, "y"],
    [15, "x"]
  ];
  const ctx = makeContext(grid);

  it("aggregates with SOMA, MEDIA, CONT.NUM, MAXIMO, MINIMO", () => {
    expect(value("=SOMA(A1:A3)", ctx)).toBe(30);
    expect(value("=MEDIA(A1:A3)", ctx)).toBe(10);
    expect(value("=CONT.NUM(A1:B3)", ctx)).toBe(3); // ignora texto
    expect(value("=MAXIMO(A1:A3)", ctx)).toBe(15);
    expect(value("=MINIMO(A1:A3)", ctx)).toBe(5);
  });

  it("supports CONT.SE with comparison operators", () => {
    expect(value('=CONT.SE(A1:A3;">=10")', ctx)).toBe(2);
    expect(value('=CONT.SE(B1:B3;"x")', ctx)).toBe(2);
  });

  it("supports SE and accepts english aliases", () => {
    expect(value('=SE(A1>3;"alto";"baixo")', ctx)).toBe("alto");
    expect(value('=SE(A1>30;"alto";"baixo")', ctx)).toBe("baixo");
    expect(value("=SUM(A1:A3)", ctx)).toBe(30);
    expect(value('=COUNTIF(A1:A3;">=10")', ctx)).toBe(2);
  });

  it("accepts accented function names and comma separator", () => {
    expect(value("=MÉDIA(A1:A3)", ctx)).toBe(10);
    expect(value("=SOMA(A1,A2,A3)", ctx)).toBe(30);
  });
});

describe("formula sheet driver", () => {
  it("resolves formula-to-formula references", () => {
    const results = evaluateSheetFormulas({
      formulaCells: {
        "0:0": "=1+1",
        "0:1": "=A1*10" // A1 = celula 0:0 (formula)
      },
      getRawCellValue: () => null,
      getColumnValues: () => []
    });

    expect(formatFormulaResult(results["0:0"])).toBe("2");
    expect(formatFormulaResult(results["0:1"])).toBe("20");
  });

  it("reads non-formula raw values for references", () => {
    const raw: Record<string, FormulaScalar> = { "0:0": "5", "1:0": "7" };
    const results = evaluateSheetFormulas({
      formulaCells: { "2:0": "=SOMA(A1:A2)" },
      getRawCellValue: (row, col) => raw[`${row}:${col}`] ?? null,
      getColumnValues: () => []
    });

    expect(formatFormulaResult(results["2:0"])).toBe("12");
  });

  it("detects circular references", () => {
    const results = evaluateSheetFormulas({
      formulaCells: {
        "0:0": "=B1", // A1 -> B1
        "0:1": "=A1" // B1 -> A1
      },
      getRawCellValue: () => null,
      getColumnValues: () => []
    });

    expect(formatFormulaResult(results["0:0"])).toBe("#REF!");
    expect(formatFormulaResult(results["0:1"])).toBe("#REF!");
  });

  it("formats booleans and floats for display", () => {
    expect(formatFormulaResult({ value: true })).toBe("VERDADEIRO");
    expect(formatFormulaResult({ value: 0.1 + 0.2 })).toBe("0.3");
    expect(formatFormulaResult({ value: null })).toBe("");
    expect(formatFormulaResult({ error: "#DIV/0!" })).toBe("#DIV/0!");
  });
});
