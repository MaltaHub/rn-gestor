"use client";

import { useCallback, useEffect, useState } from "react";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type {
  EditorFlow,
  EditorFlowPersistInput,
  EditorFlowUpdateInput
} from "@/components/editor/types";
import type { RequestAuth, SheetKey } from "@/components/ui-grid/types";

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

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

export type UseEditorFlowsResult = {
  flows: EditorFlow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: EditorFlowPersistInput) => Promise<EditorFlow>;
  update: (id: string, patch: EditorFlowUpdateInput) => Promise<EditorFlow>;
  remove: (id: string) => Promise<void>;
};

export function useEditorFlows(requestAuth: RequestAuth, sheetKey?: SheetKey | null): UseEditorFlowsResult {
  const [flows, setFlows] = useState<EditorFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = sheetKey
        ? `/api/v1/editor-flows?sheet=${encodeURIComponent(sheetKey)}`
        : "/api/v1/editor-flows";
      const data = await api<EditorFlow[]>(url, requestAuth, { method: "GET" });
      setFlows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar fluxos.");
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }, [sheetKey, requestAuth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: EditorFlowPersistInput) => {
      const created = await api<EditorFlow>("/api/v1/editor-flows", requestAuth, {
        method: "POST",
        body: JSON.stringify(input)
      });
      setFlows((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      return created;
    },
    [requestAuth]
  );

  const update = useCallback(
    async (id: string, patch: EditorFlowUpdateInput) => {
      const updated = await api<EditorFlow>(`/api/v1/editor-flows/${id}`, requestAuth, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setFlows((prev) => {
        const next = prev.filter((item) => item.id !== updated.id);
        return [updated, ...next];
      });
      return updated;
    },
    [requestAuth]
  );

  const remove = useCallback(
    async (id: string) => {
      await api<{ deleted: boolean; id: string }>(`/api/v1/editor-flows/${id}`, requestAuth, {
        method: "DELETE"
      });
      setFlows((prev) => prev.filter((item) => item.id !== id));
    },
    [requestAuth]
  );

  return { flows, loading, error, refresh, create, update, remove };
}
