import { describe, expect, it } from "vitest";
import { vendaCreateSchema, vendaUpdateSchema } from "@/lib/domain/vendas/schemas";

const baseCreate = {
  carro_id: "b13a82d4-0000-4000-8000-000000000001",
  vendedor_auth_user_id: "b13a82d4-0000-4000-8000-000000000002",
  valor_total: 50000,
  forma_pagamento: "a_vista" as const,
  comprador_nome: "Joao Silva"
};

describe("vendaCreateSchema", () => {
  it("accepts minimal valid payload (so campos obrigatorios)", () => {
    const result = vendaCreateSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
  });

  it("rejects valor_total negativo", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, valor_total: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects forma_pagamento desconhecida", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, forma_pagamento: "boleto" });
    expect(result.success).toBe(false);
  });

  it("rejects comprador_nome vazio", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, comprador_nome: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects carro_id nao-uuid", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, carro_id: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects uuid mal-formado (v1 ao inves de v4)", () => {
    const result = vendaCreateSchema.safeParse({
      ...baseCreate,
      carro_id: "11111111-1111-1111-1111-111111111111"
    });
    expect(result.success).toBe(false);
  });

  it("aceita dados completos de financiamento, seguro e troca", () => {
    const result = vendaCreateSchema.safeParse({
      ...baseCreate,
      forma_pagamento: "financiado",
      valor_entrada: 10000,
      financ_banco: "Banco do Brasil",
      financ_parcelas_qtde: 48,
      financ_parcela_valor: 1200,
      financ_taxa_mensal: 0.0125,
      financ_primeira_em: "2026-06-01",
      seguro_seguradora: "Porto Seguro",
      seguro_apolice: "AP-123",
      seguro_valor: 2400,
      seguro_validade: "2027-06-01",
      troca_marca: "Chevrolet",
      troca_modelo: "Onix",
      troca_ano: 2018,
      troca_placa: "AAA1B23",
      troca_valor: 35000
    });
    expect(result.success).toBe(true);
  });

  it("rejects data_venda fora do formato YYYY-MM-DD", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, data_venda: "16/05/2026" });
    expect(result.success).toBe(false);
  });

  it("aceita estado_venda 'cancelada' explicito", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, estado_venda: "cancelada" });
    expect(result.success).toBe(true);
  });

  it("rejects troca_ano fora de 1900..2200", () => {
    const result = vendaCreateSchema.safeParse({ ...baseCreate, troca_ano: 1800 });
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
});
