import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";
import { requireRole } from "@/lib/api/auth";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Row } from "@/lib/domain/db";
import type {
  EditorFlowCreateInput,
  EditorFlowUpdateInput,
  FlowFromTemplateInput
} from "@/lib/domain/editor-flows/schemas";

type DomainSupabase = SupabaseClient<Database>;
export type EditorFlowRow = Row<"editor_flows">;

function requireAuthUserId(actor: ActorContext): string {
  if (!actor.authUserId) {
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Sessao sem identidade auth.users.");
  }
  return actor.authUserId;
}

export async function listEditorFlows(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  sheetKey?: string | null;
}): Promise<EditorFlowRow[]> {
  // Leitura aberta a qualquer autenticado: flows sao da org.
  requireAuthUserId(input.actor);

  let query = input.supabase
    .from("editor_flows")
    .select("*")
    .order("updated_at", { ascending: false });

  if (input.sheetKey?.trim()) {
    query = query.eq("sheet_key", input.sheetKey.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiHttpError(500, "EDITOR_FLOWS_LIST_FAILED", "Falha ao listar fluxos.", error);
  }
  return data ?? [];
}

export async function getEditorFlow(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<EditorFlowRow> {
  requireAuthUserId(input.actor);

  const { data, error } = await input.supabase
    .from("editor_flows")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "EDITOR_FLOW_READ_FAILED", "Falha ao carregar fluxo.", error);
  }
  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Fluxo nao encontrado.");
  }
  return data;
}

export async function createEditorFlow(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: EditorFlowCreateInput;
}): Promise<EditorFlowRow> {
  const userId = requireAuthUserId(input.actor);
  requireRole(input.actor, "GERENTE");

  const { data, error } = await input.supabase
    .from("editor_flows")
    .insert({
      title: input.row.title,
      description: input.row.description ?? null,
      sheet_key: input.row.sheet_key ?? null,
      graph: input.row.graph as unknown as Json,
      created_by_user_id: userId
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(409, "EDITOR_FLOW_TITLE_TAKEN", "Ja existe um fluxo com este titulo.", error);
    }
    throw new ApiHttpError(400, "EDITOR_FLOW_CREATE_FAILED", "Falha ao criar fluxo.", error);
  }
  return data;
}

export async function updateEditorFlow(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: EditorFlowUpdateInput;
}): Promise<EditorFlowRow> {
  requireAuthUserId(input.actor);
  requireRole(input.actor, "GERENTE");

  const patch: Partial<{
    title: string;
    description: string | null;
    sheet_key: string | null;
    graph: Json;
  }> = {};
  if (input.patch.title !== undefined) patch.title = input.patch.title;
  if (input.patch.description !== undefined) patch.description = input.patch.description ?? null;
  if (input.patch.sheet_key !== undefined) patch.sheet_key = input.patch.sheet_key ?? null;
  if (input.patch.graph !== undefined) patch.graph = input.patch.graph as unknown as Json;

  const { data, error } = await input.supabase
    .from("editor_flows")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(409, "EDITOR_FLOW_TITLE_TAKEN", "Ja existe um fluxo com este titulo.", error);
    }
    throw new ApiHttpError(400, "EDITOR_FLOW_UPDATE_FAILED", "Falha ao atualizar fluxo.", error);
  }
  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Fluxo nao encontrado.");
  }
  return data;
}

/**
 * Bridge V1 -> V3: monta um graph a partir de um template (bulk-select) e cria
 * o flow. Exige GERENTE+ (mesma gate do createEditorFlow).
 */
export async function createEditorFlowFromTemplate(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  payload: FlowFromTemplateInput;
}): Promise<EditorFlowRow> {
  const { payload } = input;

  switch (payload.type) {
    case "bulk-select": {
      const matchColumn = payload.match_column ?? "placa";
      const title =
        payload.title ?? `Bulk-select ${payload.sheet_key} (${payload.tokens.length} ${matchColumn})`;
      const tokensText = payload.tokens.join("\n");
      const graph = {
        nodes: [
          {
            id: "src",
            type: "BulkSelectSource",
            position: { x: 100, y: 100 },
            config: {
              sheet_key: payload.sheet_key,
              match_column: matchColumn,
              tokens: tokensText
            }
          },
          {
            id: "tag",
            type: "TagSelecionar",
            position: { x: 420, y: 100 },
            config: {}
          }
        ],
        edges: [
          {
            id: "edge-src-tag",
            source: "src",
            sourceHandle: "rows",
            target: "tag",
            targetHandle: "rows"
          }
        ],
        viewport: { x: 0, y: 0, zoom: 1 }
      };

      return createEditorFlow({
        supabase: input.supabase,
        actor: input.actor,
        row: {
          title,
          description: `Fluxo gerado a partir da lista de ${matchColumn} do bulk-select.`,
          sheet_key: payload.sheet_key,
          graph: graph as unknown as Record<string, unknown>
        }
      });
    }
  }
}

export async function deleteEditorFlow(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<void> {
  requireAuthUserId(input.actor);
  requireRole(input.actor, "GERENTE");

  const { error, count } = await input.supabase
    .from("editor_flows")
    .delete({ count: "exact" })
    .eq("id", input.id);

  if (error) {
    throw new ApiHttpError(400, "EDITOR_FLOW_DELETE_FAILED", "Falha ao excluir fluxo.", error);
  }
  if (!count) {
    throw new ApiHttpError(404, "NOT_FOUND", "Fluxo nao encontrado.");
  }
}
