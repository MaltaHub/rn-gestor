import { z } from "zod";

import { isOcrDestinationKeyShape } from "@/lib/domain/ocr/destinations";
import { OCR_TRANSFORMS } from "@/lib/domain/ocr/types";

const unit = z.number().min(0).max(1);
const boxSchema = z.object({ x: unit, y: unit, w: unit, h: unit });

const wildcardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("length"), min: z.number().int().min(0).max(500), max: z.number().int().min(0).max(500) }),
  z.object({ kind: z.literal("contains"), value: z.string().max(120) }),
  z.object({ kind: z.literal("starts_with"), value: z.string().max(120) }),
  z.object({ kind: z.literal("ends_with"), value: z.string().max(120) }),
  z.object({ kind: z.literal("mask"), mask: z.string().min(1).max(60) }),
  z.object({ kind: z.literal("charset"), set: z.enum(["digits", "letters", "alnum"]) }),
  z.object({ kind: z.literal("after_label"), label: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal("regex"), source: z.string().min(1).max(200) })
]);

export const ocrFieldSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  mode: z.enum(["value", "area"]).optional(),
  // Forma "tabela.coluna" ou especial; o servidor confere contra o catálogo ao salvar/gravar.
  destination: z.string().max(80).refine(isOcrDestinationKeyShape, "Destino inválido."),
  region: boxSchema.extend({ page: z.number().int().min(0).max(50) }).nullable(),
  sampleText: z.string().max(4000),
  transforms: z.array(z.enum(OCR_TRANSFORMS)).max(10),
  wildcards: z.array(wildcardSchema).max(12),
  required: z.boolean()
});

const ocrWordSchema = z.object({ text: z.string().max(200), page: z.number().int().min(0).max(50), box: boxSchema });

export const ocrDocumentSchema = z.object({
  pages: z.array(z.object({ width: z.number().positive(), height: z.number().positive() })).max(50),
  words: z.array(ocrWordSchema).max(20_000),
  source: z.enum(["pdf-text", "ocr"])
});

export const ocrAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("vehicle"), field: z.enum(["placa", "chassi", "renavam", "codigo_nota_fiscal"]) }),
  z.object({ kind: z.literal("text"), value: z.string().trim().min(1).max(120) })
]);

export const ocrTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  documentTypeKey: z.string().trim().min(1).max(60).nullable(),
  active: z.boolean(),
  applyMode: z.enum(["confirm", "auto"]),
  markReady: z.boolean(),
  sampleFileId: z.string().uuid().nullable(),
  sampleDocument: ocrDocumentSchema.nullable(),
  fields: z.array(ocrFieldSchema).max(40),
  anchors: z.array(ocrAnchorSchema).max(10).default([])
});
export type OcrTemplateInput = z.infer<typeof ocrTemplateInputSchema>;

export const ocrApplySchema = z.object({
  carroId: z.string().uuid(),
  /** Arquivo de origem: tabelas ligadas ao arquivo (notas, perícias) gravam no registro dele. */
  fileId: z.string().uuid().nullable().default(null),
  templateId: z.string().uuid().nullable(),
  /** destino → valor extraído/confirmado. */
  values: z.record(z.string(), z.string().max(200)),
  markReady: z.boolean()
});
export type OcrApplyInput = z.infer<typeof ocrApplySchema>;
