import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRID_FETCH_BATCH_SIZE, fetchAllSheetRows } from "@/components/ui-grid/api";
import { buildRelationDisplayLookup } from "@/components/ui-grid/core/grid-rules";
import type { GridListPayload, SheetKey } from "@/components/ui-grid/types";

/** Teto real que o servidor aplica em `pageSize` (lib/api/grid/contract.ts). */
const SERVER_PAGE_SIZE_CLAMP = 200;

type FakeRow = Record<string, unknown>;

function buildCarros(total: number): FakeRow[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `carro-${index}`,
    placa: `PLACA${String(index).padStart(4, "0")}`
  }));
}

/**
 * Servidor de mentira que se comporta como o real: CLAMPA o pageSize pedido e
 * ECOA o valor clampado no payload. Pedir 1000 devolve 200 linhas, sem erro.
 */
function installFakeGridApi(rows: FakeRow[]) {
  const requestedPageSizes: number[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const requestedPageSize = Number(url.searchParams.get("pageSize"));
    const page = Number(url.searchParams.get("page"));
    requestedPageSizes.push(requestedPageSize);

    const pageSize = Math.min(SERVER_PAGE_SIZE_CLAMP, Math.max(1, requestedPageSize));
    const from = (page - 1) * pageSize;

    const payload: GridListPayload = {
      table: "carros" as SheetKey,
      label: "Carros",
      header: ["id", "placa"],
      formColumns: ["placa"],
      rows: rows.slice(from, from + pageSize),
      totalRows: rows.length,
      page,
      pageSize,
      sort: [],
      filters: {}
    };

    return new Response(JSON.stringify({ data: payload }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requestedPageSizes };
}

const requestAuth = { accessToken: "token-de-teste", devRole: null };

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchAllSheetRows", () => {
  it("nunca pede mais que o teto do servidor", async () => {
    const { requestedPageSizes } = installFakeGridApi(buildCarros(215));

    await fetchAllSheetRows({ table: "carros" as SheetKey, requestAuth });

    expect(requestedPageSizes.every((size) => size <= SERVER_PAGE_SIZE_CLAMP)).toBe(true);
    expect(GRID_FETCH_BATCH_SIZE).toBeLessThanOrEqual(SERVER_PAGE_SIZE_CLAMP);
  });

  // REGRESSAO (o bug do grid de DOCUMENTOS): 215 carros com um unico fetch de
  // `pageSize: 1000` voltavam 200 — os 15 restantes ficavam de fora do mapa de
  // FK e a celula mostrava o UUID cru no lugar da placa.
  it("pagina ate trazer TODAS as linhas quando o total passa do teto", async () => {
    const carros = buildCarros(215);
    const { fetchMock } = installFakeGridApi(carros);

    const payload = await fetchAllSheetRows({ table: "carros" as SheetKey, requestAuth });

    expect(payload.rows).toHaveLength(215);
    expect(payload.totalRows).toBe(215);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const ids = payload.rows.map((row) => row.id);
    expect(ids[0]).toBe("carro-0");
    expect(ids.at(-1)).toBe("carro-214");
    expect(new Set(ids).size).toBe(215);
  });

  it("faz uma unica chamada quando tudo cabe num lote", async () => {
    const { fetchMock } = installFakeGridApi(buildCarros(12));

    const payload = await fetchAllSheetRows({ table: "carros" as SheetKey, requestAuth });

    expect(payload.rows).toHaveLength(12);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lida com total multiplo exato do lote sem duplicar nem perder linha", async () => {
    const { fetchMock } = installFakeGridApi(buildCarros(400));

    const payload = await fetchAllSheetRows({ table: "carros" as SheetKey, requestAuth });

    expect(payload.rows).toHaveLength(400);
    expect(new Set(payload.rows.map((row) => row.id)).size).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respeita maxRows paginando ate o teto e sinaliza o corte", async () => {
    const { fetchMock } = installFakeGridApi(buildCarros(1000));

    const payload = await fetchAllSheetRows({
      table: "carros" as SheetKey,
      requestAuth,
      maxRows: 450
    });

    expect(payload.rows).toHaveLength(450);
    // `totalRows` e o total do SERVIDOR: e assim que o chamador percebe o corte.
    expect(payload.totalRows).toBe(1000);
    expect(payload.totalRows > payload.rows.length).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sem corte, maxRows nao marca truncamento", async () => {
    installFakeGridApi(buildCarros(215));

    const payload = await fetchAllSheetRows({
      table: "carros" as SheetKey,
      requestAuth,
      maxRows: 2000
    });

    expect(payload.rows).toHaveLength(215);
    expect(payload.totalRows > payload.rows.length).toBe(false);
  });

  it("devolve tabela vazia sem entrar em loop", async () => {
    const { fetchMock } = installFakeGridApi([]);

    const payload = await fetchAllSheetRows({ table: "carros" as SheetKey, requestAuth });

    expect(payload.rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("mapa de FK montado a partir do dominio completo", () => {
  // Fecha o ciclo do bug: com o domino inteiro em cache, o `carro_id` do carro
  // 214 (fora do primeiro lote) resolve para a placa em vez do id cru.
  it("resolve rotulo de linha que estava fora do primeiro lote", async () => {
    installFakeGridApi(buildCarros(215));

    const carrosPayload = await fetchAllSheetRows({ table: "carros" as SheetKey, requestAuth });

    const lookup = buildRelationDisplayLookup(
      "documentos" as SheetKey,
      { carro_id: "placa" },
      { carros: carrosPayload }
    );

    expect(lookup.carro_id["carro-0"]).toBe("PLACA0000");
    expect(lookup.carro_id["carro-214"]).toBe("PLACA0214");
    expect(Object.keys(lookup.carro_id)).toHaveLength(215);
  });
});
