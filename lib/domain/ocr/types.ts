/**
 * Domínio de OCR/extração (puro, sem I/O). O navegador lê o documento
 * (components/files/ocr/ocr-runtime.ts) e produz um `OcrDocument`; este
 * domínio decide o que extrair a partir de um TEMPLATE montado no console.
 */

/** Caixa normalizada (0..1) relativa à página. */
export type OcrBox = { x: number; y: number; w: number; h: number };

export type OcrWord = { text: string; page: number; box: OcrBox };

export type OcrDocument = {
  pages: Array<{ width: number; height: number }>;
  words: OcrWord[];
  source: "pdf-text" | "ocr";
};

export const OCR_TRANSFORMS = ["trim", "upper", "digits_only", "alnum_only", "no_spaces"] as const;
export type OcrTransform = (typeof OCR_TRANSFORMS)[number];

/**
 * Seleção CORINGA: regras que valem quando a posição do exemplo não cobre
 * todos os casos. Viram filtro do valor achado na região e, sem região (ou se
 * ela falhar), buscam o valor no documento inteiro.
 */
export type OcrWildcard =
  | { kind: "length"; min: number; max: number }
  | { kind: "contains"; value: string }
  | { kind: "starts_with"; value: string }
  | { kind: "ends_with"; value: string }
  /** 9 = dígito, A = letra, * = letra ou dígito; demais caracteres literais. */
  | { kind: "mask"; mask: string }
  | { kind: "charset"; set: "digits" | "letters" | "alnum" }
  /** O valor vem logo depois (na linha ou abaixo) deste rótulo. */
  | { kind: "after_label"; label: string }
  | { kind: "regex"; source: string };

export type OcrWildcardKind = OcrWildcard["kind"];

export type OcrField = {
  id: string;
  label: string;
  /** Chave da allow-list de destinos (lib/domain/ocr/destinations.ts). */
  destination: string;
  /** Onde o valor estava no exemplo; null = campo só coringa. */
  region: (OcrBox & { page: number }) | null;
  sampleText: string;
  transforms: OcrTransform[];
  wildcards: OcrWildcard[];
  required: boolean;
};

export type OcrApplyMode = "confirm" | "auto";

export type OcrTemplate = {
  id: string;
  name: string;
  /** Chave de DOCUMENT_TYPES (components/files/document-slots.ts) que aciona o template no upload. */
  documentTypeKey: string | null;
  active: boolean;
  applyMode: OcrApplyMode;
  /** Ao gravar, marca o veículo como PRONTO (comportamento do CRLV). */
  markReady: boolean;
  sampleFileId: string | null;
  /** OCR do exemplo guardado (reabrir o console sem reprocessar). */
  sampleDocument: OcrDocument | null;
  fields: OcrField[];
  updatedAt: string;
};

export type OcrFieldResult = {
  fieldId: string;
  value: string | null;
  source: "region" | "wildcard" | "none";
  /** Palavras usadas (destacar no documento). */
  boxes: Array<OcrBox & { page: number }>;
  valid: boolean;
};

/** Resumo para listas/upload: sem o OCR do exemplo (pode ter milhares de palavras). */
export type OcrTemplateSummary = Omit<OcrTemplate, "sampleDocument"> & { hasSampleDocument: boolean };
