import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActorContext } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { ApiHttpError, databaseRuleMessage } from "@/lib/api/errors";
import { assertIdentityFreeForVehicle } from "@/lib/domain/carros/identity-guard";
import { requireRole } from "@/lib/api/auth";
import { getGridTableConfig } from "@/lib/api/grid-config";
import { dispatchGridDomainUpdate, isDomainMutationTable } from "@/lib/api/grid/mutation-dispatcher";
import { sanitizeForUpdate } from "@/lib/api/grid/policy";
import { isAllowedOcrDestination, resolveOcrDestination } from "@/lib/domain/ocr/destinations";
import { decideFornecedor, type FornecedorRow } from "@/lib/domain/ocr/fornecedor";
import { getOcrCatalog } from "@/lib/domain/ocr/server-catalog";
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
  throw new ApiHttpError(status, code, databaseRuleMessage(error as { code?: string; message?: string }) ?? message);
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

/** Template só referencia destinos do catálogo do servidor. */
function assertTemplateDestinations(input: OcrTemplateInput) {
  const catalog = getOcrCatalog();
  const invalid = input.fields.filter((field) => !isAllowedOcrDestination(field.destination, catalog));
  if (invalid.length > 0) {
    throw new ApiHttpError(400, "OCR_DESTINATION_NOT_ALLOWED", `Destino não permitido: ${invalid.map((field) => field.destination).join(", ")}.`);
  }
}

export async function createOcrTemplate(supabase: OcrSupabase, actor: ActorContext, input: OcrTemplateInput) {
  assertTemplateDestinations(input);
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
  assertTemplateDestinations(input);
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

type FornecedorPlan = {
  /** Fornecedor achado (null = cadastrar um novo com `create`). */
  remetenteId: string | null;
  create: Record<string, unknown> | null;
  /** Campos VAZIOS do fornecedor achado que o documento preenche. */
  fill: Record<string, unknown>;
  /** documentos.remetente_id atual do veículo. */
  linkedId: string | null;
};

/** Fornecedor do veículo (regra em fornecedor.ts). Só lê — a gravação vem depois. */
async function planFornecedor(supabase: OcrSupabase, carroId: string, values: Record<string, unknown>): Promise<FornecedorPlan> {
  const { data: documento, error: documentoError } = await supabase
    .from("documentos")
    .select("carro_id, remetente_id")
    .eq("carro_id", carroId)
    .maybeSingle();
  if (documentoError) fail("OCR_ROW_LOOKUP_FAILED", "Falha ao localizar o registro em Documentos.", documentoError);
  if (!documento) throw new ApiHttpError(409, "OCR_ROW_NOT_FOUND", "O veículo ainda não tem registro em Documentos (onde fica o fornecedor).");

  const { data, error } = await supabase.from("remetentes").select("id, nome, cpf_cnpj, contato, endereco").limit(5000);
  if (error) fail("OCR_ROW_LOOKUP_FAILED", "Falha ao consultar os fornecedores.", error);

  const decision = decideFornecedor((data ?? []) as FornecedorRow[], documento.remetente_id, values);
  if (decision.kind === "missing-name") {
    throw new ApiHttpError(400, "OCR_FORNECEDOR_SEM_NOME", "Fornecedor novo: grave também o nome (o CPF/CNPJ não está cadastrado).");
  }
  return decision.kind === "existing"
    ? { remetenteId: decision.id, create: null, fill: decision.fill, linkedId: documento.remetente_id }
    : { remetenteId: null, create: decision.row, fill: {}, linkedId: documento.remetente_id };
}

/**
 * Grava no veículo os valores confirmados. Só destinos `write` da allow-list;
 * cada valor é validado e formatado pelo destino (nunca coluna livre).
 */
export async function applyOcrValues(supabase: OcrSupabase, actor: ActorContext, input: OcrApplyInput) {
  const catalog = getOcrCatalog();
  const byTable = new Map<string, Record<string, string | number | boolean>>();
  const problems: string[] = [];

  for (const [key, raw] of Object.entries(input.values)) {
    if (!raw.trim()) continue;
    // Invariante #4: só colunas do catálogo (reconstruído aqui, nunca do cliente).
    if (!isAllowedOcrDestination(key, catalog)) {
      throw new ApiHttpError(400, "OCR_DESTINATION_NOT_ALLOWED", `Destino não permitido: ${key}.`);
    }
    const destination = resolveOcrDestination(key, catalog);
    if (destination.kind !== "write" || !destination.table || !destination.column) continue;
    const problem = destination.validate(raw.trim());
    if (problem) {
      problems.push(`${destination.label}: ${problem}`);
      continue;
    }
    const patch = byTable.get(destination.table) ?? {};
    patch[destination.column] = destination.format(raw.trim());
    byTable.set(destination.table, patch);
  }

  if (input.markReady) byTable.set("carros", { ...(byTable.get("carros") ?? {}), estado_veiculo: "PRONTO" });
  if (problems.length > 0) throw new ApiHttpError(400, "OCR_VALUES_INVALID", problems.join(" "));
  if (byTable.size === 0) throw new ApiHttpError(400, "OCR_NOTHING_TO_APPLY", "Nenhum valor válido para gravar.");

  const carros = byTable.get("carros");
  if (carros) {
    // Documento de outro veículo: chassi/renavam já cadastrados em outra placa.
    await assertIdentityFreeForVehicle(supabase, input.carroId, {
      chassi: typeof carros.chassi === "string" ? carros.chassi : null,
      renavam: typeof carros.renavam === "string" ? carros.renavam : null
    });
  }

  // 1) Resolve TODAS as linhas antes de gravar (nada de gravação parcial).
  const plans: Array<{ table: string; pk: string; patch: Record<string, unknown> }> = [];
  let fornecedorPlan: FornecedorPlan | null = null;
  for (const [table, values] of byTable) {
    const config = getGridTableConfig(table);
    if (!config || config.readOnly) throw new ApiHttpError(400, "OCR_DESTINATION_NOT_ALLOWED", `Tabela não permitida: ${table}.`);
    requireRole(actor, config.minWriteRole);
    const patch = sanitizeForUpdate(values as never, table === "carros" ? [...config.editableColumns, "estado_veiculo"] : config.editableColumns);
    if (table === "carros") {
      plans.push({ table, pk: input.carroId, patch });
      continue;
    }
    if (catalog.find((entry) => entry.table === table)?.link === "fornecedor") {
      // Ligar o fornecedor grava documentos.remetente_id.
      requireRole(actor, getGridTableConfig("documentos")?.minWriteRole ?? "ADMINISTRADOR");
      fornecedorPlan = await planFornecedor(supabase, input.carroId, patch);
      continue;
    }
    if (catalog.find((entry) => entry.table === table)?.link === "arquivo") {
      // Notas/perícias: 1 registro por ARQUIVO, criado pelo banco ao classificar
      // o arquivo na pasta do veículo. Carro + arquivo amarram o registro certo.
      if (!input.fileId) {
        throw new ApiHttpError(409, "OCR_FILE_REQUIRED", `${config.label}: os dados só podem ser gravados a partir do arquivo enviado.`);
      }
      const client = supabase as unknown as SupabaseClient;
      const { data, error } = await client
        .from(table)
        .select(config.primaryKey)
        .eq("arquivo_id", input.fileId)
        .eq("carro_id", input.carroId)
        .maybeSingle();
      if (error) fail("OCR_ROW_LOOKUP_FAILED", `Falha ao localizar o registro em ${config.label}.`, error);
      const row = data as Record<string, unknown> | null;
      if (!row) {
        throw new ApiHttpError(
          409,
          "OCR_ROW_NOT_FOUND",
          `O arquivo não tem registro em ${config.label}: classifique-o na pasta de documentos do veículo (com a automação ativa).`
        );
      }
      plans.push({ table, pk: String(row[config.primaryKey]), patch });
      continue;
    }
    const { data, error } = await supabase
      .from(table as "documentos")
      .select(config.primaryKey as "carro_id")
      .eq("carro_id", input.carroId)
      .limit(2);
    if (error) fail("OCR_ROW_LOOKUP_FAILED", `Falha ao localizar o registro em ${config.label}.`, error);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (rows.length === 0) throw new ApiHttpError(409, "OCR_ROW_NOT_FOUND", `O veículo ainda não tem registro em ${config.label}.`);
    if (rows.length > 1) throw new ApiHttpError(409, "OCR_ROW_AMBIGUOUS", `O veículo tem mais de um registro em ${config.label}; não dá para saber qual atualizar.`);
    plans.push({ table, pk: String(rows[0][config.primaryKey]), patch });
  }

  // 2) Grava: tabelas com regra de domínio pelo dispatcher; as demais direto + auditoria.
  const details = `Dados extraídos por OCR${input.templateId ? ` (template ${input.templateId})` : ""}.`;
  const fornecedorApplied: Record<string, unknown> = {};
  if (fornecedorPlan) {
    let remetenteId = fornecedorPlan.remetenteId;
    if (!remetenteId && fornecedorPlan.create) {
      const { data, error } = await supabase
        .from("remetentes")
        .insert(fornecedorPlan.create as Database["public"]["Tables"]["remetentes"]["Insert"])
        .select("*")
        .single();
      if (error) fail("OCR_FORNECEDOR_CREATE_FAILED", "Falha ao cadastrar o fornecedor.", error, 400);
      remetenteId = data.id;
      Object.assign(fornecedorApplied, fornecedorPlan.create);
      await writeAuditLog({ action: "create", table: "remetentes", pk: data.id, actor, newData: data, details });
    } else if (remetenteId && Object.keys(fornecedorPlan.fill).length > 0) {
      const { data: oldData } = await supabase.from("remetentes").select("*").eq("id", remetenteId).maybeSingle();
      const { data, error } = await supabase.from("remetentes").update(fornecedorPlan.fill).eq("id", remetenteId).select("*").single();
      if (error) fail("OCR_APPLY_FAILED", "Falha ao gravar no fornecedor.", error, 400);
      Object.assign(fornecedorApplied, fornecedorPlan.fill);
      await writeAuditLog({ action: "update", table: "remetentes", pk: remetenteId, actor, oldData, newData: data, details });
    }
    if (remetenteId && remetenteId !== fornecedorPlan.linkedId) {
      const documentosPlan = plans.find((plan) => plan.table === "documentos");
      if (documentosPlan) documentosPlan.patch.remetente_id = remetenteId;
      else plans.push({ table: "documentos", pk: input.carroId, patch: { remetente_id: remetenteId } });
    }
  }
  for (const plan of plans) {
    if (isDomainMutationTable(plan.table)) {
      await dispatchGridDomainUpdate({ table: plan.table, supabase, actor, id: plan.pk, patch: plan.patch, priceChangeContext: details });
      continue;
    }
    const config = getGridTableConfig(plan.table)!;
    const client = supabase as unknown as SupabaseClient;
    const { data: oldData, error: oldError } = await client.from(plan.table).select("*").eq(config.primaryKey, plan.pk).maybeSingle();
    if (oldError) fail("OCR_ROW_READ_FAILED", `Falha ao ler ${config.label}.`, oldError);
    const { data, error } = await client.from(plan.table).update(plan.patch).eq(config.primaryKey, plan.pk).select("*").single();
    if (error) fail("OCR_APPLY_FAILED", `Falha ao gravar em ${config.label}.`, error, 400);
    await writeAuditLog({ action: "update", table: plan.table, pk: plan.pk, actor, oldData, newData: data, details });
  }

  const applied = Object.fromEntries([
    ...plans.flatMap((plan) => Object.entries(plan.patch).map(([column, value]) => [`${plan.table}.${column}`, value])),
    ...Object.entries(fornecedorApplied).map(([column, value]) => [`remetentes.${column}`, value])
  ]);
  return { carroId: input.carroId, applied, markedReady: input.markReady };
}
