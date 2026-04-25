import { describe, expect, it } from "vitest";
import { ApiHttpError } from "../../errors";
import { getGridTableConfig } from "../../grid-config";
import { parseGridRequestContractInput } from "../contract";
import { resolveGridHeader } from "../header";

function getCarrosConfig() {
  const config = getGridTableConfig("carros");
  if (!config) throw new Error("missing carros config");
  return config;
}

function getConfig(table: string) {
  const config = getGridTableConfig(table);
  if (!config) throw new Error(`missing ${table} config`);
  return config;
}

describe("grid contract service", () => {
  it("accepts sort/filter/matchMode when allow-listed", () => {
    const config = getCarrosConfig();
    const searchParams = new URLSearchParams({
      page: "2",
      pageSize: "25",
      query: "abc",
      matchMode: "starts",
      sort: JSON.stringify([{ column: "created_at", dir: "desc" }]),
      filters: JSON.stringify({ placa: "=ABC1234" })
    });

    const contract = parseGridRequestContractInput({ method: "GET", searchParams }, config);

    expect(contract.page).toBe(2);
    expect(contract.pageSize).toBe(25);
    expect(contract.matchMode).toBe("starts");
    expect(contract.sort).toEqual([{ column: "created_at", dir: "desc" }]);
    expect(contract.filters).toEqual({ placa: "=ABC1234" });
  });

  it("does not request removed carros columns", () => {
    const config = getCarrosConfig();

    expect(config.readableColumns).not.toContain("os_supply_appscript");
    expect(config.readableColumns).toContain("os_supply_appscript_check");
    expect(config.readableColumns).toContain("ano_ipva_pago");
  });

  it("keeps restored carros check fields editable without adding them to the visible grid header", () => {
    const config = getCarrosConfig();
    const searchParams = new URLSearchParams();

    expect(config.readableColumns).toEqual(expect.arrayContaining(["tem_chave_r", "tem_manual"]));
    expect(config.formColumns).toEqual(expect.arrayContaining(["tem_chave_r", "tem_manual"]));

    const contract = parseGridRequestContractInput(
      {
        method: "POST",
        searchParams,
        body: {
          row: {
            id: "id-1",
            tem_chave_r: true,
            tem_manual: false
          }
        }
      },
      config
    );

    expect(contract.body?.row).toMatchObject({
      id: "id-1",
      tem_chave_r: true,
      tem_manual: false
    });
    expect(
      resolveGridHeader(config, [
        {
          id: "id-1",
          placa: "ABC1D23",
          tem_chave_r: true,
          tem_manual: false
        }
      ])
    ).not.toEqual(expect.arrayContaining(["tem_chave_r", "tem_manual"]));
  });

  it("keeps anuncio insight columns virtual and out of write/sort contracts", () => {
    const config = getConfig("anuncios");

    expect(config.virtualColumns).toEqual(expect.arrayContaining(["preco_carro_atual", "__insight_message"]));
    expect(config.editableColumns).toEqual([
      "carro_id",
      "estado_anuncio",
      "valor_anuncio",
      "descricao",
      "anuncio_legado",
      "id_anuncio_legado"
    ]);
    expect(config.formColumns).toEqual(config.editableColumns);
    expect(config.sortableColumns).not.toEqual(expect.arrayContaining(["preco_carro_atual", "__insight_message"]));

    expect(() =>
      parseGridRequestContractInput(
        {
          method: "GET",
          searchParams: new URLSearchParams({
            sort: JSON.stringify([{ column: "preco_carro_atual", dir: "desc" }])
          })
        },
        config
      )
    ).toThrowError(ApiHttpError);
  });

  it("uses dedicated form columns per table instead of falling back to generic headers", () => {
    expect(getConfig("modelos").formColumns).toEqual(["modelo"]);
    expect(getConfig("documentos").formColumns).toEqual(["carro_id", "doc_entrada", "envelope", "pericia"]);
    expect(getConfig("caracteristicas_tecnicas").formColumns).toEqual(["caracteristica"]);
    expect(getConfig("carro_caracteristicas_tecnicas").formColumns).toEqual(["carro_id", "caracteristica_id"]);
    expect(getConfig("finalizados").formColumns).toEqual([]);
    expect(getConfig("log_alteracoes").formColumns).toEqual([]);
  });

  it("rejects non allow-listed sort column", () => {
    const config = getCarrosConfig();
    const searchParams = new URLSearchParams({
      sort: JSON.stringify([{ column: "inexistente", dir: "asc" }])
    });

    expect(() => parseGridRequestContractInput({ method: "GET", searchParams }, config)).toThrowError(ApiHttpError);

    try {
      parseGridRequestContractInput({ method: "GET", searchParams }, config);
    } catch (error) {
      const e = error as ApiHttpError;
      expect(e.code).toBe("GRID_CONTRACT_INVALID_SORT");
    }
  });

  it("rejects invalid match mode", () => {
    const config = getCarrosConfig();
    const searchParams = new URLSearchParams({ matchMode: "regex" });

    try {
      parseGridRequestContractInput({ method: "GET", searchParams }, config);
      throw new Error("expected failure");
    } catch (error) {
      const e = error as ApiHttpError;
      expect(e.code).toBe("GRID_CONTRACT_INVALID_MATCH_MODE");
    }
  });

  it("rejects post payload with blocked column", () => {
    const config = getCarrosConfig();
    const searchParams = new URLSearchParams();

    try {
      parseGridRequestContractInput(
        {
          method: "POST",
          searchParams,
          body: {
            row: {
              id: "id-1",
              hacker_column: "x"
            }
          }
        },
        config
      );
      throw new Error("expected failure");
    } catch (error) {
      const e = error as ApiHttpError;
      expect(e.code).toBe("GRID_CONTRACT_INVALID_EDIT_COLUMN");
    }
  });
});
