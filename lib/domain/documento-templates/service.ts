import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import type { ActorContext } from "@/lib/api/auth";
import type { DocumentoTemplateInsert, DocumentoTemplateRow } from "@/lib/domain/db";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  DocumentoTemplateCreateInput,
  DocumentoTemplateUpdateInput
} from "@/lib/domain/documento-templates/schemas";

type DomainSupabase = SupabaseClient<Database>;

const TABLE = "documento_templates";

export async function listDocumentoTemplates(input: {
  supabase: DomainSupabase;
  includeInactive?: boolean;
}): Promise<DocumentoTemplateRow[]> {
  const { supabase, includeInactive } = input;
  let query = supabase.from(TABLE).select("*").order("titulo", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new ApiHttpError(500, "TEMPLATES_LIST_FAILED", "Falha ao listar templates.", error);
  return (data ?? []) as DocumentoTemplateRow[];
}

export async function getDocumentoTemplate(
  supabase: DomainSupabase,
  id: string
): Promise<DocumentoTemplateRow> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiHttpError(400, "TEMPLATE_READ_FAILED", "Falha ao carregar template.", error);
  if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Template nao encontrado.");
  return data as DocumentoTemplateRow;
}

export async function createDocumentoTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: DocumentoTemplateCreateInput;
}): Promise<DocumentoTemplateRow> {
  const { supabase, actor, row } = input;
  const payload: DocumentoTemplateInsert = {
    titulo: row.titulo,
    descricao: row.descricao ?? null,
    conteudo: row.conteudo as Json,
    is_active: row.is_active ?? true,
    created_by_user_id: actor.authUserId,
    updated_by_user_id: actor.authUserId
  };

  const { data, error } = await supabase.from(TABLE).insert(payload).select("*").single();
  if (error) throw new ApiHttpError(400, "TEMPLATE_CREATE_FAILED", "Falha ao criar template.", error);

  await writeAuditLog({ action: "create", table: TABLE, pk: data.id, actor, newData: data });
  return data as DocumentoTemplateRow;
}

export async function updateDocumentoTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: DocumentoTemplateUpdateInput;
}): Promise<DocumentoTemplateRow> {
  const { supabase, actor, id, patch } = input;

  const { data: old, error: readError } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (readError) throw new ApiHttpError(400, "TEMPLATE_READ_FAILED", "Falha ao carregar template.", readError);
  if (!old) throw new ApiHttpError(404, "NOT_FOUND", "Template nao encontrado.");

  const updates: Record<string, unknown> = { updated_by_user_id: actor.authUserId };
  if (patch.titulo !== undefined) updates.titulo = patch.titulo;
  if (patch.descricao !== undefined) updates.descricao = patch.descricao;
  if (patch.conteudo !== undefined) updates.conteudo = patch.conteudo as Json;
  if (patch.is_active !== undefined) updates.is_active = patch.is_active;

  const { data, error } = await supabase.from(TABLE).update(updates).eq("id", id).select("*").single();
  if (error) throw new ApiHttpError(400, "TEMPLATE_UPDATE_FAILED", "Falha ao atualizar template.", error);

  await writeAuditLog({ action: "update", table: TABLE, pk: id, actor, oldData: old, newData: data });
  return data as DocumentoTemplateRow;
}

export async function deleteDocumentoTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<void> {
  const { supabase, actor, id } = input;
  const { data: old, error: readError } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (readError) throw new ApiHttpError(400, "TEMPLATE_READ_FAILED", "Falha ao carregar template.", readError);
  if (!old) throw new ApiHttpError(404, "NOT_FOUND", "Template nao encontrado.");

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "TEMPLATE_DELETE_FAILED", "Falha ao remover template.", error);

  await writeAuditLog({ action: "delete", table: TABLE, pk: id, actor, oldData: old });
}
