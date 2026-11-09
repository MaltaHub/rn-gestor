import { buildAuthHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import { apiFetch, parseEnvelope } from "@/lib/api/http-client";
import type { AuditEntry, AuditMeta, AuditOrigin } from "@/lib/domain/auditoria/service";
import type { AuditAction } from "@/lib/domain/auditoria/changes";

export type AuditFilters = {
  tabela: string;
  acao: "" | AuditAction;
  origem: "" | AuditOrigin;
  autor: string;
  q: string;
  de: string;
  ate: string;
  lote: string;
  pk: string;
};

export const EMPTY_AUDIT_FILTERS: AuditFilters = { tabela: "", acao: "", origem: "", autor: "", q: "", de: "", ate: "", lote: "", pk: "" };

export type AuditPage = { entries: AuditEntry[]; nextCursor: string | null; total: number | null; meta: AuditMeta | null };

export function auditFiltersToParams(filters: AuditFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
  }
  return params;
}

export async function fetchAuditPage(params: {
  requestAuth: RequestAuth;
  filters: AuditFilters;
  cursor?: string | null;
  withMeta?: boolean;
  signal?: AbortSignal;
}): Promise<AuditPage> {
  const query = auditFiltersToParams(params.filters);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.withMeta) query.set("meta", "1");
  const response = await apiFetch(
    `/api/v1/auditoria?${query.toString()}`,
    { cache: "no-store", headers: buildAuthHeaders(params.requestAuth), signal: params.signal },
    { timeoutMs: 30_000 }
  );
  return parseEnvelope<AuditPage>(response);
}
