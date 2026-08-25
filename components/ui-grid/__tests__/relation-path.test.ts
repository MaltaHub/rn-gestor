import { describe, expect, it } from "vitest";
import {
  MAX_RELATION_PATH_DEPTH,
  buildRelationPathLookup,
  collectRelationPathTables,
  describeRelationPath,
  formatRelationPath,
  getRelationPathTargetTable,
  isMultiHopRelationPath,
  parseRelationPath,
  resolveRelationPath,
  resolveRelationPathValue
} from "@/components/ui-grid/core/relation-path";
import {
  RELATION_PATH_BACK_KEY,
  buildRelationPathOptions,
  buildRelationPathSelection,
  canDeepenRelationPath,
  describeRelationPathProgress,
  readRelationPathEnterColumn
} from "@/components/ui-grid/core/relation-path-options";
import { buildRelationDisplayLookup } from "@/components/ui-grid/core/grid-rules";
import type { GridListPayload, SheetKey } from "@/components/ui-grid/types";

/**
 * Cadeias reais do schema (components/ui-grid/core/relations.generated.ts):
 *   documentos.carro_id  -> carros.id
 *   carros.modelo_id     -> modelos.id
 *   repetidos.grupo_id   -> grupos_repetidos.grupo_id
 *   grupos_repetidos.modelo_id -> modelos.id
 */
const CARRO_RELATION = { table: "carros" as SheetKey, keyColumn: "id" };
const GRUPO_RELATION = { table: "grupos_repetidos" as SheetKey, keyColumn: "grupo_id" };

function payload(table: SheetKey, rows: Array<Record<string, unknown>>): GridListPayload {
  return {
    table,
    label: table,
    header: Object.keys(rows[0] ?? {}),
    formColumns: [],
    rows,
    totalRows: rows.length,
    page: 1,
    pageSize: 200,
    sort: [],
    filters: {}
  };
}

const carros = [
  { id: "carro-1", placa: "AAA1A11", modelo_id: "m-1" },
  { id: "carro-2", placa: "BBB2B22", modelo_id: "m-2" },
  { id: "carro-3", placa: "CCC3C33", modelo_id: null }
];
const modelos = [
  { id: "m-1", modelo: "ONIX 1.0", marca: "CHEVROLET" },
  { id: "m-2", modelo: "GOL 1.6", marca: "VW" }
];

const rowsByTable: Partial<Record<SheetKey, Array<Record<string, unknown>>>> = {
  carros,
  modelos
};
const getRows = (table: SheetKey) => rowsByTable[table] ?? null;

describe("parse/format de caminho", () => {
  it("faz round-trip e limpa espacos e segmentos vazios", () => {
    expect(parseRelationPath("modelo_id>modelo")).toEqual(["modelo_id", "modelo"]);
    expect(parseRelationPath(" modelo_id > modelo ")).toEqual(["modelo_id", "modelo"]);
    expect(parseRelationPath("modelo_id>>modelo")).toEqual(["modelo_id", "modelo"]);
    expect(formatRelationPath(["modelo_id", "modelo"])).toBe("modelo_id>modelo");
  });

  it("caminho vazio vira lista vazia", () => {
    expect(parseRelationPath("")).toEqual([]);
    expect(parseRelationPath("   ")).toEqual([]);
  });

  it("reconhece caminho de mais de um salto", () => {
    expect(isMultiHopRelationPath("placa")).toBe(false);
    expect(isMultiHopRelationPath("modelo_id>modelo")).toBe(true);
  });
});

describe("resolveRelationPath", () => {
  // COMPATIBILIDADE: toda configuracao ja salva e um caminho de um salto.
  it("resolve o formato antigo (uma coluna sozinha) como um salto", () => {
    const resolved = resolveRelationPath(CARRO_RELATION, "placa");
    expect(resolved).toEqual({
      hops: [],
      displayTable: "carros",
      displayColumn: "placa",
      tables: ["carros"]
    });
  });

  it("resolve dois saltos atravessando uma FK intermediaria", () => {
    const resolved = resolveRelationPath(CARRO_RELATION, "modelo_id>modelo");
    expect(resolved?.displayTable).toBe("modelos");
    expect(resolved?.displayColumn).toBe("modelo");
    expect(resolved?.hops).toEqual([
      { fromTable: "carros", column: "modelo_id", relation: { table: "modelos", keyColumn: "id" } }
    ]);
    expect(resolved?.tables).toEqual(["carros", "modelos"]);
  });

  it("resolve tres niveis (repetidos -> grupos -> modelos)", () => {
    const resolved = resolveRelationPath(GRUPO_RELATION, "modelo_id>modelo");
    expect(resolved?.displayTable).toBe("modelos");
    expect(resolved?.tables).toEqual(["grupos_repetidos", "modelos"]);
  });

  it("rejeita caminho cujo segmento do meio nao e FK", () => {
    // `placa` nao aponta para lugar nenhum: nao da pra saltar a partir dela.
    expect(resolveRelationPath(CARRO_RELATION, "placa>modelo")).toBeNull();
  });

  it("rejeita caminho vazio e relacao ausente", () => {
    expect(resolveRelationPath(CARRO_RELATION, "")).toBeNull();
    expect(resolveRelationPath(null, "placa")).toBeNull();
  });

  it("rejeita caminho mais fundo que o teto", () => {
    const tooDeep = Array.from({ length: MAX_RELATION_PATH_DEPTH + 1 }, () => "modelo_id").join(">");
    expect(resolveRelationPath(CARRO_RELATION, tooDeep)).toBeNull();
  });
});

describe("getRelationPathTargetTable", () => {
  it("segue os segmentos como FK ate a tabela final", () => {
    expect(getRelationPathTargetTable(CARRO_RELATION, [])).toBe("carros");
    expect(getRelationPathTargetTable(CARRO_RELATION, ["modelo_id"])).toBe("modelos");
  });

  it("devolve null se algum segmento nao for FK", () => {
    expect(getRelationPathTargetTable(CARRO_RELATION, ["placa"])).toBeNull();
  });
});

describe("collectRelationPathTables", () => {
  it("lista todas as tabelas do caminho", () => {
    expect(collectRelationPathTables(CARRO_RELATION, "modelo_id>modelo")).toEqual(["carros", "modelos"]);
  });

  it("caminho invalido ainda pede a tabela base (a UI precisa dela)", () => {
    expect(collectRelationPathTables(CARRO_RELATION, "placa>modelo")).toEqual(["carros"]);
  });
});

describe("buildRelationPathLookup", () => {
  it("um salto: comportamento historico intacto", () => {
    const lookup = buildRelationPathLookup({ baseRelation: CARRO_RELATION, path: "placa", getRows });
    expect(lookup).toEqual({ "carro-1": "AAA1A11", "carro-2": "BBB2B22", "carro-3": "CCC3C33" });
  });

  // O ponto do pedido: o resultado do primeiro salto e outra FK e mesmo assim
  // a celula termina com um rotulo legivel.
  it("dois saltos: id da FK intermediaria vira rotulo final", () => {
    const lookup = buildRelationPathLookup({ baseRelation: CARRO_RELATION, path: "modelo_id>modelo", getRows });
    expect(lookup?.["carro-1"]).toBe("ONIX 1.0");
    expect(lookup?.["carro-2"]).toBe("GOL 1.6");
  });

  it("elo nulo no meio fica FORA do mapa (celula cai no valor cru)", () => {
    const lookup = buildRelationPathLookup({ baseRelation: CARRO_RELATION, path: "modelo_id>modelo", getRows });
    expect(lookup && "carro-3" in lookup).toBe(false);
  });

  it("elo apontando para linha inexistente tambem fica fora", () => {
    const orfao = [...carros, { id: "carro-4", placa: "DDD", modelo_id: "m-inexistente" }];
    const lookup = buildRelationPathLookup({
      baseRelation: CARRO_RELATION,
      path: "modelo_id>modelo",
      getRows: (table) => (table === "carros" ? orfao : getRows(table))
    });
    expect(lookup && "carro-4" in lookup).toBe(false);
  });

  it("devolve null quando falta uma tabela do caminho (nao instala mapa pela metade)", () => {
    const lookup = buildRelationPathLookup({
      baseRelation: CARRO_RELATION,
      path: "modelo_id>modelo",
      getRows: (table) => (table === "carros" ? carros : null)
    });
    expect(lookup).toBeNull();
  });

  it("devolve null para caminho invalido", () => {
    expect(buildRelationPathLookup({ baseRelation: CARRO_RELATION, path: "placa>modelo", getRows })).toBeNull();
  });
});

describe("resolveRelationPathValue", () => {
  it("expande um valor solto seguindo o caminho", () => {
    expect(
      resolveRelationPathValue({ rawValue: "carro-1", baseRelation: CARRO_RELATION, path: "modelo_id>marca", getRows })
    ).toBe("CHEVROLET");
  });

  it("mantem o valor cru quando nao ha como resolver", () => {
    expect(
      resolveRelationPathValue({ rawValue: "carro-9", baseRelation: CARRO_RELATION, path: "modelo_id>marca", getRows })
    ).toBe("carro-9");
    expect(
      resolveRelationPathValue({ rawValue: null, baseRelation: CARRO_RELATION, path: "placa", getRows })
    ).toBeNull();
  });
});

describe("buildRelationDisplayLookup com caminho profundo", () => {
  const relationCache: Partial<Record<SheetKey, GridListPayload>> = {
    carros: payload("carros", carros),
    modelos: payload("modelos", modelos)
  };

  it("expande documentos.carro_id ate modelos.modelo (dois saltos)", () => {
    const lookup = buildRelationDisplayLookup("documentos", { carro_id: "modelo_id>modelo" }, relationCache);
    expect(lookup.carro_id["carro-1"]).toBe("ONIX 1.0");
    expect(lookup.carro_id["carro-2"]).toBe("GOL 1.6");
  });

  it("continua funcionando com override de uma coluna so", () => {
    const lookup = buildRelationDisplayLookup("documentos", { carro_id: "placa" }, relationCache);
    expect(lookup.carro_id["carro-1"]).toBe("AAA1A11");
  });

  it("nao instala a coluna quando falta a tabela do segundo salto", () => {
    const lookup = buildRelationDisplayLookup("documentos", { carro_id: "modelo_id>modelo" }, {
      carros: payload("carros", carros)
    });
    expect(lookup.carro_id).toBeUndefined();
  });
});

describe("opcoes do seletor (drill-down)", () => {
  const columns = ["id", "placa", "modelo_id"];

  it("oferece 'entrar' apenas nas colunas que sao FK", () => {
    const options = buildRelationPathOptions({ baseRelation: CARRO_RELATION, segments: [], columns });
    const keys = options.map((option) => option.key);

    expect(keys).toContain("placa");
    expect(keys).toContain("modelo_id");
    expect(keys).toContain("__enter__:modelo_id");
    // `placa` nao e FK: nao ha para onde entrar.
    expect(keys).not.toContain("__enter__:placa");
  });

  it("sem saltos escolhidos nao mostra 'voltar'", () => {
    const options = buildRelationPathOptions({ baseRelation: CARRO_RELATION, segments: [], columns });
    expect(options.map((option) => option.key)).not.toContain(RELATION_PATH_BACK_KEY);
  });

  it("com salto escolhido mostra 'voltar' e lista as colunas do nivel novo", () => {
    const options = buildRelationPathOptions({
      baseRelation: CARRO_RELATION,
      segments: ["modelo_id"],
      columns: ["id", "modelo", "marca"]
    });
    const keys = options.map((option) => option.key);

    expect(keys[0]).toBe(RELATION_PATH_BACK_KEY);
    expect(keys).toContain("modelo");
    expect(keys).toContain("marca");
  });

  it("o teto de profundidade fecha o 'entrar'", () => {
    expect(canDeepenRelationPath([])).toBe(true);
    expect(canDeepenRelationPath(["modelo_id"])).toBe(true);
    // +1 pela coluna de exibicao que ainda falta escolher.
    expect(canDeepenRelationPath(Array.from({ length: MAX_RELATION_PATH_DEPTH - 1 }, () => "modelo_id"))).toBe(false);
  });

  it("nivel cuja tabela nao tem FK nenhuma nao oferece 'entrar'", () => {
    // `modelos` nao e origem de FK: o caminho termina ali por natureza.
    const options = buildRelationPathOptions({
      baseRelation: CARRO_RELATION,
      segments: ["modelo_id"],
      columns: ["id", "modelo", "marca"]
    });
    expect(options.some((option) => option.key.startsWith("__enter__:"))).toBe(false);
  });

  it("no teto, nem uma coluna FK ganha 'entrar'", () => {
    const atCap = Array.from({ length: MAX_RELATION_PATH_DEPTH - 1 }, () => "modelo_id");
    const options = buildRelationPathOptions({ baseRelation: CARRO_RELATION, segments: atCap, columns });
    expect(options.some((option) => option.key.startsWith("__enter__:"))).toBe(false);
  });

  it("le a coluna de uma chave 'entrar'", () => {
    expect(readRelationPathEnterColumn("__enter__:modelo_id")).toBe("modelo_id");
    expect(readRelationPathEnterColumn("modelo_id")).toBeNull();
  });

  it("monta o caminho final juntando saltos + coluna escolhida", () => {
    expect(buildRelationPathSelection([], "placa")).toBe("placa");
    expect(buildRelationPathSelection(["modelo_id"], "modelo")).toBe("modelo_id>modelo");
    expect(buildRelationPathSelection(["grupo_id", "modelo_id"], "marca")).toBe("grupo_id>modelo_id>marca");
  });
});

describe("rotulos legiveis", () => {
  it("descreve o caminho completo", () => {
    expect(describeRelationPath(CARRO_RELATION, "modelo_id>modelo")).toBe("carros.modelo_id > modelos.modelo");
    expect(describeRelationPath(CARRO_RELATION, "placa")).toBe("carros.placa");
  });

  it("descreve o progresso dentro do dialogo", () => {
    expect(describeRelationPathProgress(CARRO_RELATION, [])).toBe("carros");
    expect(describeRelationPathProgress(CARRO_RELATION, ["modelo_id"])).toBe("carros > modelo_id → modelos");
  });
});
