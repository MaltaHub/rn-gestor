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

/**
 * value = um valor (placa, renavam...) achado na posição ou pelos coringas;
 * area  = MÁSCARA DE ÁREA: todo o texto dentro do retângulo desenhado, com as
 *         quebras de linha (endereço, observações...). Só posição, sem busca.
 */
export type OcrFieldMode = "value" | "area";

export type OcrField = {
  id: string;
  label: string;
  mode?: OcrFieldMode;
  /** Chave da allow-list de destinos (lib/domain/ocr/destinations.ts). */
  destination: string;
  /** Onde o valor estava no exemplo; null = campo só coringa. */
  region: (OcrBox & { page: number }) | null;
  sampleText: string;
  transforms: OcrTransform[];
  wildcards: OcrWildcard[];
  required: boolean;
};

/**
 * ÂNCORA: o documento PRECISA conter este valor, senão o processo é cancelado
 * (o arquivo não sobe e nada é gravado). Evita registrar dados do veículo errado.
 * - vehicle: valor do veículo da pasta de destino (placa/chassi/renavam/código da nota);
 * - text: texto fixo que identifica o documento (ex.: "CERTIFICADO DE REGISTRO").
 */
export type OcrAnchorVehicleField = "placa" | "chassi" | "renavam" | "codigo_nota_fiscal";

export type OcrAnchor = { kind: "vehicle"; field: OcrAnchorVehicleField } | { kind: "text"; value: string };

export type OcrAnchorVehicle = Partial<Record<OcrAnchorVehicleField, string | null>>;

export type OcrAnchorResult = {
  anchor: OcrAnchor;
  /** skipped = veículo sem esse dado cadastrado (não dá para conferir). */
  status: "ok" | "missing" | "skipped";
  expected: string | null;
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
  anchors: OcrAnchor[];
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
