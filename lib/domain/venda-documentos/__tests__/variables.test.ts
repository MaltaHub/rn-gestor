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
  valorTotal: 45000,
  valorEntrada: 10000,
  formaPagamento: "financiado",
  dataVenda: "2026-06-09",
  dataEntrega: null,
  observacao: "Sem garantia",
  compradorNome: "JOÃO DA SILVA",
  compradorDocumento: "123.456.789-00",
  compradorEndereco: "RUA A, 100",
  financBanco: "BANCO X",
  financParcelasQtde: 48,
  financParcelaValor: 1200.5,
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

  it("forma de pagamento vira label legivel", () => {
    expect(resolveToken(CTX, "forma_pagamento")).toBe("financiado");
  });

  it("data date-only nao sofre shift de fuso", () => {
    expect(resolveToken(CTX, "data_venda")).toBe("09/06/2026");
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
