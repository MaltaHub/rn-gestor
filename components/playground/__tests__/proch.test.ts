import { describe, expect, it } from "vitest";
import {
  buildProchFetchKey,
  buildProchLookupKey,
  buildProchMapKey,
  buildProchValueMap,
  buildPlaygroundFeedDataTargets,
  buildPlaygroundFeedCellIndex,
  type PlaygroundFeedDataTarget
} from "@/components/playground/domain/feed-data";
import { DEFAULT_PLAYGROUND_FEED_QUERY } from "@/components/playground/domain/feed-query";
import { PROCH_COLUMN_ID_PREFIX, type PlaygroundFeed, type PlaygroundProchColumn } from "@/components/playground/types";

const sampleProch: PlaygroundProchColumn = {
  id: `${PROCH_COLUMN_ID_PREFIX}modelo-nome`,
  label: "Modelo",
  localKeyColumn: "modelo_id",
  lookupTable: "modelos",
  lookupKeyColumn: "id",
  lookupValueColumn: "nome"
};

function buildFeed(prochColumns: PlaygroundProchColumn[] = []): PlaygroundFeed {
  return {
    id: "feed-1",
    table: "carros",
    title: "Frota",
    position: { row: 0, col: 0 },
    columns: ["placa", sampleProch.id],
    columnLabels: { placa: "Placa", [sampleProch.id]: sampleProch.label },
    query: DEFAULT_PLAYGROUND_FEED_QUERY,
    displayColumnOverrides: {},
    showPaginationInHeader: false,
    hideColumnHeader: false,
    hidden: false,
    fragments: [],
    anchorFilterColumns: [],
    prochColumns,
    targetRow: 0,
    targetCol: 0,
    renderedAt: "2026-05-30T00:00:00.000Z"
  };
}

describe("buildProchLookupKey", () => {
  it("converte null/undefined em string vazia", () => {
    expect(buildProchLookupKey(null)).toBe("");
    expect(buildProchLookupKey(undefined)).toBe("");
  });

  it("normaliza com trim e String()", () => {
    expect(buildProchLookupKey("  abc  ")).toBe("abc");
    expect(buildProchLookupKey(42)).toBe("42");
  });
});

describe("buildProchValueMap", () => {
  it("indexa linhas em Map<chave, valor>", () => {
    const rows = [
      { id: "m-1", nome: "Onix", marca: "Chevrolet" },
      { id: "m-2", nome: "Gol", marca: "VW" }
    ];
    const map = buildProchValueMap(rows, "id", "nome");
    expect(map.get("m-1")).toBe("Onix");
    expect(map.get("m-2")).toBe("Gol");
    expect(map.size).toBe(2);
  });

  it("preserva a primeira ocorrencia em caso de chaves duplicadas", () => {
    const rows = [
      { id: "x", nome: "primeiro" },
      { id: "x", nome: "duplicado" }
    ];
    const map = buildProchValueMap(rows, "id", "nome");
    expect(map.get("x")).toBe("primeiro");
  });

  it("ignora linhas com chave nula/vazia", () => {
    const rows = [
      { id: null, nome: "sem chave" },
      { id: "", nome: "vazio" },
      { id: "ok", nome: "valido" }
    ];
    const map = buildProchValueMap(rows, "id", "nome");
    expect(map.size).toBe(1);
    expect(map.get("ok")).toBe("valido");
  });
});

describe("buildProchFetchKey / buildProchMapKey", () => {
  it("fetchKey nao depende do valueColumn (compartilhado entre PROCH na mesma tabela)", () => {
    expect(buildProchFetchKey(sampleProch)).toBe("modelos::id");
    expect(buildProchFetchKey({ ...sampleProch, lookupValueColumn: "marca" })).toBe("modelos::id");
  });

  it("mapKey diferencia por valueColumn", () => {
    expect(buildProchMapKey(sampleProch)).toBe("modelos::id::nome");
    expect(buildProchMapKey({ ...sampleProch, lookupValueColumn: "marca" })).toBe("modelos::id::marca");
  });
});

describe("buildPlaygroundFeedDataTargets propaga prochColumns", () => {
  it("inclui prochColumns no target do feed", () => {
    const feed = buildFeed([sampleProch]);
    const targets = buildPlaygroundFeedDataTargets([feed]);
    expect(targets).toHaveLength(1);
    expect(targets[0].prochColumns).toEqual([sampleProch]);
  });

  it("repassa prochColumns para targets de fragmentos", () => {
    const feed: PlaygroundFeed = {
      ...buildFeed([sampleProch]),
      fragments: [
        {
          id: "fragment-1",
          parentFeedId: "feed-1",
          sourceColumn: "placa",
          valueLiteral: "ABC1D23",
          valueLabel: "ABC1D23",
          position: { row: 5, col: 0 },
          query: DEFAULT_PLAYGROUND_FEED_QUERY,
          displayColumnOverrides: {}
        }
      ]
    };
    const targets = buildPlaygroundFeedDataTargets([feed]);
    expect(targets).toHaveLength(2);
    expect(targets[1].prochColumns).toEqual([sampleProch]);
  });
});

describe("buildPlaygroundFeedCellIndex aplica PROCH", () => {
  it("resolve celula PROCH pelo localKeyColumn na linha fonte", () => {
    const feed = buildFeed([sampleProch]);
    const target: PlaygroundFeedDataTarget = buildPlaygroundFeedDataTargets([feed])[0];

    const rows = [
      { placa: "ABC1D23", modelo_id: "m-1" },
      { placa: "DEF4G56", modelo_id: "m-2" }
    ];
    const prochMap = new Map<string, unknown>([
      ["m-1", "Onix"],
      ["m-2", "Gol"]
    ]);

    const cells = buildPlaygroundFeedCellIndex(
      [target],
      { [target.id]: rows },
      {},
      {},
      { [buildProchMapKey(sampleProch)]: prochMap }
    );

    // header (row 0) + 2 data rows; PROCH coluna esta no offset 1.
    expect(cells["0:1"].value).toBe("Modelo");
    expect(cells["1:1"].value).toBe("Onix");
    expect(cells["2:1"].value).toBe("Gol");
  });

  it("PROCH cell vazia quando o lookup nao tem a chave", () => {
    const feed = buildFeed([sampleProch]);
    const target = buildPlaygroundFeedDataTargets([feed])[0];
    const rows = [{ placa: "XYZ", modelo_id: "missing" }];
    const cells = buildPlaygroundFeedCellIndex(
      [target],
      { [target.id]: rows },
      {},
      {},
      { [buildProchMapKey(sampleProch)]: new Map([["m-1", "Onix"]]) }
    );
    expect(cells["1:1"].value).toBe("");
  });

  it("PROCH cell vazia quando o map nao foi carregado (ainda)", () => {
    const feed = buildFeed([sampleProch]);
    const target = buildPlaygroundFeedDataTargets([feed])[0];
    const rows = [{ placa: "XYZ", modelo_id: "m-1" }];
    const cells = buildPlaygroundFeedCellIndex([target], { [target.id]: rows }, {}, {}, {});
    expect(cells["1:1"].value).toBe("");
  });
});
