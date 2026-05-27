import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Row } from "@/lib/domain/db";
import type { UpsertVariableInput, BatchUpsertInput } from "./schemas";
import { SYSTEM_NAMESPACE } from "./schemas";

type DomainSupabase = SupabaseClient<Database>;
export type EditorUserVariableRow = Row<"editor_user_variables">;

function requireAuthUserId(actor: ActorContext): string {
  if (!actor.authUserId) {
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Sessao sem identidade auth.users.");
  }
  return actor.authUserId;
}

function rejectSystemName(name: string): void {
  if (name.toLowerCase().startsWith(SYSTEM_NAMESPACE)) {
    throw new ApiHttpError(
      400,
      "INVALID_VALUE",
      `Nomes com prefixo '${SYSTEM_NAMESPACE}' sao reservados pra variaveis de sistema (read-only).`
    );
  }
}

export async function listVariablesForUser(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
}): Promise<EditorUserVariableRow[]> {
  const userId = requireAuthUserId(input.actor);
  const { data, error } = await input.supabase
    .from("editor_user_variables")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    throw new ApiHttpError(
      500,
      "EDITOR_USER_VARIABLES_LIST_FAILED",
      "Falha ao listar variaveis do editor.",
      error
    );
  }
  return data ?? [];
}

export async function upsertVariable(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: UpsertVariableInput;
}): Promise<EditorUserVariableRow> {
  const userId = requireAuthUserId(input.actor);
  rejectSystemName(input.row.name);

  const { data, error } = await input.supabase
    .from("editor_user_variables")
    .upsert(
      {
        user_id: userId,
        name: input.row.name,
        value: input.row.value as unknown as Json,
        type: input.row.type ?? "value"
      },
      { onConflict: "user_id,name" }
    )
    .select("*")
    .single();

  if (error) {
    throw new ApiHttpError(
      400,
      "EDITOR_USER_VARIABLE_UPSERT_FAILED",
      "Falha ao gravar variavel do editor.",
      error
    );
  }
  return data;
}

export async function upsertVariableBatch(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  payload: BatchUpsertInput;
}): Promise<EditorUserVariableRow[]> {
  const userId = requireAuthUserId(input.actor);

  for (const item of input.payload.items) {
    rejectSystemName(item.name);
  }

  const rows = input.payload.items.map((item) => ({
    user_id: userId,
    name: item.name,
    value: item.value as unknown as Json,
    type: item.type ?? "value"
  }));

  const { data, error } = await input.supabase
    .from("editor_user_variables")
    .upsert(rows, { onConflict: "user_id,name" })
    .select("*");

  if (error) {
    throw new ApiHttpError(
      400,
      "EDITOR_USER_VARIABLES_BATCH_UPSERT_FAILED",
      "Falha ao gravar lote de variaveis do editor.",
      error
    );
  }
  return data ?? [];
}

export async function deleteVariable(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  name: string;
}): Promise<void> {
  const userId = requireAuthUserId(input.actor);
  rejectSystemName(input.name);

  const { error, count } = await input.supabase
    .from("editor_user_variables")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("name", input.name);

  if (error) {
    throw new ApiHttpError(
      400,
      "EDITOR_USER_VARIABLE_DELETE_FAILED",
      "Falha ao excluir variavel do editor.",
      error
    );
  }
  if (!count) {
    throw new ApiHttpError(404, "NOT_FOUND", "Variavel do editor nao encontrada.");
  }
}
