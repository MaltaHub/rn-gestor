import { describe, expect, it } from "vitest";
import { matchReaderSelection } from "@/components/ui-grid/advanced-data-dialog";

const GLOBAL_ROWS = [
  { id: "1", placa: "ABC1D23", estado: "DISPONIVEL" },
  { id: "2", placa: "XYZ2A34", estado: "VENDIDO" },
  { id: "3", placa: "ABC1D23", estado: "DISPONIVEL" }, // placa repetida
  { id: "4", placa: "JJJ9K99", estado: "VENDIDO" }
];

// Simula o escopo "visíveis": so linhas que passam pelo filtro estado=DISPONIVEL.
const VISIBLE_ROWS = GLOBAL_ROWS.filter((row) => row.estado === "DISPONIVEL");

describe("matchReaderSelection (escopo do leitor avançado)", () => {
  it("escopo global casa em todas as linhas carregadas, inclusive repetidas", () => {
    const result = matchReaderSelection({
      rows: GLOBAL_ROWS,
      column: "placa",
      primaryKey: "id",
      tokens: ["ABC1D23", "JJJ9K99"]
    });

    expect(result.ids.sort()).toEqual(["1", "3", "4"]);
    expect(result.matched).toBe(3);
    expect(result.unmatched).toEqual([]);
  });

  it("escopo visíveis (filtrado) ignora linhas fora do filtro atual", () => {
    // Mesmos tokens, mas so o conjunto filtrado entra: JJJ9K99 (VENDIDO) some.
    const result = matchReaderSelection({
      rows: VISIBLE_ROWS,
      column: "placa",
      primaryKey: "id",
      tokens: ["ABC1D23", "JJJ9K99"]
    });

    expect(result.ids.sort()).toEqual(["1", "3"]);
    expect(result.matched).toBe(2);
    expect(result.unmatched).toEqual(["JJJ9K99"]);
  });

  it("normaliza caixa e espaços ao casar", () => {
    const result = matchReaderSelection({
      rows: GLOBAL_ROWS,
      column: "placa",
      primaryKey: "id",
      tokens: ["abc1d23"]
    });
    expect(result.matched).toBe(2);
    expect(result.ids.sort()).toEqual(["1", "3"]);
  });

  it("sem tokens ou sem coluna nao seleciona nada", () => {
    expect(matchReaderSelection({ rows: GLOBAL_ROWS, column: "placa", primaryKey: "id", tokens: [] }).ids).toEqual([]);
    expect(matchReaderSelection({ rows: GLOBAL_ROWS, column: "", primaryKey: "id", tokens: ["ABC1D23"] }).ids).toEqual([]);
  });
});
