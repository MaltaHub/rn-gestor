import { describe, expect, it } from "vitest";
import { buildVehicleFlags } from "@/lib/domain/carros/flags";

describe("buildVehicleFlags", () => {
  it("marca IPVA PAGO (destaque) apenas quando o ano pago e o corrente", () => {
    expect(buildVehicleFlags({ ano_ipva_pago: 2026 }, 2026)).toEqual([
      { label: "IPVA PAGO", highlight: true }
    ]);
    expect(buildVehicleFlags({ ano_ipva_pago: 2025 }, 2026)).toEqual([]);
    expect(buildVehicleFlags({ ano_ipva_pago: null }, 2026)).toEqual([]);
  });

  it("marca Manual e Chave Reserva quando os booleanos estao verdadeiros", () => {
    expect(buildVehicleFlags({ tem_manual: true, tem_chave_r: true }, 2026)).toEqual([
      { label: "Manual", highlight: false },
      { label: "Chave Reserva", highlight: false }
    ]);
    expect(buildVehicleFlags({ tem_manual: false, tem_chave_r: null }, 2026)).toEqual([]);
  });

  it("preserva a ordem IPVA > Manual > Chave Reserva", () => {
    const flags = buildVehicleFlags(
      { ano_ipva_pago: 2026, tem_manual: true, tem_chave_r: true },
      2026
    );
    expect(flags.map((flag) => flag.label)).toEqual(["IPVA PAGO", "Manual", "Chave Reserva"]);
  });
});
