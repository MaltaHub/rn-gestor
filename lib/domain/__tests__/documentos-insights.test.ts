import { describe, expect, it } from "vitest";
import {
  DOCUMENTO_INSIGHT_CODE,
  collectDocumentoInsightItems,
  extractDocumentoInsightFlagsFromRow,
  getDocumentoRowClass,
  needsFinalizarDocumento,
} from "@/lib/domain/documentos-insights";

describe("needsFinalizarDocumento", () => {
  it("vendido com envelope FECHANDO precisa finalizar", () => {
    expect(needsFinalizarDocumento({ carroVendido: true, envelope: "FECHANDO" })).toBe(true);
  });

  it("vendido com envelope FECHADO esta concluido", () => {
    expect(needsFinalizarDocumento({ carroVendido: true, envelope: "FECHADO" })).toBe(false);
  });

  it("vendido sem envelope (null) ainda precisa finalizar", () => {
    expect(needsFinalizarDocumento({ carroVendido: true, envelope: null })).toBe(true);
  });

  it("nao vendido nunca precisa finalizar", () => {
    expect(needsFinalizarDocumento({ carroVendido: false, envelope: "FECHANDO" })).toBe(false);
  });
});

describe("collectDocumentoInsightItems — 1 insight dominante por linha", () => {
  it("FINALIZAR_DOCUMENTO anula DOCUMENTO_SEM_LINHA", () => {
    const items = collectDocumentoInsightItems({
      finalizarDocumento: true,
      missingData: true,
      insightMessage: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe(DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO);
  });

  it("sem flags ativas nao ha insight", () => {
    expect(
      collectDocumentoInsightItems({ finalizarDocumento: false, missingData: false, insightMessage: null })
    ).toHaveLength(0);
  });

  it("mensagem custom do backend sobrepoe a padrao", () => {
    const items = collectDocumentoInsightItems({
      finalizarDocumento: true,
      missingData: false,
      insightMessage: "Fechar envelope do ABC1D23.",
    });
    expect(items[0].message).toBe("Fechar envelope do ABC1D23.");
  });
});

describe("getDocumentoRowClass / extractDocumentoInsightFlagsFromRow", () => {
  it("linha a finalizar fica com sheet-row-warning", () => {
    const flags = extractDocumentoInsightFlagsFromRow({
      __finalizar_documento: true,
      __missing_data: false,
    });
    expect(getDocumentoRowClass(flags)).toBe("sheet-row-warning");
  });

  it("linha missing fica com sheet-row-missing-data", () => {
    const flags = extractDocumentoInsightFlagsFromRow({
      __finalizar_documento: false,
      __missing_data: true,
    });
    expect(getDocumentoRowClass(flags)).toBe("sheet-row-missing-data");
  });

  it("linha normal nao ganha classe", () => {
    expect(getDocumentoRowClass(extractDocumentoInsightFlagsFromRow({}))).toBe("");
  });
});
