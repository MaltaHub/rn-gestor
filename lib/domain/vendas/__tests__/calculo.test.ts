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
    expect(msg).toBe(msg.toUpperCase());
    expect(msg).toContain("VEÍCULO ONIX 1.0 LT");
    expect(msg).toContain("PLACA ABC1D23");
    expect(msg).toContain("COR PRATA");
    expect(msg).toContain("ANO/MODELO 2021/2022");
    expect(msg).toContain("45.000 KM");
    expect(msg).toContain("VENDIDO PELO VALOR TOTAL DE");
    expect(msg).toContain("65.000,00");
    expect(msg).toContain("ENTRADA DE");
    expect(msg).toContain("25.000,00");
    expect(msg).toContain("PIX");
    expect(msg).toContain("CARRO NA TROCA");
    expect(msg).toContain("FINANCIADO");
    expect(msg).toContain("40.000,00");
    expect(msg).toContain("NO BANCO SANTANDER");
    expect(msg).toContain("EM 48X DE");
    expect(msg).toContain("TRANSFERÊNCIA PELA LOJA");
    expect(msg).toContain("COM IPVA PAGO");
  });

  it("a vista no PIX sem entrada nem IPVA do ano", () => {
    const msg = buildMensagemVenda({
      carro: { ...carro, anoIpvaPago: 2025 },
      venda: { valorTotal: 50000, formaPagamento: "a_vista_pix", tipoTransferencia: "cliente" },
      entradas: [],
      anoAtual: 2026
    });
    expect(msg).toContain("PAGO À VISTA NO PIX");
    expect(msg).toContain("TRANSFERÊNCIA PELO CLIENTE");
    expect(msg).not.toContain("IPVA PAGO");
    expect(msg).not.toContain("ENTRADA");
    expect(msg).not.toContain("FINANCIADO");
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
    expect(msg).toContain("PAGO NO CARTÃO DE CRÉDITO EM 12X DE");
    expect(msg).toContain("4.000,00");
  });

  it("entrada unica no PIX usa frase singular", () => {
    const msg = buildMensagemVenda({
      carro,
      venda: { valorTotal: 60000, formaPagamento: "financiamento" },
      entradas: [{ tipo: "pix", valor: 10000 }],
      anoAtual: 2026
    });
    expect(msg).toContain("ENTRADA DE");
    expect(msg).toContain("NO PIX");
    expect(msg).not.toContain("(");
  });

  it("financiado sem financ_valor usa o calculado (total - entradas)", () => {
    const msg = buildMensagemVenda({
      carro,
      venda: { valorTotal: 60000, formaPagamento: "financiamento" },
      entradas: [{ tipo: "pix", valor: 10000 }],
      anoAtual: 2026
    });
    expect(msg).toContain("FINANCIADO");
    expect(msg).toContain("50.000,00");
  });

  it("ficha incompleta degrada sem quebrar", () => {
    const msg = buildMensagemVenda({ carro: {}, venda: {}, anoAtual: 2026 });
    expect(msg).toBe("VENDIDO.");
  });
});
