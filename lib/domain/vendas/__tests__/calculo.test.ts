import { describe, expect, it } from "vitest";
import { buildMensagemVenda, computeVendaResumo } from "@/lib/domain/vendas/calculo";

describe("computeVendaResumo", () => {
  it("sem entradas: financiado = total - desconto", () => {
    const resumo = computeVendaResumo({ valorTotal: 65000, desconto: 1000, entradas: [] });
    expect(resumo.totalEntradas).toBe(0);
    expect(resumo.valorLiquido).toBe(64000);
    expect(resumo.valorFinanciado).toBe(64000);
    expect(resumo.entradasExcedemTotal).toBe(false);
  });

  it("multiplas entradas somam e abatem do financiado", () => {
    const resumo = computeVendaResumo({
      valorTotal: 65000,
      entradas: [
        { tipo: "pix", valor: 5000 },
        { tipo: "carro_troca", valor: 20000 }
      ]
    });
    expect(resumo.totalEntradas).toBe(25000);
    expect(resumo.valorFinanciado).toBe(40000);
  });

  it("entradas maiores que o total: clamp em 0 + flag de inconsistencia", () => {
    const resumo = computeVendaResumo({
      valorTotal: 30000,
      entradas: [{ tipo: "carro_troca", valor: 35000 }]
    });
    expect(resumo.valorFinanciado).toBe(0);
    expect(resumo.entradasExcedemTotal).toBe(true);
  });

  it("sem valor_total: financiado indefinido mas entradas somadas", () => {
    const resumo = computeVendaResumo({ entradas: [{ tipo: "pix", valor: 1000 }] });
    expect(resumo.totalEntradas).toBe(1000);
    expect(resumo.valorLiquido).toBeNull();
    expect(resumo.valorFinanciado).toBeNull();
  });

  it("ignora valores invalidos (null/NaN) nas entradas", () => {
    const resumo = computeVendaResumo({
      valorTotal: 10000,
      entradas: [{ tipo: "pix", valor: null }, { tipo: "outro", valor: Number.NaN }, { tipo: "pix", valor: 500 }]
    });
    expect(resumo.totalEntradas).toBe(500);
    expect(resumo.valorFinanciado).toBe(9500);
  });
});

describe("buildMensagemVenda", () => {
  const carro = {
    modelo: "ONIX 1.0 LT",
    placa: "ABC1D23",
    cor: "PRATA",
    anoFab: 2021,
    anoMod: 2022,
    hodometro: 45000,
    anoIpvaPago: 2026
  };

  it("financiamento completo com entrada, banco, parcelas, transferencia e IPVA pago", () => {
    const msg = buildMensagemVenda({
      carro,
      venda: {
        valorTotal: 65000,
        formaPagamento: "financiamento",
        financValor: 40000,
        financBanco: "Santander",
        financParcelasQtde: 48,
        financParcelaValor: 1250.5,
        tipoTransferencia: "loja"
      },
      entradas: [
        { tipo: "pix", valor: 5000 },
        { tipo: "carro_troca", valor: 20000 }
      ],
      anoAtual: 2026
    });
    expect(msg).toContain("Veículo ONIX 1.0 LT");
    expect(msg).toContain("placa ABC1D23");
    expect(msg).toContain("cor PRATA");
    expect(msg).toContain("ano/modelo 2021/2022");
    expect(msg).toContain("KM 45.000");
    expect(msg).toContain("vendido pelo valor total de");
    expect(msg).toContain("65.000,00");
    expect(msg).toContain("com entrada de");
    expect(msg).toContain("25.000,00");
    expect(msg).toContain("PIX");
    expect(msg).toContain("carro na troca");
    expect(msg).toContain("financiado");
    expect(msg).toContain("40.000,00");
    expect(msg).toContain("no banco Santander");
    expect(msg).toContain("em 48 parcelas de");
    expect(msg).toContain("com a transferência pela loja");
    expect(msg).toContain("com IPVA PAGO");
  });

  it("a vista no PIX sem entrada nem IPVA do ano", () => {
    const msg = buildMensagemVenda({
      carro: { ...carro, anoIpvaPago: 2025 },
      venda: { valorTotal: 50000, formaPagamento: "a_vista_pix", tipoTransferencia: "cliente" },
      entradas: [],
      anoAtual: 2026
    });
    expect(msg).toContain("pago à vista no PIX");
    expect(msg).toContain("com a transferência pelo cliente");
    expect(msg).not.toContain("IPVA PAGO");
    expect(msg).not.toContain("entrada");
    expect(msg).not.toContain("financiado");
  });

  it("cartao de credito com parcelas", () => {
    const msg = buildMensagemVenda({
      carro,
      venda: {
        valorTotal: 48000,
        formaPagamento: "cartao_credito",
        cartaoParcelasQtde: 12,
        cartaoParcelaValor: 4000
      },
      anoAtual: 2026
    });
    expect(msg).toContain("pago no cartão de crédito em 12 parcelas de");
    expect(msg).toContain("4.000,00");
  });

  it("entrada unica no PIX usa frase singular", () => {
    const msg = buildMensagemVenda({
      carro,
      venda: { valorTotal: 60000, formaPagamento: "financiamento" },
      entradas: [{ tipo: "pix", valor: 10000 }],
      anoAtual: 2026
    });
    expect(msg).toContain("com entrada de");
    expect(msg).toContain("no PIX");
    expect(msg).not.toContain("(");
  });

  it("financiado sem financ_valor usa o calculado (total - entradas)", () => {
    const msg = buildMensagemVenda({
      carro,
      venda: { valorTotal: 60000, formaPagamento: "financiamento" },
      entradas: [{ tipo: "pix", valor: 10000 }],
      anoAtual: 2026
    });
    expect(msg).toContain("financiado");
    expect(msg).toContain("50.000,00");
  });

  it("ficha incompleta degrada sem quebrar", () => {
    const msg = buildMensagemVenda({ carro: {}, venda: {}, anoAtual: 2026 });
    expect(msg).toBe("está vendido.");
  });
});
