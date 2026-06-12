import { describe, expect, it } from "vitest";
import { vendaCreateSchema, vendaEntradaSchema, vendaUpdateSchema } from "@/lib/domain/vendas/schemas";

const baseCreate = {
  carro_id: "b13a82d4-0000-4000-8000-000000000001",
  vendedor_auth_user_id: "b13a82d4-0000-4000-8000-000000000002",
  forma_pagamento: "a_vista_pix" as const
};

describe("vendaCreateSchema", () => {
  it("accepts minimal valid payload (carro + vendedor + forma_pagamento)", () => {
    const result = vendaCreateSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
  });

  it("rejects valor_total negativo", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, valor_total: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects forma_pagamento legada (a_vista) e desconhecida (boleto)", () => {
    expect(vendaCreateSchema.safeParse({ ...baseCreate, forma_pagamento: "a_vista" }).success).toBe(false);
    expect(vendaCreateSchema.safeParse({ ...baseCreate, forma_pagamento: "boleto" }).success).toBe(false);
  });

  it("aceita estado_venda 'obsoleta'", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, estado_venda: "obsoleta" });
    expect(result.success).toBe(true);
  });

  it("rejects carro_id nao-uuid", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, carro_id: "abc" });
    expect(result.success).toBe(false);
  });

  it("aceita venda financiada completa com transferencia e cartao", () => {
    const result = vendaCreateSchema.safeParse({
      ...baseCreate,
      forma_pagamento: "financiamento",
      valor_total: 65000,
      desconto: 1000,
      financ_banco: "Banco do Brasil",
      financ_valor: 44000,
      financ_parcelas_qtde: 48,
      financ_parcela_valor: 1200,
      financ_taxa_mensal: 0.0125,
      financ_primeira_em: "2026-07-01",
      tipo_transferencia: "loja",
      valor_transferencia: 990,
      seguro_seguradora: "Porto Seguro",
      seguro_apolice: "AP-123",
      seguro_valor: 2400,
      seguro_validade: "2027-06-01"
    });
    expect(result.success).toBe(true);
  });

  it("aceita entradas multiplas (pix + carro na troca)", () => {
    const result = vendaCreateSchema.safeParse({
      ...baseCreate,
      forma_pagamento: "financiamento",
      valor_total: 65000,
      entradas: [
        { tipo: "pix", valor: 5000 },
        {
          tipo: "carro_troca",
          valor: 20000,
          carro_troca: { placa: "AAA1B23", nome: "ONIX 1.0", cor: "PRATA", ano_fab: 2018, ano_mod: 2019 }
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("aceita valor_entrada legado (compat quick-dialog)", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, valor_entrada: 10000 });
    expect(result.success).toBe(true);
  });

  it("rejects troca_* legado (colunas removidas nao passam mais)", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, troca_marca: "Chevrolet" });
    // .strip() remove extras: payload passa mas o campo nao sobrevive
    expect(result.success).toBe(true);
    if (result.success) {
      expect("troca_marca" in result.data).toBe(false);
    }
  });

  it("rejects data_venda fora do formato YYYY-MM-DD", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, data_venda: "16/05/2026" });
    expect(result.success).toBe(false);
  });

  it("rejects tipo_transferencia desconhecido", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, tipo_transferencia: "despachante" });
    expect(result.success).toBe(false);
  });
});

describe("vendaEntradaSchema", () => {
  it("aceita entrada pix simples", () => {
    const result = vendaEntradaSchema.safeParse({ tipo: "pix", valor: 5000 });
    expect(result.success).toBe(true);
  });

  it("rejects entrada cartao sem quantidade de parcelas", () => {
    const result = vendaEntradaSchema.safeParse({ tipo: "cartao_credito", valor: 5000 });
    expect(result.success).toBe(false);
  });

  it("aceita entrada cartao com parcelas", () => {
    const result = vendaEntradaSchema.safeParse({
      tipo: "cartao_credito",
      valor: 6000,
      cartao_parcelas_qtde: 10,
      cartao_parcela_valor: 600
    });
    expect(result.success).toBe(true);
  });

  it("rejects carro_troca sem dados do veiculo", () => {
    const result = vendaEntradaSchema.safeParse({ tipo: "carro_troca", valor: 20000 });
    expect(result.success).toBe(false);
  });

  it("rejects dados de veiculo em entrada que nao e troca", () => {
    const result = vendaEntradaSchema.safeParse({
      tipo: "pix",
      valor: 5000,
      carro_troca: { placa: "AAA1B23" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects placa curta no sub-form da troca", () => {
    const result = vendaEntradaSchema.safeParse({
      tipo: "carro_troca",
      valor: 20000,
      carro_troca: { placa: "AB12" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects valor negativo", () => {
    const result = vendaEntradaSchema.safeParse({ tipo: "pix", valor: -10 });
    expect(result.success).toBe(false);
  });
});

describe("vendaUpdateSchema", () => {
  it("aceita patch com apenas um campo", () => {
    const result = vendaUpdateSchema.safeParse({ observacao: "Cliente trouxe documento depois." });
    expect(result.success).toBe(true);
  });

  it("rejects payload vazio", () => {
    const result = vendaUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("aceita observacao null para limpar", () => {
    const result = vendaUpdateSchema.safeParse({ observacao: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observacao).toBeNull();
    }
  });

  it("rejects valor_total negativo em update", () => {
    const result = vendaUpdateSchema.safeParse({ valor_total: -100 });
    expect(result.success).toBe(false);
  });

  it("nao aceita valor_entrada (denormalizado por trigger)", () => {
    const result = vendaUpdateSchema.safeParse({ valor_entrada: 5000 });
    // .strip() remove o campo; payload so com ele vira objeto vazio -> falha
    expect(result.success).toBe(false);
  });

  it("aceita campos novos (desconto, transferencia, cartao)", () => {
    const result = vendaUpdateSchema.safeParse({
      desconto: 500,
      tipo_transferencia: "cliente",
      valor_transferencia: 0,
      cartao_parcelas_qtde: 12,
      cartao_parcela_valor: 1000
    });
    expect(result.success).toBe(true);
  });
});
