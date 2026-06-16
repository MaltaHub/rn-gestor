import { describe, expect, it } from "vitest";
import {
  isValidChassi,
  isValidRenavam,
  isValidPlaca,
  normalizePlaca,
  placasIguais,
  parseCrlvText,
  formatChassi
} from "@/lib/domain/veiculo/identificacao";

describe("isValidChassi (VIN 17 sem I/O/Q)", () => {
  it("aceita 17 chars válidos", () => {
    expect(isValidChassi("9BWZZZ377VT004251")).toBe(true);
    expect(isValidChassi("9bwzzz377vt004251")).toBe(true); // normaliza caixa
    expect(isValidChassi("9BW-ZZZ 377 VT004251")).toBe(true); // ignora separadores
  });
  it("rejeita tamanho errado e letras proibidas (I/O/Q)", () => {
    expect(isValidChassi("9BWZZZ377VT00425")).toBe(false); // 16
    expect(isValidChassi("9BWZZZ377VT0042511")).toBe(false); // 18
    expect(isValidChassi("9BWZZZ377VT00425I")).toBe(false); // I
    expect(isValidChassi("9BWZZZ377VT00425O")).toBe(false); // O
    expect(isValidChassi("9BWZZZ377VT00425Q")).toBe(false); // Q
  });
  it("formatChassi corta em 17 e normaliza", () => {
    expect(formatChassi("9bw zzz 377 vt0 04251 extra")).toBe("9BWZZZ377VT004251");
  });
});

describe("isValidRenavam (11 dígitos + DV módulo 11)", () => {
  // DV calculado pelo mesmo algoritmo: pesos [3,2,9,8,7,6,5,4,3,2], dv=(soma*10)%11 (10→0).
  function comDv(base10: string): string {
    const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i += 1) sum += Number(base10[i]) * weights[i];
    const mod = (sum * 10) % 11;
    return base10 + String(mod === 10 ? 0 : mod);
  }

  it("aceita um RENAVAM com DV correto e rejeita DV adulterado", () => {
    const valido = comDv("0011593793");
    expect(isValidRenavam(valido)).toBe(true);
    const dv = Number(valido[10]);
    const adulterado = valido.slice(0, 10) + String((dv + 1) % 10);
    expect(isValidRenavam(adulterado)).toBe(false);
  });
  it("rejeita estruturalmente inválidos", () => {
    expect(isValidRenavam("123")).toBe(false); // curto
    expect(isValidRenavam("00000000000")).toBe(false); // tudo zero
    expect(isValidRenavam("123456789012")).toBe(false); // 12 dígitos
  });
});

describe("placa", () => {
  it("aceita Mercosul e antiga; compara normalizado", () => {
    expect(isValidPlaca("ABC1D23")).toBe(true);
    expect(isValidPlaca("ABC-1234")).toBe(true);
    expect(isValidPlaca("AB1234")).toBe(false);
    expect(normalizePlaca("abc-1d23")).toBe("ABC1D23");
    expect(placasIguais("ABC1D23", "abc1d23")).toBe(true);
    expect(placasIguais("ABC1D23", "XYZ1D23")).toBe(false);
    expect(placasIguais("", "ABC1D23")).toBe(false);
  });
});

describe("parseCrlvText", () => {
  it("extrai placa/chassi/renavam de um texto rotulado (estilo CRLV)", () => {
    const renavam = (() => {
      const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const base = "1234567890";
      let sum = 0;
      for (let i = 0; i < 10; i += 1) sum += Number(base[i]) * weights[i];
      const mod = (sum * 10) % 11;
      return base + String(mod === 10 ? 0 : mod);
    })();
    const texto = `REPUBLICA FEDERATIVA DO BRASIL\nCRLV-e\nPLACA ABC1D23\nCODIGO RENAVAM ${renavam}\nCHASSI 9BWZZZ377VT004251\nMARCA/MODELO VW/GOL`;
    const fields = parseCrlvText(texto);
    expect(fields.placa).toBe("ABC1D23");
    expect(fields.chassi).toBe("9BWZZZ377VT004251");
    expect(fields.renavam).toBe(renavam);
  });

  it("tolera espaços do OCR no meio do chassi/renavam", () => {
    const texto = "PLACA: ABC 1D23  CHASSI: 9BW ZZZ 377 VT0 04251";
    const fields = parseCrlvText(texto);
    expect(fields.placa).toBe("ABC1D23");
    expect(fields.chassi).toBe("9BWZZZ377VT004251");
  });

  it("retorna null quando não encontra", () => {
    expect(parseCrlvText("documento sem dados de veiculo")).toEqual({ placa: null, chassi: null, renavam: null });
  });
});
