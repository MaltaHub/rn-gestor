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
