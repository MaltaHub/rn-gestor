import { describe, expect, it } from "vitest";

import {
  applyTransforms,
  extractField,
  extractTemplate,
  joinWords,
  maskMatches,
  suggestWildcards,
  wordsInRegion
} from "@/lib/domain/ocr/engine";
import { getOcrDestination } from "@/lib/domain/ocr/destinations";
import type { OcrDocument, OcrField, OcrWord } from "@/lib/domain/ocr/types";

function word(text: string, x: number, y: number, w = 0.08, page = 0): OcrWord {
  return { text, page, box: { x, y, w, h: 0.02 } };
}

// Layout tipo CRLV: rótulo em cima, valor embaixo.
const crlv: OcrDocument = {
  source: "ocr",
  pages: [{ width: 1000, height: 1400 }],
  words: [
    word("PLACA", 0.05, 0.1),
    word("CÓDIGO", 0.4, 0.1),
    word("RENAVAM", 0.48, 0.1),
    word("ABC", 0.05, 0.13, 0.04),
    word("1D23", 0.1, 0.13, 0.05),
    word("01234567890", 0.4, 0.13, 0.14),
    word("CHASSI", 0.05, 0.2),
    word("9BWZZZ377VT004251", 0.15, 0.2, 0.2),
    word("COR", 0.05, 0.3),
    word("PRATA", 0.12, 0.3)
  ]
};

function field(patch: Partial<OcrField>): OcrField {
  return {
    id: "f",
    label: "Campo",
    destination: "none",
    region: null,
    sampleText: "",
    transforms: ["trim"],
    wildcards: [],
    required: false,
    ...patch
  };
}

describe("região", () => {
  it("junta as palavras da área marcada na ordem de leitura", () => {
    const words = wordsInRegion(crlv, { page: 0, x: 0.04, y: 0.125, w: 0.13, h: 0.03 });
    expect(joinWords(words)).toBe("ABC 1D23");
  });

  it("aplica transformações e valida com os coringas", () => {
    const placa = field({
      region: { page: 0, x: 0.04, y: 0.125, w: 0.13, h: 0.03 },
      transforms: ["no_spaces", "upper"],
      wildcards: [{ kind: "mask", mask: "AAA9A99" }]
    });
    expect(extractField(crlv, placa)).toMatchObject({ value: "ABC1D23", source: "region", valid: true });
  });
});

describe("região com sobra", () => {
  it("quando a área pega o rótulo vizinho, acha o valor dentro dela (continua sendo posição)", () => {
    const placa = field({
      region: { page: 0, x: 0.04, y: 0.09, w: 0.13, h: 0.07 }, // cobre "PLACA" e "ABC 1D23"
      transforms: ["upper"],
      wildcards: [{ kind: "mask", mask: "AAA9A99" }]
    });
    expect(extractField(crlv, placa)).toMatchObject({ value: "ABC1D23", source: "region" });
  });
});

describe("coringas", () => {
  it("acha o valor em outra posição quando a região do exemplo falha", () => {
    const renavam = field({
      region: { page: 0, x: 0.7, y: 0.5, w: 0.1, h: 0.03 }, // layout diferente do exemplo
      transforms: ["digits_only"],
      wildcards: [
        { kind: "length", min: 11, max: 11 },
        { kind: "charset", set: "digits" }
      ]
    });
    expect(extractField(crlv, renavam)).toMatchObject({ value: "01234567890", source: "wildcard" });
  });

  it("depois do rótulo: valor abaixo ou na mesma linha", () => {
    const renavam = field({ wildcards: [{ kind: "after_label", label: "renavam" }, { kind: "length", min: 11, max: 11 }] });
    expect(extractField(crlv, renavam).value).toBe("01234567890");
    const cor = field({ wildcards: [{ kind: "after_label", label: "Cor" }, { kind: "charset", set: "letters" }] });
    expect(extractField(crlv, cor).value).toBe("PRATA");
  });

  it("junta palavras quebradas pelo OCR (placa em dois pedaços)", () => {
    const placa = field({ transforms: ["upper"], wildcards: [{ kind: "mask", mask: "AAA9A99" }] });
    expect(extractField(crlv, placa).value).toBe("ABC1D23");
  });

  it("contém / começa com", () => {
    const chassi = field({ wildcards: [{ kind: "starts_with", value: "9BW" }, { kind: "length", min: 17, max: 17 }] });
    expect(extractField(crlv, chassi).value).toBe("9BWZZZ377VT004251");
  });

  it("sem região e sem filtro não inventa valor", () => {
    expect(extractField(crlv, field({}))).toMatchObject({ value: null, source: "none" });
  });

  it("extrai o template inteiro", () => {
    const results = extractTemplate(crlv, {
      fields: [
        field({ id: "a", wildcards: [{ kind: "length", min: 17, max: 17 }] }),
        field({ id: "b", wildcards: [{ kind: "regex", source: "^\\d{11}$" }] })
      ]
    });
    expect(results.map((result) => result.value)).toEqual(["9BWZZZ377VT004251", "01234567890"]);
  });
});

describe("utilitários", () => {
  it("máscara", () => {
    expect(maskMatches("ABC1D23", "AAA9A99")).toBe(true);
    expect(maskMatches("ABC-1234", "AAA-9999")).toBe(true);
    expect(maskMatches("AB1C234", "AAA9A99")).toBe(false);
  });

  it("transformações", () => {
    expect(applyTransforms("  abc-12 3 ", ["trim", "upper"])).toBe("ABC-12 3");
    expect(applyTransforms("R$ 1.234", ["digits_only"])).toBe("1234");
    expect(applyTransforms("ação 1", ["alnum_only"])).toBe("acao1");
  });

  it("sugere coringas a partir do exemplo", () => {
    expect(suggestWildcards("01234567890")).toEqual([
      { kind: "length", min: 11, max: 11 },
      { kind: "charset", set: "digits" }
    ]);
    expect(suggestWildcards("ABC1D23")).toEqual([
      { kind: "length", min: 7, max: 7 },
      { kind: "mask", mask: "AAA9A99" }
    ]);
  });

  it("destinos validam e formatam", () => {
    expect(getOcrDestination("carros.renavam").validate("123")).not.toBeNull();
    expect(getOcrDestination("carros.ano_fab").format("2021")).toBe(2021);
    expect(getOcrDestination("carros.cor").format("Prata")).toBe("prata");
    expect(getOcrDestination("inexistente").key).toBe("none");
  });
});
