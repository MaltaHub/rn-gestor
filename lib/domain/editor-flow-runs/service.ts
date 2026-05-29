import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Row } from "@/lib/domain/db";
import type {
  FlowRunHeartbeatInput,
  FlowRunPatchInput
} from "@/lib/domain/editor-flow-runs/schemas";

type DomainSupabase = SupabaseClient<Database>;
export type EditorFlowRunRow = Row<"editor_flow_runs">;

/** Lock TTL: 30s. Heartbeat (cliente) renova a cada 10s. */
export const LOCK_TTL_SECONDS = 30;

function requireAuthUserId(actor: ActorContext): string {
  if (!actor.authUserId) {
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Sessao sem identidade auth.users.");
  }
  return actor.authUserId;
}

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback bem-defensivo; nao deveria rodar em ambiente Node moderno.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function lockExpiry(): string {
  return new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString();
}

// --- LIST / GET ---

export async function listFlowRuns(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  flowId?: string | null;
  statuses?: string[];
}): Promise<EditorFlowRunRow[]> {
  const userId = requireAuthUserId(input.actor);

  let query = input.supabase
    .from("editor_flow_runs")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });

  if (input.flowId?.trim()) query = query.eq("flow_id", input.flowId.trim());
  if (input.statuses && input.statuses.length > 0) {
    query = query.in("status", input.statuses);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiHttpError(500, "FLOW_RUNS_LIST_FAILED", "Falha ao listar runs.", error);
  }
  return data ?? [];
}

export async function getFlowRun(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<EditorFlowRunRow> {
  const userId = requireAuthUserId(input.actor);

  const { data, error } = await input.supabase
    .from("editor_flow_runs")
    .select("*")
    .eq("id", input.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FLOW_RUN_READ_FAILED", "Falha ao carregar run.", error);
  }
  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Run nao encontrada.");
  }
  return data;
}

// --- START ---

export async function startFlowRun(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  flowId: string;
}): Promise<EditorFlowRunRow> {
  const userId = requireAuthUserId(input.actor);

  // Snapshot do graph atual do flow.
  const { data: flowRow, error: flowError } = await input.supabase
    .from("editor_flows")
    .select("graph")
    .eq("id", input.flowId)
    .maybeSingle();

  if (flowError) {
    throw new ApiHttpError(500, "FLOW_READ_FAILED", "Falha ao carregar fluxo.", flowError);
  }
  if (!flowRow) {
    throw new ApiHttpError(404, "NOT_FOUND", "Fluxo nao encontrado.");
  }

  const lockToken = generateUuid();
  const contextWithSnapshot: Record<string, unknown> = {
    graph_snapshot: flowRow.graph,
    stack_frames: [],
    logs: []
  };

  const { data, error } = await input.supabase
    .from("editor_flow_runs")
    .insert({
      flow_id: input.flowId,
      user_id: userId,
      status: "running",
      context: contextWithSnapshot as unknown as Json,
      lock_token: lockToken,
      locked_until: lockExpiry()
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiHttpError(
        409,
        "RUN_ALREADY_ACTIVE",
        "Voce ja tem uma run ativa para este fluxo. Cancele a anterior ou aguarde finalizar.",
        error
      );
    }
    throw new ApiHttpError(400, "FLOW_RUN_CREATE_FAILED", "Falha ao criar run.", error);
  }
  return data;
}

// --- LOCK helpers ---

async function validateLockOrFail(
  supabase: DomainSupabase,
  runId: string,
  userId: string,
  lockToken: string
): Promise<EditorFlowRunRow> {
  const { data, error } = await supabase
    .from("editor_flow_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new ApiHttpError(500, "FLOW_RUN_READ_FAILED", "Falha ao validar lock.", error);
  }
  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Run nao encontrada.");
  }
  if (data.lock_token !== lockToken) {
    throw new ApiHttpError(423, "RUN_LOCKED", "Lock token invalido ou expirado.", { lock_token: data.lock_token });
  }
  if (!data.locked_until || new Date(data.locked_until).getTime() < Date.now()) {
    throw new ApiHttpError(423, "RUN_LOCKED", "Lock expirado. Solicite reaquisicao.");
  }
  return data;
}

// --- HEARTBEAT ---

export async function heartbeatFlowRun(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: FlowRunHeartbeatInput;
}): Promise<EditorFlowRunRow> {
  const userId = requireAuthUserId(input.actor);
  await validateLockOrFail(input.supabase, input.id, userId, input.patch.lock_token);

  const { data, error } = await input.supabase
    .from("editor_flow_runs")
    .update({ locked_until: lockExpiry() })
    .eq("id", input.id)
    .eq("user_id", userId)
    .eq("lock_token", input.patch.lock_token)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new ApiHttpError(423, "RUN_LOCKED", "Falha ao renovar lock.", error ?? undefined);
  }
  return data;
}

// --- PATCH (apply state update) ---

export async function patchFlowRun(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: FlowRunPatchInput;
}): Promise<EditorFlowRunRow> {
  const userId = requireAuthUserId(input.actor);
  await validateLockOrFail(input.supabase, input.id, userId, input.patch.lock_token);

  const updates: Partial<{
    status: string;
    current_node_id: string | null;
    context: Json;
    paused_reason: string | null;
    error: string | null;
    completed_at: string | null;
    lock_token: string | null;
    locked_until: string | null;
  }> = {};
  if (input.patch.status !== undefined) {
    updates.status = input.patch.status;
    if (["completed", "failed", "cancelled"].includes(input.patch.status)) {
      updates.completed_at = new Date().toISOString();
      updates.lock_token = null;
      updates.locked_until = null;
    } else if (["paused_at_tag", "paused_awaiting_form"].includes(input.patch.status)) {
      // Em pause libera o lock — outro client pode reclamar via /resume.
      updates.lock_token = null;
      updates.locked_until = null;
    }
  }
  if (input.patch.current_node_id !== undefined) updates.current_node_id = input.patch.current_node_id;
  if (input.patch.context !== undefined) updates.context = input.patch.context as unknown as Json;
  if (input.patch.paused_reason !== undefined) updates.paused_reason = input.patch.paused_reason;
  if (input.patch.error !== undefined) updates.error = input.patch.error;

  const { data, error } = await input.supabase
    .from("editor_flow_runs")
    .update(updates)
    .eq("id", input.id)
    .eq("user_id", userId)
    .eq("lock_token", input.patch.lock_token)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(400, "FLOW_RUN_UPDATE_FAILED", "Falha ao atualizar run.", error);
  }
  if (!data) {
    throw new ApiHttpError(423, "RUN_LOCKED", "Lock perdido durante o update.");
  }
  return data;
}

// --- CLAIM (resume) ---

/**
 * Reclama uma run em pause: gera novo lock_token + locked_until e marca como
 * running. Falha com RUN_LOCKED se a run estiver locked por outro client e o
 * lock ainda nao tiver expirado.
 */
export async function claimFlowRun(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<EditorFlowRunRow> {
  const userId = requireAuthUserId(input.actor);

  const { data: existing, error: readError } = await input.supabase
    .from("editor_flow_runs")
    .select("*")
    .eq("id", input.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw new ApiHttpError(500, "FLOW_RUN_READ_FAILED", "Falha ao ler run.", readError);
  }
  if (!existing) {
    throw new ApiHttpError(404, "NOT_FOUND", "Run nao encontrada.");
  }

  if (!["paused_at_tag", "paused_awaiting_form"].includes(existing.status)) {
    throw new ApiHttpError(409, "RUN_NOT_PAUSED", `Run nao esta pausada (status=${existing.status}).`);
  }

  // Se outro lock ainda esta vivo, recusa.
  if (existing.lock_token && existing.locked_until && new Date(existing.locked_until).getTime() > Date.now()) {
    throw new ApiHttpError(423, "RUN_LOCKED", "Run esta locada por outro client. Aguarde expirar.");
  }

  const newToken = generateUuid();
  const { data, error } = await input.supabase
    .from("editor_flow_runs")
    .update({
      status: "running",
      lock_token: newToken,
      locked_until: lockExpiry()
    })
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(400, "FLOW_RUN_CLAIM_FAILED", "Falha ao reclamar run.", error);
  }
  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Run nao encontrada.");
  }
  return data;
}

// --- CANCEL ---

export async function cancelFlowRun(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<EditorFlowRunRow> {
  const userId = requireAuthUserId(input.actor);

  const { data, error } = await input.supabase
    .from("editor_flow_runs")
    .update({
      status: "cancelled",
      lock_token: null,
      locked_until: null,
      completed_at: new Date().toISOString()
    })
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(400, "FLOW_RUN_CANCEL_FAILED", "Falha ao cancelar run.", error);
  }
  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Run nao encontrada.");
  }
  return data;
}
