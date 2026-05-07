import { describe, expect, it } from "vitest";
import { isVehicleSoldByEstadoVenda, resolveVehicleFolderDisplayName } from "../service";

describe("file automation service", () => {
  it("resolves managed vehicle folder labels from the configured display field", () => {
    const car = {
      id: "car-1",
      placa: "ABC1D23",
      nome: "Fit loja",
      chassi: "9BWZZZ377VT004251",
      estado_venda: "DISPONIVEL",
      em_estoque: true,
      data_venda: null,
      modelos: { modelo: "FIT" },
    };

    expect(resolveVehicleFolderDisplayName(car, "placa")).toBe("ABC1D23");
    expect(resolveVehicleFolderDisplayName(car, "modelo")).toBe("FIT");
    expect(resolveVehicleFolderDisplayName(car, "id")).toBe("car-1");
  });

  it("falls back to stable vehicle values when the chosen display field is empty", () => {
    expect(
      resolveVehicleFolderDisplayName(
        {
          id: "car-2",
          placa: "",
          nome: null,
          chassi: "CHASSI-2",
          estado_venda: "DISPONIVEL",
          em_estoque: true,
          data_venda: null,
          modelos: null,
        },
        "placa",
      ),
    ).toBe("CHASSI-2");
  });

  it("treats only the exact sold sale status as sold for repository routing", () => {
    expect(isVehicleSoldByEstadoVenda("VENDIDO")).toBe(true);
    expect(isVehicleSoldByEstadoVenda("vendido")).toBe(true);
    expect(isVehicleSoldByEstadoVenda("Vendido")).toBe(true);
    expect(isVehicleSoldByEstadoVenda("FINALIZADO")).toBe(false);
    expect(isVehicleSoldByEstadoVenda("DISPONIVEL")).toBe(false);
    expect(isVehicleSoldByEstadoVenda(null)).toBe(false);
  });
});
