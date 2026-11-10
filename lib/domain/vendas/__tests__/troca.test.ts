import { describe, expect, it } from "vitest";
import { trocaCarroNovoSchema } from "@/lib/domain/vendas/schemas";
import { linhaCarroTroca } from "@/lib/domain/vendas/troca";

const BASE = { placa: "xyz9a87", modelo: "GOL 1.0", local: "Galpão", proposito: "REPASSE" as const };

describe("cadastro do veículo da troca", () => {
  it("leva tudo o que o cadastro de carros exige + o propósito (o bug: faltavam local/estado/modelo)", () => {
    const troca = trocaCarroNovoSchema.parse({ ...BASE, cor: "BRANCO", ano_fab: 2014, ano_mod: 2015, chassi: "9bwaa05u0fp000001" });
    expect(linhaCarroTroca(troca, "m-gol")).toEqual({
      placa: "XYZ9A87",
      modelo_id: "m-gol",
      local: "Galpão",
      estado_venda: "DISPONÍVEL",
      estado_veiculo: "PREPARAÇÃO",
      proposito: "REPASSE",
      cor: "BRANCO",
      ano_fab: 2014,
      ano_mod: 2015,
      hodometro: null,
      chassi: "9BWAA05U0FP000001",
      renavam: null
    });
  });

  it("modelo, local e propósito são obrigatórios", () => {
    expect(trocaCarroNovoSchema.safeParse({ placa: "XYZ9A87" }).success).toBe(false);
    expect(trocaCarroNovoSchema.safeParse({ ...BASE, local: "" }).success).toBe(false);
    expect(trocaCarroNovoSchema.safeParse({ ...BASE, modelo: "" }).success).toBe(false);
    expect(trocaCarroNovoSchema.safeParse({ ...BASE, proposito: "ESTOQUE" }).success).toBe(false);
    expect(trocaCarroNovoSchema.safeParse(BASE).success).toBe(true);
  });
});
