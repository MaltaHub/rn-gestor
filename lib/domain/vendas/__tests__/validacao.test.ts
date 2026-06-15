import { describe, expect, it } from "vitest";
import {
  formatCEP,
  formatCpfCnpj,
  formatTelefone,
  isValidCEP,
  isValidCNPJ,
  isValidCPF,
  isValidCpfCnpj,
  isValidEmail,
  isValidRG,
  isValidTelefone
} from "@/lib/domain/vendas/validacao";

describe("isValidCPF", () => {
  it("aceita CPF válido (com e sem máscara)", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
  });
  it("rejeita dígito verificador errado, repetidos e tamanho inválido", () => {
    expect(isValidCPF("529.982.247-24")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("123")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJ válido", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });
  it("rejeita inválido e repetidos", () => {
    expect(isValidCNPJ("11.222.333/0001-80")).toBe(false);
    expect(isValidCNPJ("00000000000000")).toBe(false);
  });
});

describe("isValidCpfCnpj", () => {
  it("decide pelo número de dígitos", () => {
    expect(isValidCpfCnpj("52998224725")).toBe(true);
    expect(isValidCpfCnpj("11222333000181")).toBe(true);
    expect(isValidCpfCnpj("123456")).toBe(false);
  });
});

describe("isValidCEP / isValidEmail / isValidTelefone / isValidRG", () => {
  it("CEP exige 8 dígitos", () => {
    expect(isValidCEP("59000-000")).toBe(true);
    expect(isValidCEP("5900000")).toBe(false);
  });
  it("e-mail plausível", () => {
    expect(isValidEmail("cliente@email.com")).toBe(true);
    expect(isValidEmail("cliente@@x")).toBe(false);
    expect(isValidEmail("sem-arroba.com")).toBe(false);
  });
  it("telefone 10 ou 11 dígitos", () => {
    expect(isValidTelefone("(84) 3211-0000")).toBe(true);
    expect(isValidTelefone("(84) 99999-0000")).toBe(true);
    expect(isValidTelefone("99999")).toBe(false);
  });
  it("RG básico (5–14, aceita X final)", () => {
    expect(isValidRG("12.345.678-9")).toBe(true);
    expect(isValidRG("1234567X")).toBe(true);
    expect(isValidRG("12")).toBe(false);
  });
});

describe("máscaras", () => {
  it("formata CPF e CNPJ", () => {
    expect(formatCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(formatCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("formata CEP e telefone", () => {
    expect(formatCEP("59000000")).toBe("59000-000");
    expect(formatTelefone("8432110000")).toBe("(84) 3211-0000");
    expect(formatTelefone("84999990000")).toBe("(84) 99999-0000");
  });
});
