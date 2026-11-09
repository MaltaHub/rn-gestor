import type { SupabaseClient } from "@supabase/supabase-js";
import { describeAudit } from "@/lib/api/audit-context";
import { ApiHttpError } from "@/lib/api/errors";
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
  let query = supabase.from(TABLE).select("*").order("categoria", { ascending: true, nullsFirst: false }).order("titulo", { ascending: true });
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
    categoria: row.categoria ?? null,
    conteudo: row.conteudo as Json,
    is_active: row.is_active ?? true,
    created_by_user_id: actor.authUserId,
    updated_by_user_id: actor.authUserId
  };

  describeAudit(`Template "${row.titulo}" criado.`);
  const { data, error } = await supabase.from(TABLE).insert(payload).select("*").single();
  if (error) throw new ApiHttpError(400, "TEMPLATE_CREATE_FAILED", "Falha ao criar template.", error);

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
  if (patch.categoria !== undefined) updates.categoria = patch.categoria;
  if (patch.conteudo !== undefined) updates.conteudo = patch.conteudo as Json;
  if (patch.is_active !== undefined) updates.is_active = patch.is_active;

  describeAudit(`Template "${old.titulo}" alterado.`);
  const { data, error } = await supabase.from(TABLE).update(updates).eq("id", id).select("*").single();
  if (error) throw new ApiHttpError(400, "TEMPLATE_UPDATE_FAILED", "Falha ao atualizar template.", error);

  return data as DocumentoTemplateRow;
}

export async function deleteDocumentoTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<void> {
  const { supabase, id } = input;
  const { data: old, error: readError } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (readError) throw new ApiHttpError(400, "TEMPLATE_READ_FAILED", "Falha ao carregar template.", readError);
  if (!old) throw new ApiHttpError(404, "NOT_FOUND", "Template nao encontrado.");

  describeAudit(`Template "${old.titulo}" excluído.`);
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "TEMPLATE_DELETE_FAILED", "Falha ao remover template.", error);
}
