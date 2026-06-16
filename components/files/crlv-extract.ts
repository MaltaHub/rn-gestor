/**
 * Extração do texto do CRLV no NAVEGADOR (o documento nunca sai do cliente).
 * - PDF com camada de texto (CRLV-e digital) → pdf.js lê o texto direto (sem OCR).
 * - Imagem (foto/scan) ou PDF escaneado → renderiza/usa a imagem e roda Tesseract.js.
 *
 * pdf.js e tesseract.js são pesados → carregados sob demanda (`await import`). O
 * worker do pdf.js é empacotado localmente; o Tesseract baixa o core/idioma da
 * CDN (apenas o motor, não o documento). Parsing dos campos em
 * `lib/domain/veiculo/identificacao.ts`.
 */
import { parseCrlvText, type CrlvFields } from "@/lib/domain/veiculo/identificacao";

// Mínimo de texto "útil" num PDF para considerá-lo digital (senão, OCR da imagem).
const PDF_TEXT_MIN_CHARS = 24;
// Escala de render do PDF escaneado antes do OCR (mais nitidez p/ o Tesseract).
const PDF_OCR_SCALE = 2;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function ocrImage(image: HTMLCanvasElement | File | Blob): Promise<string> {
  const { recognize } = await import("tesseract.js");
  const { data } = await recognize(image, "por");
  return data?.text ?? "";
}

async function pdfTextThenMaybeOcr(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker local — mantém o documento 100% no navegador.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);

  const content = await page.getTextContent();
  const text = content.items
    .map((item) => (typeof (item as { str?: unknown }).str === "string" ? (item as { str: string }).str : ""))
    .join(" ");

  if (text.replace(/\s+/g, "").length >= PDF_TEXT_MIN_CHARS) {
    return text; // CRLV-e digital: sem OCR.
  }

  // PDF escaneado: renderiza a 1ª página num canvas e faz OCR.
  const viewport = page.getViewport({ scale: PDF_OCR_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return text;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return ocrImage(canvas);
}

/** Texto bruto do CRLV (pdf.js para digital; Tesseract para imagem/escaneado). */
export async function extractCrlvText(file: File): Promise<string> {
  if (isPdf(file)) return pdfTextThenMaybeOcr(file);
  return ocrImage(file);
}

/** Campos do CRLV (placa/chassi/renavam) extraídos no navegador. */
export async function extractCrlvFields(file: File): Promise<CrlvFields> {
  const text = await extractCrlvText(file);
  return parseCrlvText(text);
}
