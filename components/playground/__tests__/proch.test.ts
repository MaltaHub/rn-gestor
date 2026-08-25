import { describe, expect, it } from "vitest";
import {
  buildProchFetchKey,
  buildProchLookupKey,
  buildProchMapKey,
  buildProchValueMap,
  buildPlaygroundFeedDataTargets,
  buildPlaygroundFeedCellIndex,
  expandProchValueMap,
  hasProchValueExpansion,
  resolveProchValueRelation,
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
    expect(buildProchMapKey(sampleProch)).toBe("modelos::id::nome::");
    expect(buildProchMapKey({ ...sampleProch, lookupValueColumn: "marca" })).toBe("modelos::id::marca::");
  });

  // A expansao muda o CONTEUDO do mapa (ids viram rotulos), entao precisa mudar
  // a identidade dele — senao o render reaproveita o mapa nao-expandido.
  it("mapKey diferencia por expansao da FK do resultado", () => {
    expect(buildProchMapKey({ ...sampleProch, lookupValueDisplayColumn: "modelo" })).toBe(
      "modelos::id::nome::modelo"
    );
    expect(buildProchMapKey({ ...sampleProch, lookupValueDisplayColumn: "modelo" })).not.toBe(
      buildProchMapKey(sampleProch)
    );
  });

  it("fetchKey ignora a expansao (mesmo fetch da tabela alvo)", () => {
    expect(buildProchFetchKey({ ...sampleProch, lookupValueDisplayColumn: "modelo" })).toBe("modelos::id");
  });
});

// PROCH que devolve OUTRA FK: sem expansao a celula mostrava o id cru e nao
// havia como resolver. `carros.modelo_id` e FK declarada para `modelos.id`.
const prochQueDevolveFk: PlaygroundProchColumn = {
  id: `${PROCH_COLUMN_ID_PREFIX}carro-modelo`,
  label: "Modelo do carro",
  localKeyColumn: "carro_id",
  lookupTable: "carros",
  lookupKeyColumn: "id",
  lookupValueColumn: "modelo_id"
};

describe("resolveProchValueRelation", () => {
  it("encontra a FK quando a coluna puxada e uma FK declarada", () => {
    expect(resolveProchValueRelation(prochQueDevolveFk)).toEqual({ table: "modelos", keyColumn: "id" });
  });

  it("devolve null quando a coluna puxada nao e FK", () => {
    expect(resolveProchValueRelation({ ...prochQueDevolveFk, lookupValueColumn: "placa" })).toBeNull();
  });

  it("devolve null com configuracao incompleta", () => {
    expect(resolveProchValueRelation({ ...prochQueDevolveFk, lookupValueColumn: "" })).toBeNull();
    expect(resolveProchValueRelation({ ...prochQueDevolveFk, lookupTable: "" as never })).toBeNull();
  });

  it("hasProchValueExpansion exige FK E coluna de exibicao escolhida", () => {
    expect(hasProchValueExpansion(prochQueDevolveFk)).toBe(false);
    expect(hasProchValueExpansion({ ...prochQueDevolveFk, lookupValueDisplayColumn: "modelo" })).toBe(true);
    // Coluna de exibicao sem FK no resultado nao expande nada.
    expect(
      hasProchValueExpansion({ ...prochQueDevolveFk, lookupValueColumn: "placa", lookupValueDisplayColumn: "modelo" })
    ).toBe(false);
  });
});

describe("expandProchValueMap", () => {
  it("troca os ids do resultado pelos rotulos da tabela apontada", () => {
    const valueMap = buildProchValueMap(
      [
        { id: "carro-1", modelo_id: "m-1" },
        { id: "carro-2", modelo_id: "m-2" }
      ],
      "id",
      "modelo_id"
    );
    const labelByKey = buildProchValueMap(
      [
        { id: "m-1", modelo: "ONIX 1.0" },
        { id: "m-2", modelo: "GOL 1.6" }
      ],
      "id",
      "modelo"
    );

    const expanded = expandProchValueMap(valueMap, labelByKey);

    expect(expanded.get("carro-1")).toBe("ONIX 1.0");
    expect(expanded.get("carro-2")).toBe("GOL 1.6");
  });

  it("mantem o valor cru quando o id nao casa (melhor que apagar a celula)", () => {
    const valueMap = new Map<string, unknown>([["carro-1", "m-desconhecido"]]);
    const expanded = expandProchValueMap(valueMap, new Map([["m-1", "ONIX"]]));
    expect(expanded.get("carro-1")).toBe("m-desconhecido");
  });

  it("preserva valor nulo/vazio sem inventar rotulo", () => {
    const valueMap = new Map<string, unknown>([
      ["a", null],
      ["b", ""]
    ]);
    const expanded = expandProchValueMap(valueMap, new Map([["m-1", "ONIX"]]));
    expect(expanded.get("a")).toBeNull();
    expect(expanded.get("b")).toBe("");
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

  // Ponta a ponta da expansao: PROCH que devolve outra FK renderiza o ROTULO,
  // nao o id. Antes nao havia como configurar isto e a celula ficava com o id.
  it("PROCH com FK no resultado renderiza o rotulo expandido", () => {
    const proch: PlaygroundProchColumn = { ...prochQueDevolveFk, lookupValueDisplayColumn: "modelo" };
    const feed: PlaygroundFeed = {
      ...buildFeed([proch]),
      table: "documentos",
      columns: ["carro_id", proch.id],
      columnLabels: { carro_id: "Carro", [proch.id]: proch.label }
    };
    const target = buildPlaygroundFeedDataTargets([feed])[0];
    const rows = [{ carro_id: "carro-1" }, { carro_id: "carro-2" }];

    const valueMap = buildProchValueMap(
      [
        { id: "carro-1", modelo_id: "m-1" },
        { id: "carro-2", modelo_id: "m-2" }
      ],
      "id",
      "modelo_id"
    );
    const expanded = expandProchValueMap(
      valueMap,
      buildProchValueMap(
        [
          { id: "m-1", modelo: "ONIX 1.0" },
          { id: "m-2", modelo: "GOL 1.6" }
        ],
        "id",
        "modelo"
      )
    );

    const cells = buildPlaygroundFeedCellIndex(
      [target],
      { [target.id]: rows },
      {},
      {},
      { [buildProchMapKey(proch)]: expanded }
    );

    expect(cells["1:1"].value).toBe("ONIX 1.0");
    expect(cells["2:1"].value).toBe("GOL 1.6");
  });

  it("sem expansao escolhida, a celula continua mostrando o id (comportamento antigo)", () => {
    const feed: PlaygroundFeed = {
      ...buildFeed([prochQueDevolveFk]),
      table: "documentos",
      columns: ["carro_id", prochQueDevolveFk.id],
      columnLabels: { carro_id: "Carro", [prochQueDevolveFk.id]: prochQueDevolveFk.label }
    };
    const target = buildPlaygroundFeedDataTargets([feed])[0];

    const cells = buildPlaygroundFeedCellIndex(
      [target],
      { [target.id]: [{ carro_id: "carro-1" }] },
      {},
      {},
      { [buildProchMapKey(prochQueDevolveFk)]: new Map([["carro-1", "m-1"]]) }
    );

    expect(cells["1:1"].value).toBe("m-1");
  });
});
