import { describe, expect, it } from "vitest";
import { toDisplay } from "@/components/ui-grid/value-format";

describe("toDisplay", () => {
  it("nao trata texto com 'T' como data (regressao CRETA 1.6 -> 06/01/2001)", () => {
    expect(toDisplay("CRETA 1.6", "modelo")).toBe("CRETA 1.6");
    expect(toDisplay("CRETA 1.6 ACTION AUTOMÁTICO", "modelo")).toBe("CRETA 1.6 ACTION AUTOMÁTICO");
    expect(toDisplay("TURBO", "modelo")).toBe("TURBO");
  });

  it("formata timestamp ISO 8601 (timestamptz do Postgres)", () => {
    expect(toDisplay("2026-05-28T19:05:21.433782+00:00", "created_at")).toContain("2026");
    expect(toDisplay("2026-05-28T19:05:21Z", "created_at")).toContain("2026");
  });

  it("nao formata data-only nem texto solto", () => {
    // sem hora -> mantem cru (evita shift de fuso)
    expect(toDisplay("2026-05-28", "data_venda")).toBe("2026-05-28");
    expect(toDisplay("FLR1H39", "placa")).toBe("FLR1H39");
  });

  it("preserva moeda e numeros", () => {
    expect(toDisplay(15000, "preco_venda")).toContain("R$");
    expect(toDisplay(true, "ativo")).toBe("Sim");
    expect(toDisplay(null, "qualquer")).toBe("");
  });
});
