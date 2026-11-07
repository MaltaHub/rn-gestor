import { describe, expect, it } from "vitest";

import { checkResults } from "@/components/files/ocr/use-ocr";
import type { OcrFieldResult, OcrTemplateSummary } from "@/lib/domain/ocr/types";

const template = {
  id: "t",
  name: "Nota de entrada",
  documentTypeKey: "nota_entrada",
  active: true,
  applyMode: "confirm",
  markReady: false,
  sampleFileId: null,
  hasSampleDocument: false,
  updatedAt: "",
  anchors: [],
  fields: [
    {
      id: "codigo",
      label: "Código",
      destination: "check.codigo_nota_fiscal",
      region: null,
      sampleText: "",
      transforms: [],
      wildcards: [],
      required: true
    }
  ]
} as unknown as OcrTemplateSummary;

const read = (value: string): OcrFieldResult[] => [{ fieldId: "codigo", value, source: "wildcard", boxes: [], valid: true }];

describe("trava do código da nota", () => {
  it("veículo sem código: não recusa, oferece gravar o código lido", () => {
    const outcome = checkResults(template, read("o21 1 2026 5890"), { carroId: "c1", placa: "ABC1D23", codigoNotaFiscal: null });
    expect(outcome).toMatchObject({ ok: true, adopt: [{ key: "carros.codigo_nota_fiscal", value: "O21_1_2026_5890" }] });
  });

  it("veículo com código: confere (tolerando O/0 e separadores)", () => {
    expect(checkResults(template, read("021_1_2026_5890"), { carroId: "c1", placa: null, codigoNotaFiscal: "O21_1_2026_5890" })).toMatchObject({
      ok: true,
      adopt: []
    });
    expect(checkResults(template, read("O21_1_2026_5891"), { carroId: "c1", placa: null, codigoNotaFiscal: "O21_1_2026_5890" }).ok).toBe(false);
  });

  it("código lido fora do formato não é adotado", () => {
    expect(checkResults(template, read("XYZ"), { carroId: "c1", placa: null, codigoNotaFiscal: null }).ok).toBe(false);
  });
});
