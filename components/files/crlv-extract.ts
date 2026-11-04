/**
 * Extração do CRLV pelo parser legado (fallback quando não há template de OCR
 * ativo para o tipo). A leitura do arquivo é a do runtime único de OCR
 * (`components/files/ocr/ocr-runtime.ts`); o parsing dos campos vive em
 * `lib/domain/veiculo/identificacao.ts`.
 */
import { readDocument } from "@/components/files/ocr/ocr-runtime";
import { parseCrlvText, type CrlvFields } from "@/lib/domain/veiculo/identificacao";

/** Texto bruto do CRLV (pdf.js para digital; Tesseract para imagem/escaneado). */
export async function extractCrlvText(file: File): Promise<string> {
  const { rawText } = await readDocument(file, { maxPages: 1 });
  return rawText;
}

/** Campos do CRLV (placa/chassi/renavam) extraídos no navegador. */
export async function extractCrlvFields(file: File): Promise<CrlvFields> {
  return parseCrlvText(await extractCrlvText(file));
}
