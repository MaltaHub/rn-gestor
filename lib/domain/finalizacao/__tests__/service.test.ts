import { describe, expect, it, vi } from "vitest";

import { dataLimiteFinalizacao, diasDesde, executarFinalizacao, hojeNaLoja } from "@/lib/domain/finalizacao/service";

describe("datas da finalização (fuso da loja)", () => {
  it("hoje no fuso de São Paulo, limite de 90 dias e dias corridos", () => {
    // 02:00 UTC do dia 6 = ainda dia 5 em São Paulo.
    expect(hojeNaLoja(new Date("2026-11-06T02:00:00Z"))).toBe("2026-11-05");
    expect(dataLimiteFinalizacao("2026-11-06")).toBe("2026-08-08");
    expect(diasDesde("2026-08-08", "2026-11-06")).toBe(90);
  });
});

describe("executarFinalizacao", () => {
  function supabaseVendidos(rows: Array<{ id: string; placa: string; data_venda: string | null }>) {
    const rpc = vi.fn();
    const client = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({ order: async () => ({ data: rows, error: null }) })
        })
      })
    };
    return { client, rpc };
  }

  it("desligada: só relatório (elegíveis e sem data), nada é apagado", async () => {
    const { client, rpc } = supabaseVendidos([
      { id: "a", placa: "AAA1A11", data_venda: "2026-01-10" },
      { id: "b", placa: "BBB2B22", data_venda: "2026-10-30" },
      { id: "c", placa: "CCC3C33", data_venda: null }
    ]);
    const resultado = await executarFinalizacao(client as never, { ativa: false, now: new Date("2026-11-06T15:00:00Z") });
    expect(resultado.elegiveis.map((carro) => carro.placa)).toEqual(["AAA1A11"]);
    expect(resultado.semDataVenda.map((carro) => carro.placa)).toEqual(["CCC3C33"]);
    expect(resultado.finalizados).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
