import { describe, expect, it } from "vitest";
import {
  resolveToken,
  resolveTokensInText,
  type VendaDocContext
} from "@/lib/domain/venda-documentos/variables";

const CTX: VendaDocContext = {
  placa: "ABC1D23",
  modelo: "ONIX 1.0",
  cor: "PRATA",
  anoFab: 2021,
  anoMod: 2022,
  hodometro: 45000,
  anoIpvaPago: new Date().getFullYear(),
  valorTotal: 45000,
  valorEntrada: 10000,
  desconto: 500,
  formaPagamento: "financiamento",
  dataVenda: "2026-06-09",
  dataEntrega: null,
  observacao: "Sem garantia",
  debitos: "IPVA 2025 em aberto",
  compradorNome: "JOÃO DA SILVA",
  compradorDocumento: "123.456.789-00",
  compradorRg: "12.345.678-9",
  compradorEndereco: "RUA A, 100",
  compradorCep: "59000-000",
  compradorCidadeEstado: "Natal - RN",
  financBanco: "BANCO X",
  financValor: 34500,
  financParcelasQtde: 48,
  financParcelaValor: 1200.5,
  cartaoParcelasQtde: 10,
  cartaoParcelaValor: 600,
  tipoTransferencia: "loja",
  valorTransferencia: 990,
  entradas: [
    { tipo: "pix", valor: 4000 },
    { tipo: "carro_troca", valor: 6000 }
  ],
  vendedor: "Kaic"
};

describe("resolveToken — campos diretos", () => {
  it("resolve placa/modelo/cor", () => {
    expect(resolveToken(CTX, "placa")).toBe("ABC1D23");
    expect(resolveToken(CTX, "modelo")).toBe("ONIX 1.0");
    expect(resolveToken(CTX, "cor")).toBe("PRATA");
  });

  it("ano prefere ano_mod", () => {
    expect(resolveToken(CTX, "ano")).toBe("2022");
  });

  it("forma de pagamento vira label legivel (codes novos e legados)", () => {
    expect(resolveToken(CTX, "forma_pagamento")).toBe("financiamento");
    expect(resolveToken({ ...CTX, formaPagamento: "a_vista_pix" }, "forma_pagamento")).toBe("à vista no PIX");
    expect(resolveToken({ ...CTX, formaPagamento: "financiado" }, "forma_pagamento")).toBe("financiado");
  });

  it("data date-only por extenso, sem shift de fuso", () => {
    expect(resolveToken(CTX, "data_venda")).toBe("9 de junho de 2026");
  });

  it("financ.parcelas", () => {
    expect(resolveToken(CTX, "financ.parcelas")).toBe("48");
  });
});

describe("resolveToken — preco em R$", () => {
  it("formata moeda BR (com ou sem acento)", () => {
    expect(resolveToken(CTX, "preço")).toContain("45.000,00");
    expect(resolveToken(CTX, "preço")).toMatch(/^R\$/);
    expect(resolveToken(CTX, "preco")).toContain("45.000,00");
    expect(resolveToken(CTX, "valor_total")).toContain("45.000,00");
  });
});

describe("resolveToken — .extenso (CAIXA ALTA entre parenteses)", () => {
  it("preco.extenso", () => {
    expect(resolveToken(CTX, "preço.extenso")).toBe("(QUARENTA E CINCO MIL REAIS)");
  });

  it("entrada.extenso", () => {
    expect(resolveToken(CTX, "entrada.extenso")).toBe("(DEZ MIL REAIS)");
  });

  it("aceita token em maiusculas/sem acento", () => {
    expect(resolveToken(CTX, "PREÇO.EXTENSO")).toBe("(QUARENTA E CINCO MIL REAIS)");
  });

  it("parcela.extenso com centavos", () => {
    expect(resolveToken(CTX, "parcela.extenso")).toBe("(MIL E DUZENTOS REAIS E CINQUENTA CENTAVOS)");
  });
});

describe("resolveToken — acentos em chaves compostas/simples", () => {
  it("comprador.endereço e observação", () => {
    expect(resolveToken(CTX, "comprador.endereço")).toBe("RUA A, 100");
    expect(resolveToken(CTX, "observação")).toBe("Sem garantia");
  });

  it("comprador.cpf mapeia ao documento", () => {
    expect(resolveToken(CTX, "comprador.cpf")).toBe("123.456.789-00");
  });

  it("RG, CEP, cidade-estado e débitos", () => {
    expect(resolveToken(CTX, "comprador.rg")).toBe("12.345.678-9");
    expect(resolveToken(CTX, "comprador.cep")).toBe("59000-000");
    expect(resolveToken(CTX, "comprador.cidade_estado")).toBe("Natal - RN");
    expect(resolveToken(CTX, "comprador.cidade")).toBe("Natal - RN");
    expect(resolveToken(CTX, "debitos")).toBe("IPVA 2025 em aberto");
  });
});

describe("resolveToken — tokens Vendas 2.0", () => {
  it("km formatado pt-BR", () => {
    expect(resolveToken(CTX, "km")).toBe("45.000");
  });

  it("ipva = IPVA PAGO quando ano_ipva_pago e o ano corrente", () => {
    expect(resolveToken(CTX, "ipva")).toBe("IPVA PAGO");
    expect(resolveToken({ ...CTX, anoIpvaPago: 2000 }, "ipva")).toBe("");
  });

  it("desconto e financ.valor em R$ e por extenso", () => {
    expect(resolveToken(CTX, "desconto")).toContain("500,00");
    expect(resolveToken(CTX, "financ.valor")).toContain("34.500,00");
    expect(resolveToken(CTX, "financ.valor.extenso")).toBe(
      "(TRINTA E QUATRO MIL E QUINHENTOS REAIS)"
    );
  });

  it("cartao.parcelas e cartao.parcela", () => {
    expect(resolveToken(CTX, "cartao.parcelas")).toBe("10");
    expect(resolveToken(CTX, "cartao.parcela")).toContain("600,00");
  });

  it("transferencia.tipo vira frase e transferencia.valor em R$", () => {
    expect(resolveToken(CTX, "transferencia.tipo")).toBe("pela loja");
    expect(resolveToken({ ...CTX, tipoTransferencia: "cliente" }, "transferencia.tipo")).toBe("pelo cliente");
    expect(resolveToken(CTX, "transferencia.valor")).toContain("990,00");
  });

  it("entrada.detalhe lista as entradas", () => {
    const detalhe = resolveToken(CTX, "entrada.detalhe");
    expect(detalhe).toContain("PIX");
    expect(detalhe).toContain("carro na troca");
    expect(detalhe).toContain("+");
  });

  it("mensagem.venda compoe a mensagem final em caixa alta", () => {
    const msg = resolveToken(CTX, "mensagem.venda");
    expect(msg).toBe(msg.toUpperCase());
    expect(msg).toContain("VEÍCULO ONIX 1.0");
    expect(msg).toContain("PLACA ABC1D23");
    expect(msg).toContain("FINANCIADO");
    expect(msg).toContain("TRANSFERÊNCIA PELA LOJA");
    expect(msg).toContain("COM IPVA PAGO");
  });
});

describe("resolveToken — bordas", () => {
  it("dado ausente vira string vazia", () => {
    expect(resolveToken(CTX, "data_entrega")).toBe("");
  });

  it("token desconhecido devolve o literal", () => {
    expect(resolveToken(CTX, "foo")).toBe("${foo}");
  });
});

describe("resolveTokensInText", () => {
  it("substitui multiplos tokens num texto", () => {
    const out = resolveTokensInText(CTX, "Veiculo ${placa} por ${preço.extenso}.");
    expect(out).toBe("Veiculo ABC1D23 por (QUARENTA E CINCO MIL REAIS).");
  });
});
