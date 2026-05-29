"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { Database } from "@/lib/supabase/database.types";

type RunRow = Database["public"]["Tables"]["editor_flow_runs"]["Row"];

const POLL_INTERVAL_MS = 5_000;

type ApiEnvelope<T> = { data?: T; error?: { message?: string; code?: string } };

async function getJson<T>(input: string, requestAuth: RequestAuth): Promise<T> {
  const response = await fetch(input, { headers: buildRequestHeaders(requestAuth) });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
  if (!body || body.data === undefined) {
    throw new Error("Resposta sem dados.");
  }
  return body.data;
}

/**
 * Polling 5s pra detectar runs pausadas do usuario atual.
 *
 * O polling busca paused_at_tag E paused_awaiting_form (Fase 7) — o caller
 * filtra por sheet_key se quiser apenas mostrar runs relevantes na aba ativa.
 */
export function usePausedFlowRuns(requestAuth: RequestAuth): {
  runs: RunRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJson<RunRow[]>(
        "/api/v1/editor-flow-runs?status=paused_at_tag&status=paused_awaiting_form",
        requestAuth
      );
      setRuns(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar runs pausadas.");
    } finally {
      setLoading(false);
    }
  }, [requestAuth]);

  useEffect(() => {
    stopRef.current = false;
    void refresh();
    const interval = setInterval(() => {
      if (stopRef.current) return;
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      stopRef.current = true;
      clearInterval(interval);
    };
  }, [refresh]);

  return { runs, loading, error, refresh };
}
