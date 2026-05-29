"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { Database } from "@/lib/supabase/database.types";

type RunRow = Database["public"]["Tables"]["editor_flow_runs"]["Row"];

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
    const err = new Error(message) as Error & { code?: string; status: number };
    err.code = body?.error?.code;
    err.status = response.status;
    throw err;
  }
  if (!body || body.data === undefined) {
    throw new Error("Resposta sem dados.");
  }
  return body.data;
}

export type EditorFlowRun = RunRow;

export type UseEditorFlowRunsResult = {
  runs: EditorFlowRun[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  start: (flowId: string) => Promise<EditorFlowRun>;
  patch: (
    id: string,
    patch: {
      lock_token: string;
      status?: string;
      current_node_id?: string | null;
      context?: Record<string, unknown>;
      paused_reason?: string | null;
      error?: string | null;
    }
  ) => Promise<EditorFlowRun>;
  resume: (id: string) => Promise<EditorFlowRun>;
  cancel: (id: string) => Promise<EditorFlowRun>;
};

export function useEditorFlowRuns(requestAuth: RequestAuth, flowId?: string | null): UseEditorFlowRunsResult {
  const [runs, setRuns] = useState<EditorFlowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = flowId
        ? `/api/v1/editor-flow-runs?flow_id=${encodeURIComponent(flowId)}`
        : "/api/v1/editor-flow-runs";
      const data = await api<EditorFlowRun[]>(url, requestAuth, { method: "GET" });
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar runs.");
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [flowId, requestAuth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = useCallback(
    async (fid: string) => {
      const created = await api<EditorFlowRun>("/api/v1/editor-flow-runs", requestAuth, {
        method: "POST",
        body: JSON.stringify({ flow_id: fid })
      });
      setRuns((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      return created;
    },
    [requestAuth]
  );

  const patch = useCallback(
    async (
      id: string,
      patchBody: {
        lock_token: string;
        status?: string;
        current_node_id?: string | null;
        context?: Record<string, unknown>;
        paused_reason?: string | null;
        error?: string | null;
      }
    ) => {
      const updated = await api<EditorFlowRun>(`/api/v1/editor-flow-runs/${id}`, requestAuth, {
        method: "PATCH",
        body: JSON.stringify(patchBody)
      });
      setRuns((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    },
    [requestAuth]
  );

  const cancel = useCallback(
    async (id: string) => {
      const updated = await api<EditorFlowRun>(`/api/v1/editor-flow-runs/${id}/cancel`, requestAuth, {
        method: "POST"
      });
      setRuns((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    },
    [requestAuth]
  );

  const resume = useCallback(
    async (id: string) => {
      const updated = await api<EditorFlowRun>(`/api/v1/editor-flow-runs/${id}/resume`, requestAuth, {
        method: "POST"
      });
      setRuns((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    },
    [requestAuth]
  );

  return { runs, loading, error, refresh, start, patch, resume, cancel };
}

/**
 * Renova periodicamente o lock de uma run via /heartbeat enquanto o componente
 * estiver montado. Para imediatamente se o run terminar (status terminal) ou o
 * lockToken mudar.
 */
export function useFlowRunHeartbeat(
  requestAuth: RequestAuth,
  runId: string | null,
  lockToken: string | null
) {
  const stopRef = useRef(false);

  useEffect(() => {
    stopRef.current = false;
    if (!runId || !lockToken) return;

    const tick = async () => {
      if (stopRef.current) return;
      try {
        await api<EditorFlowRun>(`/api/v1/editor-flow-runs/${runId}/heartbeat`, requestAuth, {
          method: "POST",
          body: JSON.stringify({ lock_token: lockToken })
        });
      } catch {
        // Lock perdido: encerra o heartbeat. UI vai detectar via /GET no proximo refresh.
        stopRef.current = true;
      }
    };

    // Tick inicial + intervalo de 10s.
    void tick();
    const interval = setInterval(tick, 10_000);
    return () => {
      stopRef.current = true;
      clearInterval(interval);
    };
  }, [requestAuth, runId, lockToken]);
}
