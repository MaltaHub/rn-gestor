import { describe, expect, it } from "vitest";
import { ApiHttpError } from "../../errors";
import { getGridTableConfig } from "../../grid-config";
import { parseGridRequestContractInput } from "../contract";

function getCarrosConfig() {
  const config = getGridTableConfig("carros");
  if (!config) throw new Error("missing carros config");
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
