import { describe, expect, it } from "vitest";
import { buildTokenFileName, DOCUMENT_SLOTS, matchDocumentType } from "@/components/files/document-slots";

const PLACA = "ABC1D23";

describe("matchDocumentType", () => {
  it("casa um tipo de estado (campo+valor) pelo token", () => {
    const slot = DOCUMENT_SLOTS.find((entry) => entry.key === "pericia_autentica");
    expect(slot).toBeTruthy();
    const fileName = buildTokenFileName(slot!, PLACA, "laudo.pdf");
    expect(matchDocumentType(fileName, PLACA)?.key).toBe("pericia");
  });

  it("casa um tipo organizacional pela key", () => {
    const slot = DOCUMENT_SLOTS.find((entry) => entry.key === "atpv");
    expect(slot).toBeTruthy();
    const fileName = buildTokenFileName(slot!, PLACA, "doc.pdf");
    expect(matchDocumentType(fileName, PLACA)?.key).toBe("atpv");
  });

  it("nao casa quando a placa difere ou o nome nao tem token", () => {
    const slot = DOCUMENT_SLOTS.find((entry) => entry.key === "atpv")!;
    const fileName = buildTokenFileName(slot, PLACA, "doc.pdf");
    expect(matchDocumentType(fileName, "XYZ9Z99")).toBeNull();
    expect(matchDocumentType("arquivo-solto.pdf", PLACA)).toBeNull();
  });
});

describe("nome do arquivo classificado", () => {
  const virado = DOCUMENT_SLOTS.find((entry) => entry.key === "estado_transferencia_virado")!;
  const crlv = DOCUMENT_SLOTS.find((entry) => entry.key === "crlv")!;

  it("é só o token + extensão (sem o nome original)", () => {
    expect(buildTokenFileName(virado, "ABC-1D23", "CRLV-e_2214401053739BG0401.pdf.pdf")).toBe("estado_transferencia_virado_abc-1d23.pdf");
    expect(buildTokenFileName(crlv, PLACA, "foto do documento.JPG")).toBe("crlv_abc1d23.jpg");
  });

  it("não repete nome na pasta nem no mesmo envio", () => {
    const taken = new Set(["crlv_abc1d23.pdf"]);
    expect(buildTokenFileName(crlv, PLACA, "a.pdf", taken)).toBe("crlv_abc1d23-2.pdf");
    expect(buildTokenFileName(crlv, PLACA, "b.pdf", taken)).toBe("crlv_abc1d23-3.pdf");
    expect(matchDocumentType("crlv_abc1d23-3.pdf", PLACA)?.key).toBe("crlv");
  });
});
