"use client";

import { useCallback } from "react";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { RuntimeValue } from "@/lib/domain/editor-flows/runtime/types";

type VarRow = Database["public"]["Tables"]["editor_user_variables"]["Row"];

type ApiEnvelope<T> = { data?: T; error?: { message?: string; code?: string } };

async function api<T>(input: RequestInfo, requestAuth: RequestAuth, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...buildRequestHeaders(requestAuth),
      ...(init?.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    const message = body?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!body || body.data === undefined) {
    throw new Error("Resposta sem dados.");
  }
  return body.data;
}

/**
 * Converte um RuntimeValue do interpreter pra forma serializavel pra batch upsert.
 * Mantemos so a "payload" do kind, dropando o discriminador kind — o consumidor
 * (Get) reconstrui kind ao ler.
 */
function runtimeValueToWireValue(value: RuntimeValue): Json {
  switch (value.kind) {
    case "boolean":
      return value.value;
    case "number":
      return value.value;
    case "string":
      return value.value;
    case "row":
      return value.data as unknown as Json;
    case "rowList":
      return value.rows as unknown as Json;
    case "value":
      return (value.raw ?? null) as Json;
    case "void":
      return null;
  }
}

/**
 * Reconstroi um RuntimeValue a partir do valor jsonb do banco. Heuristica:
 *   - boolean/number/string → kind correspondente.
 *   - array de objetos → rowList.
 *   - objeto → row.
 *   - null/undefined → value:null.
 *   - outros → value:raw.
 */
function wireValueToRuntimeValue(raw: Json | null | undefined): RuntimeValue {
  if (raw === null || raw === undefined) return { kind: "value", raw: null };
  if (typeof raw === "boolean") return { kind: "boolean", value: raw };
  if (typeof raw === "number") return { kind: "number", value: raw };
  if (typeof raw === "string") return { kind: "string", value: raw };
  if (Array.isArray(raw)) {
    const rows = raw.filter(
      (item) => !!item && typeof item === "object" && !Array.isArray(item)
    ) as unknown as Array<Record<string, unknown>>;
    return { kind: "rowList", rows };
  }
  if (typeof raw === "object") {
    return { kind: "row", data: raw as unknown as Record<string, unknown> };
  }
  return { kind: "value", raw };
}

export type EditorUserVariableRow = VarRow;

export type UseEditorUserVariablesResult = {
  list: () => Promise<EditorUserVariableRow[]>;
  /**
   * Carrega todas as variaveis do user e devolve um Record name → RuntimeValue
   * pronto pra injetar em `new FlowInterpreter(..., { userVariables })`.
   */
  loadAsRuntimeMap: () => Promise<Record<string, RuntimeValue>>;
  /**
   * Persiste em batch as variaveis mutadas durante uma run. Recebe a saida de
   * `interpreter.getMutatedVariables()`.
   */
  batchUpsert: (items: Array<{ name: string; value: RuntimeValue }>) => Promise<void>;
  deleteOne: (name: string) => Promise<void>;
};

export function useEditorUserVariables(requestAuth: RequestAuth): UseEditorUserVariablesResult {
  const list = useCallback(async () => {
    return api<EditorUserVariableRow[]>("/api/v1/editor-variables", requestAuth, { method: "GET" });
  }, [requestAuth]);

  const loadAsRuntimeMap = useCallback(async () => {
    const rows = await list();
    const out: Record<string, RuntimeValue> = {};
    for (const row of rows) {
      out[row.name] = wireValueToRuntimeValue(row.value as Json);
    }
    return out;
  }, [list]);

  const batchUpsert = useCallback(
    async (items: Array<{ name: string; value: RuntimeValue }>) => {
      if (items.length === 0) return;
      const payload = {
        items: items.map((it) => ({
          name: it.name,
          value: runtimeValueToWireValue(it.value)
        }))
      };
      await api<EditorUserVariableRow[]>("/api/v1/editor-variables/batch-upsert", requestAuth, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    [requestAuth]
  );

  const deleteOne = useCallback(
    async (name: string) => {
      await api<{ deleted: boolean }>(
        `/api/v1/editor-variables/${encodeURIComponent(name)}`,
        requestAuth,
        { method: "DELETE" }
      );
    },
    [requestAuth]
  );

  return { list, loadAsRuntimeMap, batchUpsert, deleteOne };
}
