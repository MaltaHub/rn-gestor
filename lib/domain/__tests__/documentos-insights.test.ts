import { describe, expect, it } from "vitest";
import {
  DOCUMENTO_INSIGHT_CODE,
  collectDocumentoInsightItems,
  extractDocumentoInsightFlagsFromRow,
  getDocumentoRowClass,
  isResponsavelViradoPendente,
  needsFinalizarDocumento,
  needsResponsavelVirado,
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
  it("FINALIZAR_DOCUMENTO anula os demais", () => {
    const items = collectDocumentoInsightItems({
      finalizarDocumento: true,
      responsavelPendente: true,
      missingData: true,
      insightMessage: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe(DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO);
  });

  it("RESPONSAVEL_PENDENTE anula DOCUMENTO_SEM_LINHA (peso 75 > 50)", () => {
    const items = collectDocumentoInsightItems({
      finalizarDocumento: false,
      responsavelPendente: true,
      missingData: true,
      insightMessage: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe(DOCUMENTO_INSIGHT_CODE.RESPONSAVEL_PENDENTE);
  });

  it("sem flags ativas nao ha insight", () => {
    expect(
      collectDocumentoInsightItems({
        finalizarDocumento: false,
        responsavelPendente: false,
        missingData: false,
        insightMessage: null,
      })
    ).toHaveLength(0);
  });

  it("mensagem custom do backend sobrepoe a padrao", () => {
    const items = collectDocumentoInsightItems({
      finalizarDocumento: true,
      responsavelPendente: false,
      missingData: false,
      insightMessage: "Fechar envelope do ABC1D23.",
    });
    expect(items[0].message).toBe("Fechar envelope do ABC1D23.");
  });
});

describe("responsavel do virado pendente", () => {
  it("vazio, espacos e 'Nao chegou' (com/sem acento) contam como pendente", () => {
    expect(isResponsavelViradoPendente(null)).toBe(true);
    expect(isResponsavelViradoPendente("")).toBe(true);
    expect(isResponsavelViradoPendente("   ")).toBe(true);
    expect(isResponsavelViradoPendente("Não chegou")).toBe(true);
    expect(isResponsavelViradoPendente("NAO CHEGOU")).toBe(true);
    expect(isResponsavelViradoPendente("João")).toBe(false);
  });

  it("so denuncia quando o veiculo esta PRONTO", () => {
    expect(needsResponsavelVirado({ estadoVeiculo: "PRONTO", responsavelVirado: null })).toBe(true);
    expect(needsResponsavelVirado({ estadoVeiculo: "PRONTO", responsavelVirado: "Não chegou" })).toBe(true);
    expect(needsResponsavelVirado({ estadoVeiculo: "PRONTO", responsavelVirado: "Maria" })).toBe(false);
    expect(needsResponsavelVirado({ estadoVeiculo: "NOVO", responsavelVirado: null })).toBe(false);
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

  it("linha PRONTO sem responsavel fica com sheet-row-responsavel-pendente", () => {
    const flags = extractDocumentoInsightFlagsFromRow({
      __finalizar_documento: false,
      __responsavel_pendente: true,
      __missing_data: false,
    });
    expect(getDocumentoRowClass(flags)).toBe("sheet-row-responsavel-pendente");
  });

  it("linha normal nao ganha classe", () => {
    expect(getDocumentoRowClass(extractDocumentoInsightFlagsFromRow({}))).toBe("");
  });
});
