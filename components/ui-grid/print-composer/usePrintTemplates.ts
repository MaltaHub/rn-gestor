"use client";

import { useCallback, useEffect, useState } from "react";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type {
  PrintTemplate,
  PrintTemplatePersistInput,
  PrintTemplateUpdateInput
} from "@/components/ui-grid/print-composer/types";
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

export type UsePrintTemplatesResult = {
  templates: PrintTemplate[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: PrintTemplatePersistInput) => Promise<PrintTemplate>;
  update: (id: string, patch: PrintTemplateUpdateInput) => Promise<PrintTemplate>;
  remove: (id: string) => Promise<void>;
};

export function usePrintTemplates(sheetKey: SheetKey, requestAuth: RequestAuth): UsePrintTemplatesResult {
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<PrintTemplate[]>(
        `/api/v1/print-templates?sheet=${encodeURIComponent(sheetKey)}`,
        requestAuth,
        { method: "GET" }
      );
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar templates.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [sheetKey, requestAuth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: PrintTemplatePersistInput) => {
      const created = await api<PrintTemplate>("/api/v1/print-templates", requestAuth, {
        method: "POST",
        body: JSON.stringify(input)
      });
      setTemplates((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      return created;
    },
    [requestAuth]
  );

  const update = useCallback(
    async (id: string, patch: PrintTemplateUpdateInput) => {
      const updated = await api<PrintTemplate>(`/api/v1/print-templates/${id}`, requestAuth, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setTemplates((prev) => {
        const next = prev.filter((item) => item.id !== updated.id);
        return [updated, ...next];
      });
      return updated;
    },
    [requestAuth]
  );

  const remove = useCallback(
    async (id: string) => {
      await api<{ deleted: boolean; id: string }>(`/api/v1/print-templates/${id}`, requestAuth, {
        method: "DELETE"
      });
      setTemplates((prev) => prev.filter((item) => item.id !== id));
    },
    [requestAuth]
  );

  return { templates, loading, error, refresh, create, update, remove };
}
