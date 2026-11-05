import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActorContext } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError } from "@/lib/api/errors";
import { assertIdentityFreeForVehicle } from "@/lib/domain/carros/identity-guard";
import { getOcrDestination } from "@/lib/domain/ocr/destinations";
import { ocrAnchorSchema, ocrDocumentSchema, ocrFieldSchema, type OcrApplyInput, type OcrTemplateInput } from "@/lib/domain/ocr/schemas";
import type { OcrAnchor, OcrApplyMode, OcrField, OcrTemplate, OcrTemplateSummary } from "@/lib/domain/ocr/types";
import type { Database, Json } from "@/lib/supabase/database.types";

type OcrSupabase = SupabaseClient<Database>;
type TemplateRow = Database["public"]["Tables"]["ocr_templates"]["Row"];

function parseFields(value: Json): OcrField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = ocrFieldSchema.safeParse(entry);
    return parsed.success ? [parsed.data as OcrField] : [];
  });
}

function parseAnchors(value: Json): OcrAnchor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = ocrAnchorSchema.safeParse(entry);
    return parsed.success ? [parsed.data as OcrAnchor] : [];
  });
}

function toSummary(row: TemplateRow): OcrTemplateSummary {
  return {
    id: row.id,
    name: row.nome,
    documentTypeKey: row.tipo_documento,
    active: row.ativo,
    applyMode: (row.modo_aplicacao === "auto" ? "auto" : "confirm") as OcrApplyMode,
    markReady: row.marca_pronto,
    sampleFileId: row.arquivo_exemplo_id,
    fields: parseFields(row.campos),
    anchors: parseAnchors(row.ancoras),
    updatedAt: row.updated_at,
    hasSampleDocument: row.exemplo_ocr !== null
  };
}

function toTemplate(row: TemplateRow): OcrTemplate {
  const { hasSampleDocument, ...summary } = toSummary(row);
  const sample = hasSampleDocument ? ocrDocumentSchema.safeParse(row.exemplo_ocr) : null;
  return { ...summary, sampleDocument: sample?.success ? sample.data : null };
}

function toRow(input: OcrTemplateInput, actor: ActorContext) {
  return {
    nome: input.name,
    tipo_documento: input.documentTypeKey,
    ativo: input.active,
    modo_aplicacao: input.applyMode,
    marca_pronto: input.markReady,
    arquivo_exemplo_id: input.sampleFileId,
    exemplo_ocr: (input.sampleDocument ?? null) as Json,
    campos: input.fields as unknown as Json,
    ancoras: input.anchors as unknown as Json,
    updated_at: new Date().toISOString(),
    updated_by: actor.userId
  };
}

function fail(code: string, message: string, error: unknown, status = 500): never {
  console.error(`[${code}]`, { error });
  throw new ApiHttpError(status, code, message);
}

export async function listOcrTemplates(supabase: OcrSupabase): Promise<OcrTemplateSummary[]> {
  const { data, error } = await supabase
    .from("ocr_templates")
    .select("id, nome, tipo_documento, ativo, modo_aplicacao, marca_pronto, arquivo_exemplo_id, campos, ancoras, updated_at, exemplo_ocr->source")
    .order("nome", { ascending: true });
  if (error) fail("OCR_TEMPLATES_LIST_FAILED", "Falha ao listar templates de OCR.", error);
  return (data ?? []).map((row) => {
    const { source, ...rest } = row as unknown as TemplateRow & { source: string | null };
    return toSummary({ ...rest, exemplo_ocr: source ? ({} as Json) : null } as TemplateRow);
  });
}

export async function getOcrTemplate(supabase: OcrSupabase, id: string): Promise<OcrTemplate> {
  const { data, error } = await supabase.from("ocr_templates").select("*").eq("id", id).maybeSingle();
  if (error) fail("OCR_TEMPLATE_READ_FAILED", "Falha ao carregar template de OCR.", error);
  if (!data) throw new ApiHttpError(404, "OCR_TEMPLATE_NOT_FOUND", "Template de OCR não encontrado.");
  return toTemplate(data);
}

export async function createOcrTemplate(supabase: OcrSupabase, actor: ActorContext, input: OcrTemplateInput) {
  const { data, error } = await supabase
    .from("ocr_templates")
    .insert({ ...toRow(input, actor), created_by: actor.userId })
    .select("*")
    .single();
  if (error) fail("OCR_TEMPLATE_CREATE_FAILED", "Falha ao criar template de OCR.", error, 400);
  await writeAuditLog({ action: "create", table: "ocr_templates", pk: data.id, actor, newData: { ...data, exemplo_ocr: undefined }, details: `Template de OCR ${data.nome} criado.` });
  return toTemplate(data);
}

export async function updateOcrTemplate(supabase: OcrSupabase, actor: ActorContext, id: string, input: OcrTemplateInput) {
  const { data, error } = await supabase.from("ocr_templates").update(toRow(input, actor)).eq("id", id).select("*").maybeSingle();
  if (error) fail("OCR_TEMPLATE_UPDATE_FAILED", "Falha ao salvar template de OCR.", error, 400);
  if (!data) throw new ApiHttpError(404, "OCR_TEMPLATE_NOT_FOUND", "Template de OCR não encontrado.");
  await writeAuditLog({ action: "update", table: "ocr_templates", pk: id, actor, newData: { ...data, exemplo_ocr: undefined }, details: `Template de OCR ${data.nome} atualizado.` });
  return toTemplate(data);
}

export async function deleteOcrTemplate(supabase: OcrSupabase, actor: ActorContext, id: string) {
  const { data, error } = await supabase.from("ocr_templates").delete().eq("id", id).select("id, nome").maybeSingle();
  if (error) fail("OCR_TEMPLATE_DELETE_FAILED", "Falha ao excluir template de OCR.", error, 400);
  if (!data) throw new ApiHttpError(404, "OCR_TEMPLATE_NOT_FOUND", "Template de OCR não encontrado.");
  await writeAuditLog({ action: "delete", table: "ocr_templates", pk: id, actor, oldData: data, details: `Template de OCR ${data.nome} excluído.` });
  return { id };
}

type CarroUpdate = Database["public"]["Tables"]["carros"]["Update"];

/**
 * Grava no veículo os valores confirmados. Só destinos `write` da allow-list;
 * cada valor é validado e formatado pelo destino (nunca coluna livre).
 */
export async function applyOcrValues(supabase: OcrSupabase, actor: ActorContext, input: OcrApplyInput) {
  const updates: Record<string, string | number> = {};
  const problems: string[] = [];

  for (const [key, raw] of Object.entries(input.values)) {
    const destination = getOcrDestination(key);
    if (destination.kind !== "write" || !destination.column || !raw.trim()) continue;
    const problem = destination.validate(raw.trim());
    if (problem) problems.push(`${destination.label}: ${problem}`);
    else updates[destination.column] = destination.format(raw.trim());
  }

  if (problems.length > 0) throw new ApiHttpError(400, "OCR_VALUES_INVALID", problems.join(" "));
  if (Object.keys(updates).length === 0 && !input.markReady) {
    throw new ApiHttpError(400, "OCR_NOTHING_TO_APPLY", "Nenhum valor válido para gravar.");
  }

  // Documento de outro veículo: chassi/renavam já cadastrados em outra placa.
  await assertIdentityFreeForVehicle(supabase, input.carroId, {
    chassi: typeof updates.chassi === "string" ? updates.chassi : null,
    renavam: typeof updates.renavam === "string" ? updates.renavam : null
  });

  const patch: CarroUpdate = { ...(updates as CarroUpdate), ...(input.markReady ? { estado_veiculo: "PRONTO" } : {}) };
  const columns = ["id", "placa", ...Object.keys(updates), ...(input.markReady ? ["estado_veiculo"] : [])].join(", ");

  const { data: oldData, error: oldError } = await supabase.from("carros").select(columns).eq("id", input.carroId).maybeSingle();
  if (oldError) fail("CARRO_READ_FAILED", "Falha ao ler o veículo.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Veículo não encontrado.");

  const { data, error } = await supabase.from("carros").update(patch).eq("id", input.carroId).select(columns).single();
  if (error) fail("OCR_APPLY_FAILED", "Falha ao gravar os dados no veículo.", error, 400);

  await writeAuditLog({
    action: "update",
    table: "carros",
    pk: input.carroId,
    actor,
    oldData,
    newData: data,
    details: `Dados extraídos por OCR${input.templateId ? ` (template ${input.templateId})` : ""}${input.markReady ? " + estado_veiculo → PRONTO" : ""}.`
  });

  return { carroId: input.carroId, applied: updates, markedReady: input.markReady };
}
