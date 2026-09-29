import { describe, expect, it } from "vitest";
import {
  buildNameRuleRelation,
  nameRuleMatchesText,
  sanitizeNameRuleKey
} from "@/components/playground/domain/name-rule";
import {
  createNameRuleFragment,
  getEffectiveFragmentLiterals,
  updateNameRuleFragment
} from "@/components/playground/domain/feed-fragments";
import { buildParentFeedDataQuery, buildPlaygroundFeedDataTargets } from "@/components/playground/domain/feed-data";
import { DEFAULT_PLAYGROUND_FEED_QUERY } from "@/components/playground/domain/feed-query";
import { migratePlaygroundWorkbook } from "@/components/playground/infra/playground-migrations";
import { filterLeaf, filterRelation } from "@/components/ui-grid/core/filter-predicate";
import type { PlaygroundFeed, PlaygroundFeedFragment } from "@/components/playground/types";

function buildFeed(overrides: Partial<PlaygroundFeed> = {}): PlaygroundFeed {
  return {
    id: "feed-1",
    table: "carros",
    title: "Estoque",
    position: { row: 2, col: 1 },
    columns: ["placa", "modelo_id", "cor"],
    columnLabels: { placa: "Placa", modelo_id: "Modelo", cor: "Cor" },
    query: { ...DEFAULT_PLAYGROUND_FEED_QUERY, filters: { estado_venda: "=DISPONÍVEL" }, pageSize: 20 },
    displayColumnOverrides: { modelo_id: "modelo" },
    showPaginationInHeader: false,
    hideColumnHeader: false,
    hidden: false,
    fragments: [],
    anchorFilterColumns: [],
    prochColumns: [],
    targetRow: 2,
    targetCol: 1,
    renderedAt: "2026-09-29T00:00:00.000Z",
    ...overrides
  };
}

function onixFragment(feed: PlaygroundFeed): PlaygroundFeedFragment {
  const fragment = createNameRuleFragment({
    feed,
    sourceColumn: "modelo_id",
    rule: { key: "onix", path: "modelo" },
    position: { row: 30, col: 1 },
    id: "frag-onix"
  });
  if (!fragment) throw new Error("fragmento nao criado");
  return fragment;
}

describe("sanitizeNameRuleKey", () => {
  it("remove operadores do DSL e pipes", () => {
    expect(sanitizeNameRuleKey("  onix ")).toBe("onix");
    expect(sanitizeNameRuleKey("=onix")).toBe("onix");
    expect(sanitizeNameRuleKey(">=10")).toBe("10");
    expect(sanitizeNameRuleKey("onix|hb20")).toBe("onix hb20");
  });

  it("rejeita chaves que o servidor le como operador", () => {
    expect(sanitizeNameRuleKey("vazio")).toBe("");
    expect(sanitizeNameRuleKey("!VAZIO")).toBe("");
    expect(sanitizeNameRuleKey("exceto onix")).toBe("");
    expect(sanitizeNameRuleKey("   ")).toBe("");
  });

  it("mantem palavras que so comecam parecido", () => {
    expect(sanitizeNameRuleKey("vazios")).toBe("vazios");
    expect(sanitizeNameRuleKey("excetoonix")).toBe("excetoonix");
  });
});

describe("nameRuleMatchesText", () => {
  it("casa por 'contem' sem diferenciar maiusculas", () => {
    expect(nameRuleMatchesText("ONIX PLUS 1.0 TURBO", "onix")).toBe(true);
    expect(nameRuleMatchesText("Civic EXL", "onix")).toBe(false);
    expect(nameRuleMatchesText("qualquer", "")).toBe(false);
  });
});

describe("buildNameRuleRelation", () => {
  it("coluna FK: relacao com a folha no campo escolhido", () => {
    expect(buildNameRuleRelation({ table: "carros", sourceColumn: "modelo_id", rule: { key: "onix", path: "modelo" } })).toEqual(
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix") })
    );
  });

  it("caminho de varios saltos vira relacao aninhada", () => {
    // documentos.carro_id -> carros.modelo_id -> modelos.modelo
    expect(
      buildNameRuleRelation({ table: "documentos", sourceColumn: "carro_id", rule: { key: "onix", path: "modelo_id>modelo" } })
    ).toEqual(
      filterRelation({
        column: "carro_id",
        table: "carros",
        keyColumn: "id",
        where: filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix") })
      })
    );
  });

  it("coluna comum: auto-relacao (valores distintos da propria coluna)", () => {
    expect(buildNameRuleRelation({ table: "carros", sourceColumn: "cor", rule: { key: "pra", path: "" }, negate: true })).toEqual(
      filterRelation({ column: "cor", table: "carros", keyColumn: "cor", where: filterLeaf("cor", "pra"), negate: true })
    );
  });

  it("caminho invalido ou chave vazia nao gera regra", () => {
    expect(buildNameRuleRelation({ table: "carros", sourceColumn: "modelo_id", rule: { key: "onix", path: "nao_fk>modelo" } })).toBeNull();
    expect(buildNameRuleRelation({ table: "carros", sourceColumn: "modelo_id", rule: { key: "vazio", path: "modelo" } })).toBeNull();
  });
});

describe("createNameRuleFragment", () => {
  it("guarda a REGRA e herda os filtros do pai (sem id fixo na query)", () => {
    const feed = buildFeed();
    const fragment = onixFragment(feed);

    expect(fragment.kind).toBe("name");
    expect(fragment.nameRule).toEqual({ key: "onix", path: "modelo" });
    expect(fragment.valueLabel).toBe("onix");
    expect(fragment.query.filters).toEqual({ estado_venda: "=DISPONÍVEL" });
    expect(fragment.query.relationFilters).toEqual([
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix") })
    ]);
    expect(fragment.query.page).toBe(1);
    expect(fragment.query.pageSize).toBe(20);
  });

  it("coluna comum filtra por texto direto no servidor", () => {
    const fragment = createNameRuleFragment({
      feed: buildFeed(),
      sourceColumn: "cor",
      rule: { key: "prata", path: "" },
      position: { row: 0, col: 0 },
      id: "frag-cor",
      label: "Pratas"
    });
    expect(fragment?.query.filters).toEqual({ estado_venda: "=DISPONÍVEL", cor: "prata" });
    expect(fragment?.query.relationFilters).toEqual([]);
    expect(fragment?.valueLabel).toBe("Pratas");
  });

  it("nao conta como literal tomado (o dialog nao esconde valores por id fixo)", () => {
    const feed = buildFeed();
    expect(getEffectiveFragmentLiterals([onixFragment(feed)], "modelo_id").size).toBe(0);
  });
});

describe("alimentador pai com fragmento por nome", () => {
  it("exclui pela regra NEGADA, somando com os fragmentos por valor", () => {
    const base = buildFeed();
    const valueFragment: PlaygroundFeedFragment = {
      id: "frag-civic",
      parentFeedId: "feed-1",
      sourceColumn: "modelo_id",
      valueLiteral: "m-civic",
      valueLabel: "Civic",
      position: { row: 60, col: 1 },
      query: { ...DEFAULT_PLAYGROUND_FEED_QUERY, filters: { modelo_id: "=m-civic" } },
      displayColumnOverrides: {}
    };
    const feed = buildFeed({ fragments: [onixFragment(base), valueFragment] });

    const query = buildParentFeedDataQuery(feed);
    expect(query.filters).toEqual({ estado_venda: "=DISPONÍVEL", modelo_id: "EXCETO m-civic" });
    expect(query.relationFilters).toEqual([
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix"), negate: true })
    ]);
  });

  it("o target do fragmento carrega a regra (resolvida a cada fetch)", () => {
    const feed = buildFeed();
    const fragment = onixFragment(feed);
    const targets = buildPlaygroundFeedDataTargets([{ ...feed, fragments: [fragment] }]);
    const fragmentTarget = targets.find((target) => target.id === "frag-onix");
    expect(fragmentTarget?.query.relationFilters?.[0]?.where).toEqual(filterLeaf("modelo", "onix"));
    expect(fragmentTarget?.lockedFilterColumns).toContain("modelo_id");
  });
});

describe("precedencia entre fragmentos (cada linha cai num so)", () => {
  it("por nome cede aos por valor e as regras por nome anteriores da mesma coluna", () => {
    const base = buildFeed();
    const valueFragment: PlaygroundFeedFragment = {
      id: "frag-onix-lt",
      parentFeedId: "feed-1",
      sourceColumn: "modelo_id",
      valueLiteral: "m-onix-lt",
      valueLabel: "ONIX LT",
      position: { row: 60, col: 1 },
      query: { ...DEFAULT_PLAYGROUND_FEED_QUERY, filters: { modelo_id: "=m-onix-lt" } },
      displayColumnOverrides: {}
    };
    const onixPlus = createNameRuleFragment({
      feed: base,
      sourceColumn: "modelo_id",
      rule: { key: "onix plus", path: "modelo" },
      position: { row: 80, col: 1 },
      id: "frag-onix-plus"
    });
    if (!onixPlus) throw new Error("fragmento nao criado");
    const feed = buildFeed({ fragments: [valueFragment, onixPlus, onixFragment(base)] });

    const targets = buildPlaygroundFeedDataTargets([feed]);
    const onix = targets.find((target) => target.id === "frag-onix");
    expect(onix?.query.filters.modelo_id).toBe("EXCETO m-onix-lt");
    expect(onix?.query.relationFilters).toEqual([
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix") }),
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "onix plus"), negate: true })
    ]);

    // A regra mais antiga so cede aos por valor.
    const plus = targets.find((target) => target.id === "frag-onix-plus");
    expect(plus?.query.relationFilters).toHaveLength(1);
    expect(plus?.query.filters.modelo_id).toBe("EXCETO m-onix-lt");
  });

  it("coluna comum sem nada a excluir filtra direto por texto; com exclusao vira relacao", () => {
    const base = buildFeed();
    const make = (key: string, id: string) =>
      createNameRuleFragment({ feed: base, sourceColumn: "cor", rule: { key, path: "" }, position: { row: 0, col: 0 }, id });
    const prata = make("prata", "frag-prata");
    const pratinha = make("prat", "frag-prat");
    if (!prata || !pratinha) throw new Error("fragmento nao criado");

    const targets = buildPlaygroundFeedDataTargets([buildFeed({ fragments: [prata, pratinha] })]);
    expect(targets.find((target) => target.id === "frag-prata")?.query.filters.cor).toBe("prata");
    const second = targets.find((target) => target.id === "frag-prat");
    expect(second?.query.filters.cor).toBeUndefined();
    expect(second?.query.relationFilters).toEqual([
      filterRelation({ column: "cor", table: "carros", keyColumn: "cor", where: filterLeaf("cor", "prat") }),
      filterRelation({ column: "cor", table: "carros", keyColumn: "cor", where: filterLeaf("cor", "prata"), negate: true })
    ]);
  });
});

describe("updateNameRuleFragment", () => {
  it("troca a chave; rotulo que espelhava a chave antiga acompanha", () => {
    const feed = buildFeed();
    const updated = updateNameRuleFragment({ feed, fragment: onixFragment(feed), rule: { key: "hb20", path: "modelo" } });
    expect(updated?.nameRule).toEqual({ key: "hb20", path: "modelo" });
    expect(updated?.valueLabel).toBe("hb20");
    expect(updated?.query.relationFilters).toEqual([
      filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "hb20") })
    ]);
  });

  it("preserva rotulo customizado e posicao", () => {
    const feed = buildFeed();
    const custom = { ...onixFragment(feed), valueLabel: "Linha Onix" };
    const updated = updateNameRuleFragment({ feed, fragment: custom, rule: { key: "onix plus", path: "modelo" } });
    expect(updated?.valueLabel).toBe("Linha Onix");
    expect(updated?.position).toEqual(custom.position);
  });
});

describe("migracao preserva regras e filtros aninhados", () => {
  it("fragmento por nome, fragmento por linhas e relationFilters sobrevivem ao load", () => {
    const feed = buildFeed({
      query: {
        ...DEFAULT_PLAYGROUND_FEED_QUERY,
        relationFilters: [filterRelation({ column: "modelo_id", table: "modelos", keyColumn: "id", where: filterLeaf("modelo", "gol") })]
      }
    });
    const rowsFragment: PlaygroundFeedFragment = {
      id: "frag-rows-1",
      parentFeedId: "feed-1",
      kind: "rows",
      sourceColumn: "",
      valueLiteral: "rows:1",
      valueLabel: "Linhas 1-10",
      position: { row: 40, col: 1 },
      query: { ...DEFAULT_PLAYGROUND_FEED_QUERY, page: 1, pageSize: 10 },
      displayColumnOverrides: {}
    };
    const workbook = {
      version: 2,
      activePageId: "p1",
      pages: [
        {
          id: "p1",
          name: "P",
          rowCount: 80,
          colCount: 26,
          cells: {},
          rowHeights: {},
          columnWidths: {},
          hiddenRows: {},
          hiddenColumns: {},
          updatedAt: "2026-09-29T00:00:00.000Z",
          feeds: [{ ...feed, fragments: [onixFragment(feed), rowsFragment] }]
        }
      ]
    };

    const migrated = migratePlaygroundWorkbook(JSON.parse(JSON.stringify(workbook)));
    const migratedFeed = migrated.pages[0].feeds[0];

    expect(migratedFeed.query.relationFilters).toEqual(feed.query.relationFilters);
    expect(migratedFeed.fragments.map((fragment) => fragment.id)).toEqual(["frag-onix", "frag-rows-1"]);
    const [onix, rows] = migratedFeed.fragments;
    expect(onix.kind).toBe("name");
    expect(onix.nameRule).toEqual({ key: "onix", path: "modelo" });
    expect(onix.query.relationFilters).toHaveLength(1);
    expect(rows.kind).toBe("rows");
    expect(rows.sourceColumn).toBe("");
  });

  it("fragmento por nome sem chave e descartado", () => {
    const migrated = migratePlaygroundWorkbook({
      version: 2,
      activePageId: "p1",
      pages: [
        {
          id: "p1",
          name: "P",
          rowCount: 80,
          colCount: 26,
          cells: {},
          feeds: [
            {
              ...buildFeed(),
              fragments: [{ id: "x", kind: "name", sourceColumn: "modelo_id", valueLiteral: "nome:~", nameRule: { key: " ", path: "modelo" } }]
            }
          ]
        }
      ]
    });
    expect(migrated.pages[0].feeds[0].fragments).toEqual([]);
  });
});
