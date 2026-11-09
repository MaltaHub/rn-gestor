import { describe, expect, it } from "vitest";
import * as clausulas from "@/lib/domain/venda-documentos/clausulas";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";

// Intl separa "R$" do número com espaço não separável (bom no papel: não quebra
// a linha entre os dois). Os testes comparam com espaço comum.
const n = (texto: string) => texto.replace(/ /g, " ");
const pagamento = (ctx: VendaDocContext) => n(clausulas.clausulaPagamento(ctx));

const BASE: VendaDocContext = {
  placa: "ABC1D23",
  modelo: "Onix 1.0",
  anoFab: 2020,
  anoMod: 2021,
  cor: "prata",
  valorTotal: 65000,
  dataVenda: "2026-06-09"
};

describe("clausulaPagamento — uma frase para cada dinâmica de venda", () => {
  it("à vista no PIX, sem entrada", () => {
    expect(pagamento({ ...BASE, formaPagamento: "a_vista_pix" })).toBe(
      "Pagamento à vista, via PIX, no valor de R$ 65.000,00 (sessenta e cinco mil reais)."
    );
  });

  it("financiamento com entrada no PIX usa o valor financiado e as parcelas", () => {
    const texto = pagamento({
      ...BASE,
      formaPagamento: "financiamento",
      entradas: [{ tipo: "pix", valor: 10000 }],
      financBanco: "Santander",
      financValor: 55000,
      financParcelasQtde: 48,
      financParcelaValor: 1500
    });
    expect(texto).toBe(
      "Entrada de R$ 10.000,00 (dez mil reais) via PIX; saldo de R$ 55.000,00 (cinquenta e cinco mil reais) financiado pelo banco Santander em 48 parcelas de R$ 1.500,00 (mil e quinhentos reais)."
    );
  });

  it("financiamento SEM entrada não fala em entrada (o caso do template fixo)", () => {
    const texto = pagamento({ ...BASE, formaPagamento: "financiamento", financBanco: "Banco do Brasil", financParcelasQtde: 36 });
    expect(texto).toBe("Valor de R$ 65.000,00 (sessenta e cinco mil reais) financiado pelo Banco do Brasil em 36 parcelas.");
    expect(texto.toLowerCase()).not.toContain("entrada");
  });

  it("troca + PIX + financiamento detalha cada entrada", () => {
    const texto = pagamento({
      ...BASE,
      formaPagamento: "financiamento",
      entradas: [
        { tipo: "carro_troca", valor: 20000, troca: { modelo: "Gol", placa: "xyz9a87", anoFab: 2014, anoMod: 2015 } },
        { tipo: "pix", valor: 10000 }
      ],
      financValor: 35000
    });
    expect(texto).toContain(
      "Entrada de R$ 30.000,00 (trinta mil reais), sendo R$ 20.000,00 (vinte mil reais) em veículo recebido na troca (Gol, placa XYZ9A87, ano 2014/2015) e R$ 10.000,00 (dez mil reais) via PIX;"
    );
    expect(texto).toContain("saldo de R$ 35.000,00 (trinta e cinco mil reais) financiado.");
  });

  it("cartão de crédito sem entrada", () => {
    expect(pagamento({ ...BASE, formaPagamento: "cartao_credito", cartaoParcelasQtde: 12, cartaoParcelaValor: 5800 })).toBe(
      "Pagamento de R$ 65.000,00 (sessenta e cinco mil reais) no cartão de crédito em 12 parcelas de R$ 5.800,00 (cinco mil e oitocentos reais)."
    );
  });

  it("consórcio cita a administradora", () => {
    expect(pagamento({ ...BASE, formaPagamento: "consorcio", financBanco: "Porto Seguro" })).toBe(
      "Valor de R$ 65.000,00 (sessenta e cinco mil reais) pago por carta de consórcio da administradora Porto Seguro."
    );
  });

  it("desconto reduz o valor e a entrada que quita tudo vira pagamento integral", () => {
    const ctx: VendaDocContext = { ...BASE, desconto: 5000, formaPagamento: "a_vista_pix", entradas: [{ tipo: "pix", valor: 60000 }] };
    expect(clausulas.valorFinal(ctx)).toBe(60000);
    expect(clausulas.saldoAPagar(ctx)).toBe(0);
    expect(pagamento(ctx)).toBe("Pagamento de R$ 60.000,00 (sessenta mil reais) via PIX.");
  });

  it("sem valor da venda não inventa forma de pagamento", () => {
    expect(pagamento({ formaPagamento: "a_vista_pix" })).toBe("");
  });

  it("descrição interna do form rápido não vai para o documento", () => {
    const texto = pagamento({
      ...BASE,
      formaPagamento: "a_vista_pix",
      entradas: [{ tipo: "outro", valor: 5000, descricao: "Entrada registrada sem tipo (form rapido)." }]
    });
    expect(texto).not.toContain("form");
    expect(texto).toContain("Entrada de R$ 5.000,00 (cinco mil reais); saldo de R$ 60.000,00");
  });
});

describe("IPVA, transferência, troca e garantia", () => {
  it("IPVA sai pago só quando o cadastro registra o ano da venda", () => {
    expect(clausulas.clausulaIpva({ ...BASE, anoIpvaPago: 2026 })).toBe("IPVA 2026 pago");
    expect(clausulas.clausulaIpva({ ...BASE, anoIpvaPago: 2025 })).toBe("");
    expect(clausulas.clausulaIpva({ ...BASE, anoIpvaPago: null })).toBe("");
  });

  it("transferência conforme quem executa", () => {
    expect(n(clausulas.clausulaTransferencia({ tipoTransferencia: "loja", valorTransferencia: 990 }))).toBe(
      "Transferência de propriedade realizada pela loja, no valor de R$ 990,00 (novecentos e noventa reais)."
    );
    expect(clausulas.clausulaTransferencia({ tipoTransferencia: "cliente" })).toContain("30 (trinta) dias");
    expect(clausulas.clausulaTransferencia({})).toBe("");
  });

  it("troca descreve o veículo recebido por completo", () => {
    const texto = n(
      clausulas.clausulaTroca({
        entradas: [{ tipo: "carro_troca", valor: 20000, troca: { modelo: "Gol", placa: "XYZ9A87", chassi: "9bw123", renavam: "998877" } }]
      })
    );
    expect(texto).toBe(
      "Veículo recebido como parte do pagamento: Gol, placa XYZ9A87, chassi 9BW123, renavam 998877, recebido pelo valor de R$ 20.000,00 (vinte mil reais)."
    );
    expect(clausulas.clausulaTroca({ entradas: [{ tipo: "pix", valor: 100 }] })).toBe("");
  });

  it("garantia de 90 dias a partir da entrega, sem desvio de fuso", () => {
    expect(clausulas.garantiaFim({ dataEntrega: "2026-11-30" })).toBe("2027-02-28");
    expect(clausulas.clausulaGarantia({ dataEntrega: "2026-11-30" })).toContain("de 30 de novembro de 2026 a 28 de fevereiro de 2027");
    expect(clausulas.clausulaGarantia({})).toContain("90 (noventa) dias");
  });
});

describe("qualificação e descrição", () => {
  it("qualificação do comprador junta o que houver", () => {
    expect(
      clausulas.qualificacaoComprador({
        compradorNome: "Maria",
        compradorDocumento: "123.456.789-09",
        compradorEndereco: "Rua A, 1",
        compradorCidadeEstado: "Santos - SP"
      })
    ).toBe("Maria, CPF 123.456.789-09, residente em Rua A, 1, Santos - SP");
    expect(clausulas.qualificacaoComprador({ compradorNome: "Loja X", compradorDocumento: "12.345.678/0001-90" })).toBe(
      "Loja X, CNPJ 12.345.678/0001-90"
    );
    expect(clausulas.qualificacaoComprador({})).toBe("");
  });

  it("descrição do veículo vendido", () => {
    expect(clausulas.descricaoVeiculoVendido({ ...BASE, hodometro: 45000, chassi: "9bg1" })).toBe(
      "Onix 1.0, placa ABC1D23, ano 2020/2021, cor prata, chassi 9BG1, 45.000 km"
    );
  });
});
