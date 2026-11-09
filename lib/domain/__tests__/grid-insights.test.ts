import { describe, expect, it } from "vitest";

import { collectGridInsights, groupInsightsByKey, groupInsightsByPlate } from "@/lib/domain/grid-insights";

const plateOf = (row: Record<string, unknown>) => (typeof row.placa === "string" ? row.placa : null);

describe("insights do grid", () => {
  const anuncios = collectGridInsights({
    table: "anuncios",
    primaryKey: "id",
    plateOf,
    rows: [
      { id: "a1", placa: "ABC1D23", __has_pending_action: true, valor_anuncio: 100000, preco_carro_atual: 95000 },
      { id: "a2", placa: "XYZ9A88", __has_pending_action: true, valor_anuncio: 50000, preco_carro_atual: 52000 },
      { id: "a3", placa: "QWE1R23", __delete_recommended: true },
      { id: "a4", placa: "ZZZ0Z00" }
    ]
  });

  it("FILA: um card por problema, o mais grave primeiro, só com ocorrência", () => {
    const groups = groupInsightsByKey(anuncios);
    expect(groups.map((group) => [group.title, group.occurrences.length])).toEqual([
      ["Apagar anúncio", 1],
      ["Preço divergente", 2]
    ]);
    // O card descreve o caso da vez (o 1º); resolvido, o próximo assume.
    expect(groups[1].occurrences[0]).toMatchObject({ rowId: "a1", placa: "ABC1D23" });
    expect(groups[1].occurrences[0].detail).toContain("100.000");
  });

  it("PESQUISA: agrupa por placa, filtra pela busca e esconde placa sem ocorrência", () => {
    expect(groupInsightsByPlate(anuncios, "").map((group) => group.placa)).toEqual(["ABC1D23", "QWE1R23", "XYZ9A88"]);
    expect(groupInsightsByPlate(anuncios, "xyz 9").map((group) => group.placa)).toEqual(["XYZ9A88"]);
    expect(groupInsightsByPlate(anuncios, "zzz")).toEqual([]);
  });

  it("documentos: cada flag vira uma ocorrência; carros: pendência de confirmação", () => {
    const documentos = collectGridInsights({
      table: "documentos",
      primaryKey: "carro_id",
      plateOf,
      rows: [{ carro_id: "c1", placa: "AAA1A11", __crlv_aguardando: true, __finalizar_documento: true, envelope: "FECHANDO" }]
    });
    expect(documentos.map((occurrence) => occurrence.key)).toEqual(["documentos:crlv", "documentos:finalizar"]);

    const carros = collectGridInsights({
      table: "carros",
      primaryKey: "id",
      plateOf,
      rows: [
        { id: "c1", placa: "AAA1A11", info_confirmada: { campos: true, chave_manual: true } },
        { id: "c2", placa: "BBB2B22", info_confirmada: { campos: true, chave_manual: false } }
      ]
    });
    expect(carros).toHaveLength(1);
    expect(carros[0]).toMatchObject({ rowId: "c2", title: "Veículo não confirmado" });
  });

  it("vendas: vendido sem data (venda marcada ou linha virtual sem venda)", () => {
    const vendas = collectGridInsights({
      table: "vendas",
      primaryKey: "id",
      plateOf,
      rows: [
        { id: "v1", placa: "AAA1A11", __venda_sem_data: true },
        { id: "missing:c2", placa: "BBB2B22", __missing_data: true, __venda_sem_data: true },
        { id: "v3", placa: "CCC3C33" }
      ]
    });
    const groups = groupInsightsByKey(vendas);
    expect(groups.find((group) => group.key === "vendas:sem-data")?.occurrences.map((entry) => entry.rowId)).toEqual(["v1", "missing:c2"]);
    // Linha virtual não entra na conferência de campos importantes.
    expect(groups.find((group) => group.key === "compliance:vendas")?.occurrences.map((entry) => entry.rowId)).toEqual(["v1", "v3"]);
  });
});
