import { describe, expect, it } from "vitest";
import { buildTokenFileName, DOCUMENT_SLOTS, isCrlvSlot, isSlotPresent, matchDocumentType } from "@/components/files/document-slots";

const PLACA = "ABC1D23";
const slot = (key: string) => DOCUMENT_SLOTS.find((entry) => entry.key === key)!;

describe("matchDocumentType", () => {
  it("casa os tipos do processo pelo token (o mesmo que o banco lê)", () => {
    for (const key of ["crlv_branco", "crlv_virado", "nota_entrada", "nota_saida", "pericia", "atpv"]) {
      expect(matchDocumentType(buildTokenFileName(slot(key), PLACA, "doc.pdf"), PLACA)?.key).toBe(key);
    }
  });

  it("CRLV branco e virado não se confundem", () => {
    expect(matchDocumentType("crlv_branco_abc1d23.pdf", PLACA)?.key).toBe("crlv_branco");
    expect(matchDocumentType("crlv_virado_abc1d23-2.pdf", PLACA)?.key).toBe("crlv_virado");
  });

  it("reconhece os nomes antigos", () => {
    expect(matchDocumentType("estado_transferencia_virado_abc1d23__CRLV.pdf", PLACA)?.key).toBe("crlv_virado");
    expect(matchDocumentType("crlv_abc1d23__foto.jpg", PLACA)?.key).toBe("crlv_branco");
  });

  it("nao casa quando a placa difere ou o nome nao tem token", () => {
    expect(matchDocumentType("atpv_abc1d23.pdf", "XYZ9Z99")).toBeNull();
    expect(matchDocumentType("arquivo-solto.pdf", PLACA)).toBeNull();
  });

  it("só os CRLVs passam pela validação de placa", () => {
    expect(isCrlvSlot(slot("crlv_branco"))).toBe(true);
    expect(isCrlvSlot(slot("crlv_virado"))).toBe(true);
    expect(isCrlvSlot(slot("nota_entrada"))).toBe(false);
  });

  it("marca como já anexado só o tipo certo", () => {
    expect(isSlotPresent(slot("crlv_branco"), PLACA, ["crlv_virado_abc1d23.pdf"])).toBe(false);
    expect(isSlotPresent(slot("crlv_virado"), PLACA, ["crlv_virado_abc1d23.pdf"])).toBe(true);
  });
});

describe("nome do arquivo classificado", () => {
  it("é só o token + extensão (sem o nome original)", () => {
    expect(buildTokenFileName(slot("crlv_virado"), "ABC-1D23", "CRLV-e_2214401053739BG0401.pdf.pdf")).toBe("crlv_virado_abc-1d23.pdf");
    expect(buildTokenFileName(slot("nota_entrada"), PLACA, "NF 123.XML")).toBe("nota_entrada_abc1d23.xml");
  });

  it("não repete nome na pasta nem no mesmo envio", () => {
    const taken = new Set(["crlv_branco_abc1d23.pdf"]);
    expect(buildTokenFileName(slot("crlv_branco"), PLACA, "a.pdf", taken)).toBe("crlv_branco_abc1d23-2.pdf");
    expect(buildTokenFileName(slot("crlv_branco"), PLACA, "b.pdf", taken)).toBe("crlv_branco_abc1d23-3.pdf");
    expect(matchDocumentType("crlv_branco_abc1d23-3.pdf", PLACA)?.key).toBe("crlv_branco");
  });
});
