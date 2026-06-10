import { describe, expect, it } from "vitest";
import { inteiroPorExtenso, valorPorExtenso } from "@/lib/domain/numero-extenso";

describe("inteiroPorExtenso", () => {
  it.each([
    [0, "zero"],
    [1, "um"],
    [9, "nove"],
    [10, "dez"],
    [15, "quinze"],
    [16, "dezesseis"],
    [20, "vinte"],
    [21, "vinte e um"],
    [99, "noventa e nove"],
    [100, "cem"],
    [101, "cento e um"],
    [115, "cento e quinze"],
    [200, "duzentos"],
    [234, "duzentos e trinta e quatro"],
    [999, "novecentos e noventa e nove"],
    [1000, "mil"],
    [1001, "mil e um"],
    [1100, "mil e cem"],
    [1234, "mil duzentos e trinta e quatro"],
    [2000, "dois mil"],
    [45000, "quarenta e cinco mil"],
    [100000, "cem mil"],
    [1000000, "um milhão"],
    [2000000, "dois milhões"],
    [1500000, "um milhão e quinhentos mil"]
  ])("converte %i", (n, esperado) => {
    expect(inteiroPorExtenso(n)).toBe(esperado);
  });
});

describe("valorPorExtenso", () => {
  it.each([
    [0, "zero reais"],
    [1, "um real"],
    [2, "dois reais"],
    [0.01, "um centavo"],
    [0.5, "cinquenta centavos"],
    [1.5, "um real e cinquenta centavos"],
    [19.99, "dezenove reais e noventa e nove centavos"],
    [100, "cem reais"],
    [1000, "mil reais"],
    [45000, "quarenta e cinco mil reais"],
    [1234.56, "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"],
    [1000000, "um milhão de reais"],
    [2000000, "dois milhões de reais"]
  ])("converte R$ %s", (valor, esperado) => {
    expect(valorPorExtenso(valor)).toBe(esperado);
  });

  it("arredonda para 2 casas (sobe a unidade)", () => {
    expect(valorPorExtenso(2.999)).toBe("três reais");
  });
});
