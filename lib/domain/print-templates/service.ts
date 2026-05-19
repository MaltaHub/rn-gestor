import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Row } from "@/lib/domain/db";
import type {
  PrintTemplateCreateInput,
  PrintTemplateUpdateInput
} from "@/lib/domain/print-templates/schemas";

type DomainSupabase = SupabaseClient<Database>;
export type PrintTemplateRow = Row<"print_templates">;

function requireAuthUserId(actor: ActorContext): string {
  if (!actor.authUserId) {
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Sessao sem identidade auth.users.");
  }
  return actor.authUserId;
}

export async function listPrintTemplates(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  sheetKey?: string | null;
}): Promise<PrintTemplateRow[]> {
  const userId = requireAuthUserId(input.actor);

  let query = input.supabase
    .from("print_templates")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (input.sheetKey?.trim()) {
    query = query.eq("sheet_key", input.sheetKey.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiHttpError(500, "PRINT_TEMPLATES_LIST_FAILED", "Falha ao listar templates de impressao.", error);
  }
  return data ?? [];
}

export async function createPrintTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: PrintTemplateCreateInput;
}): Promise<PrintTemplateRow> {
  const userId = requireAuthUserId(input.actor);

  const { data, error } = await input.supabase
    .from("print_templates")
    .insert({
      user_id: userId,
      sheet_key: input.row.sheet_key,
      title: input.row.title,
      config: input.row.config as unknown as Json,
      anchor_filter: (input.row.anchor_filter ?? null) as unknown as Json | null
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(
        409,
        "PRINT_TEMPLATE_TITLE_TAKEN",
        "Ja existe um template com este titulo nesta aba.",
        error
      );
    }
    throw new ApiHttpError(400, "PRINT_TEMPLATE_CREATE_FAILED", "Falha ao criar template de impressao.", error);
  }
  return data;
}

export async function updatePrintTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: PrintTemplateUpdateInput;
}): Promise<PrintTemplateRow> {
  const userId = requireAuthUserId(input.actor);

  const patch: Partial<{
    title: string;
    config: Json;
    anchor_filter: Json | null;
  }> = {};
  if (input.patch.title !== undefined) patch.title = input.patch.title;
  if (input.patch.config !== undefined) patch.config = input.patch.config as unknown as Json;
  if (input.patch.anchor_filter !== undefined) {
    patch.anchor_filter = (input.patch.anchor_filter ?? null) as unknown as Json | null;
  }

  const { data, error } = await input.supabase
    .from("print_templates")
    .update(patch)
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(
        409,
        "PRINT_TEMPLATE_TITLE_TAKEN",
        "Ja existe um template com este titulo nesta aba.",
        error
      );
    }
    throw new ApiHttpError(400, "PRINT_TEMPLATE_UPDATE_FAILED", "Falha ao atualizar template de impressao.", error);
  }
  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Template de impressao nao encontrado.");
  }
  return data;
}

export async function deletePrintTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<void> {
  const userId = requireAuthUserId(input.actor);

  const { error, count } = await input.supabase
    .from("print_templates")
    .delete({ count: "exact" })
    .eq("id", input.id)
    .eq("user_id", userId);

  if (error) {
    throw new ApiHttpError(400, "PRINT_TEMPLATE_DELETE_FAILED", "Falha ao excluir template de impressao.", error);
  }
  if (!count) {
    throw new ApiHttpError(404, "NOT_FOUND", "Template de impressao nao encontrado.");
  }
}
