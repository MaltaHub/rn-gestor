import { describe, expect, it, vi } from "vitest";
import { filterAnd, filterLeaf, filterRelation } from "@/components/ui-grid/core/filter-predicate";
import {
  RELATION_NO_MATCH_LITERAL,
  resolveFilterNodeToGridFilters,
  type RelationKeyFetcher
} from "@/components/ui-grid/core/filter-resolve";

describe("resolveFilterNodeToGridFilters", () => {
  it("achata uma relacao numa condicao IN na coluna local", async () => {
    // documentos.carro_id onde carros.estado_venda = DISPONÍVEL
    const node = filterRelation({
      column: "carro_id",
      table: "carros",
      keyColumn: "id",
      where: filterLeaf("estado_venda", "=DISPONÍVEL")
    });

    const fetchKeys: RelationKeyFetcher = vi.fn(async ({ table, filters, keyColumn }) => {
      expect(table).toBe("carros");
      expect(filters).toEqual({ estado_venda: "=DISPONÍVEL" });
      expect(keyColumn).toBe("id");
      return { keys: ["c1", "c2", "c2"], truncated: false };
    });

    const resolved = await resolveFilterNodeToGridFilters(node, fetchKeys);
    expect(resolved.filters).toEqual({ carro_id: "c1|c2" });
    expect(resolved.truncated).toBe(false);
  });

  it("combina folhas diretas com a relacao", async () => {
    const node = filterAnd(
      filterLeaf("pericia", "=AUTENTICA"),
      filterRelation({ column: "carro_id", table: "carros", keyColumn: "id", where: filterLeaf("estado_venda", "=VENDIDO") })
    );
    const fetchKeys: RelationKeyFetcher = async () => ({ keys: ["x"], truncated: false });

    const resolved = await resolveFilterNodeToGridFilters(node, fetchKeys);
    expect(resolved.filters).toEqual({ pericia: "=AUTENTICA", carro_id: "x" });
  });

  it("usa sentinela quando a relacao nao casa nenhuma chave (alvo vazio)", async () => {
    const node = filterRelation({ column: "carro_id", table: "carros", keyColumn: "id", where: filterLeaf("estado_venda", "=NOVO") });
    const fetchKeys: RelationKeyFetcher = async () => ({ keys: [], truncated: false });

    const resolved = await resolveFilterNodeToGridFilters(node, fetchKeys);
    expect(resolved.filters).toEqual({ carro_id: RELATION_NO_MATCH_LITERAL });
  });

  it("resolve recursivamente (relacao dentro de relacao) e propaga truncated", async () => {
    // documentos.carro_id -> carros.id onde carros.modelo_id -> modelos.id onde modelos.modelo contem 'gol'
    const node = filterRelation({
      column: "carro_id",
      table: "carros",
      keyColumn: "id",
      where: filterRelation({
        column: "modelo_id",
        table: "modelos",
        keyColumn: "id",
        where: filterLeaf("modelo", "gol")
      })
    });

    const calls: string[] = [];
    const fetchKeys: RelationKeyFetcher = async ({ table, filters }) => {
      calls.push(table);
      if (table === "modelos") {
        expect(filters).toEqual({ modelo: "gol" });
        return { keys: ["m1"], truncated: true };
      }
      // carros: recebe o resultado da resolucao de modelos achatado em modelo_id IN.
      expect(filters).toEqual({ modelo_id: "m1" });
      return { keys: ["c9"], truncated: false };
    };

    const resolved = await resolveFilterNodeToGridFilters(node, fetchKeys);
    expect(calls).toEqual(["modelos", "carros"]);
    expect(resolved.filters).toEqual({ carro_id: "c9" });
    expect(resolved.truncated).toBe(true);
  });
});
