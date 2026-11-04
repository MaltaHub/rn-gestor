/**
 * Leitura de documentos NO NAVEGADOR (o arquivo nunca sai do cliente para OCR).
 * Única porta de entrada do domínio de OCR na UI: o console, a trava do CRLV
 * e a aplicação de templates usam isto.
 *
 * - PDF com camada de texto (CRLV-e digital): pdf.js dá texto + posição de cada
 *   trecho, sem OCR.
 * - Imagem ou PDF escaneado: Tesseract.js (palavras + caixas).
 * pdf.js e tesseract.js são pesados → carregados sob demanda.
 */
import type { OcrDocument, OcrWord } from "@/lib/domain/ocr/types";

export type RenderedPage = { width: number; height: number; url: string };

export type ReadDocumentResult = {
  document: OcrDocument;
  /** Texto bruto na ordem do leitor (pdf.js/Tesseract) — usado pelo parser legado do CRLV. */
  rawText: string;
  /** Imagens das páginas (só com `renderPages`), para o console desenhar a seleção. */
  pages: RenderedPage[];
};

type ReadOptions = {
  renderPages?: boolean;
  maxPages?: number;
  onProgress?: (message: string) => void;
};

const PDF_TEXT_MIN_CHARS = 24;
const OCR_SCALE = 2;
const RENDER_SCALE = 1.6;
const MAX_IMAGE_SIDE = 2200;

function isPdf(file: Blob & { name?: string }) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "");
}

type TesseractWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };

async function ocrCanvas(canvas: HTMLCanvasElement, page: number, onProgress?: (message: string) => void) {
  const { recognize } = await import("tesseract.js");
  const { data } = await recognize(canvas, "por", {
    logger: (event: { status?: string; progress?: number }) => {
      if (event.status === "recognizing text" && typeof event.progress === "number") {
        onProgress?.(`Lendo o documento (OCR)… ${Math.round(event.progress * 100)}%`);
      }
    }
  });
  const words: OcrWord[] = ((data.words ?? []) as TesseractWord[])
    .filter((word) => word.text.trim())
    .map((word) => ({
      text: word.text.trim(),
      page,
      box: {
        x: word.bbox.x0 / canvas.width,
        y: word.bbox.y0 / canvas.height,
        w: (word.bbox.x1 - word.bbox.x0) / canvas.width,
        h: (word.bbox.y1 - word.bbox.y0) / canvas.height
      }
    }));
  return { words, text: data.text ?? "" };
}

type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number };

/** Trechos do pdf.js → palavras com caixa (divide a largura pelo nº de caracteres). */
function pdfItemsToWords(items: PdfTextItem[], viewport: { width: number; height: number; convertToViewportPoint: (x: number, y: number) => number[] }, page: number) {
  const words: OcrWord[] = [];
  for (const item of items) {
    const text = typeof item.str === "string" ? item.str : "";
    if (!text.trim() || !item.transform) continue;
    const [, , c, d, e, f] = item.transform;
    const fontHeight = item.height || Math.hypot(c, d) || 10;
    const [left, baseline] = viewport.convertToViewportPoint(e, f);
    const width = item.width ?? fontHeight * text.length * 0.5;
    const charWidth = width / Math.max(1, text.length);
    let offset = 0;
    for (const token of text.split(/(\s+)/)) {
      if (token.trim()) {
        words.push({
          text: token,
          page,
          box: {
            x: (left + offset * charWidth) / viewport.width,
            y: (baseline - fontHeight) / viewport.height,
            w: (token.length * charWidth) / viewport.width,
            h: fontHeight / viewport.height
          }
        });
      }
      offset += token.length;
    }
  }
  return words;
}

async function readPdf(file: Blob, options: ReadOptions): Promise<ReadDocumentResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const total = Math.min(pdf.numPages, options.maxPages ?? 3);

  const words: OcrWord[] = [];
  const pagesMeta: OcrDocument["pages"] = [];
  const rendered: RenderedPage[] = [];
  const texts: string[] = [];
  let usedOcr = false;

  for (let index = 0; index < total; index += 1) {
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    pagesMeta.push({ width: viewport.width, height: viewport.height });

    const content = await page.getTextContent();
    const items = content.items as PdfTextItem[];
    const text = items.map((item) => item.str ?? "").join(" ");

    if (text.replace(/\s+/g, "").length >= PDF_TEXT_MIN_CHARS) {
      words.push(...pdfItemsToWords(items, viewport, index));
      texts.push(text);
    } else {
      // PDF escaneado: rasteriza e faz OCR.
      usedOcr = true;
      const ocrViewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(ocrViewport.width);
      canvas.height = Math.ceil(ocrViewport.height);
      const context = canvas.getContext("2d");
      if (context) {
        await page.render({ canvasContext: context, viewport: ocrViewport }).promise;
        const result = await ocrCanvas(canvas, index, options.onProgress);
        words.push(...result.words);
        texts.push(result.text);
      }
    }

    if (options.renderPages) {
      const renderViewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      const context = canvas.getContext("2d");
      if (context) {
        await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        rendered.push({ width: canvas.width, height: canvas.height, url: canvas.toDataURL("image/jpeg", 0.88) });
      }
    }
  }

  return { document: { pages: pagesMeta, words, source: usedOcr ? "ocr" : "pdf-text" }, rawText: texts.join("\n"), pages: rendered };
}

async function readImage(file: Blob, options: ReadOptions): Promise<ReadDocumentResult> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const result = await ocrCanvas(canvas, 0, options.onProgress);
  return {
    document: { pages: [{ width: canvas.width, height: canvas.height }], words: result.words, source: "ocr" },
    rawText: result.text,
    pages: options.renderPages ? [{ width: canvas.width, height: canvas.height, url: canvas.toDataURL("image/jpeg", 0.88) }] : []
  };
}

export async function readDocument(file: Blob & { name?: string }, options: ReadOptions = {}): Promise<ReadDocumentResult> {
  options.onProgress?.("Lendo o documento…");
  return isPdf(file) ? readPdf(file, options) : readImage(file, options);
}

/** Só as imagens das páginas (reabrir o console com o OCR já salvo, sem reprocessar). */
export async function renderPages(file: Blob & { name?: string }, maxPages = 3): Promise<RenderedPage[]> {
  if (!isPdf(file)) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return [{ width: canvas.width, height: canvas.height, url: canvas.toDataURL("image/jpeg", 0.88) }];
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: RenderedPage[] = [];
  for (let index = 0; index < Math.min(pdf.numPages, maxPages); index += 1) {
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvasContext: context, viewport }).promise;
    out.push({ width: canvas.width, height: canvas.height, url: canvas.toDataURL("image/jpeg", 0.88) });
  }
  return out;
}
