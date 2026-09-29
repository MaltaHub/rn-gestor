import { describe, expect, it, vi } from "vitest";
import { filterAnd, filterLeaf, filterRelation } from "@/components/ui-grid/core/filter-predicate";
import {
  RELATION_NO_MATCH_LITERAL,
  mergeExclusionExpression,
  mergeResolvedGridFilters,
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
    expect(resolved.filters).toEqual({ pericia: "=AUTENTICA", carro_id: "=x" });
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
      expect(filters).toEqual({ modelo_id: "=m1" });
      return { keys: ["c9"], truncated: false };
    };

    const resolved = await resolveFilterNodeToGridFilters(node, fetchKeys);
    expect(calls).toEqual(["modelos", "carros"]);
    expect(resolved.filters).toEqual({ carro_id: "=c9" });
    expect(resolved.truncated).toBe(true);
  });

  it("relacao negada vira EXCETO das chaves (e nao restringe nada sem chaves)", async () => {
    const node = filterRelation({
      column: "modelo_id",
      table: "modelos",
      keyColumn: "id",
      where: filterLeaf("nome", "onix"),
      negate: true
    });

    const withKeys = await resolveFilterNodeToGridFilters(node, async () => ({ keys: ["m2", "m3", "m2"], truncated: false }));
    expect(withKeys.filters).toEqual({ modelo_id: "EXCETO m2|m3" });

    const withoutKeys = await resolveFilterNodeToGridFilters(node, async () => ({ keys: [], truncated: false }));
    expect(withoutKeys.filters).toEqual({});
  });

  it("duas relacoes negadas na mesma coluna somam as exclusoes", async () => {
    const node = filterAnd(
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("nome", "onix"), negate: true }),
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("nome", "hb20"), negate: true })
    );
    const fetchKeys: RelationKeyFetcher = async ({ filters }) =>
      filters.nome === "onix" ? { keys: ["m2", "m3"], truncated: false } : { keys: ["m4"], truncated: false };

    const resolved = await resolveFilterNodeToGridFilters(node, fetchKeys);
    expect(resolved.filters).toEqual({ modelo_id: "EXCETO m2|m3|m4" });
  });
});

describe("mergeResolvedGridFilters", () => {
  it("soma EXCETO resolvido ao EXCETO base (fragmento por valor + por nome)", () => {
    expect(
      mergeResolvedGridFilters({ modelo_id: "EXCETO m1", local: "=Loja 1" }, { modelo_id: "EXCETO m2|m1" })
    ).toEqual({ modelo_id: "EXCETO m1|m2", local: "=Loja 1" });
  });

  it("IN resolvido respeita o EXCETO base (fragmento por nome cede aos por valor)", () => {
    expect(mergeResolvedGridFilters({ modelo_id: "EXCETO m1" }, { modelo_id: "m1|m2|m3" })).toEqual({ modelo_id: "m2|m3" });
    expect(mergeResolvedGridFilters({ modelo_id: "EXCETO m1|m2" }, { modelo_id: "m1|m2" })).toEqual({
      modelo_id: RELATION_NO_MATCH_LITERAL
    });
  });

  it("IN com IN vira intersecao; uma chave so vira '='", () => {
    expect(mergeResolvedGridFilters({ modelo_id: "m1|m2" }, { modelo_id: "m2|m3" })).toEqual({ modelo_id: "=m2" });
  });

  it("condicoes nao combinaveis: vence a resolvida", () => {
    expect(mergeResolvedGridFilters({ modelo_id: ">=5" }, { modelo_id: "EXCETO m2" })).toEqual({ modelo_id: "EXCETO m2" });
    expect(mergeResolvedGridFilters({ cor: "prata" }, { cor: "=azul" })).toEqual({ cor: "=azul" });
  });
});

describe("resolucao combinada na mesma coluna", () => {
  it("regra positiva menos regras negadas anteriores (precedencia entre fragmentos por nome)", async () => {
    const node = filterAnd(
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix") }),
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix plus"), negate: true })
    );
    const fetchKeys: RelationKeyFetcher = async ({ filters }) =>
      filters.modelo === "onix" ? { keys: ["m2", "m3"], truncated: false } : { keys: ["m3"], truncated: false };

    const resolved = await resolveFilterNodeToGridFilters(node, fetchKeys);
    expect(resolved.filters).toEqual({ modelo_id: "=m2" });
  });
});

describe("mergeExclusionExpression", () => {
  it("cria ou estende a lista sem duplicar", () => {
    expect(mergeExclusionExpression(undefined, ["a", "b"])).toBe("EXCETO a|b");
    expect(mergeExclusionExpression("EXCETO b|c", ["a", "b"])).toBe("EXCETO b|c|a");
  });
});
