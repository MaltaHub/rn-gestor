"use client";

import type { JSONContent } from "@tiptap/core";
import { parseEnvelope } from "@/lib/api/http-client";
import { fetchAuthed } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import type { VendaDocumentoRow, DocumentoTemplateRow } from "@/lib/domain/db";

export type VendaDocumentoResumo = Omit<VendaDocumentoRow, "conteudo" | "created_by_user_id">;

export async function fetchVendaDocContext(auth: RequestAuth, vendaId: string): Promise<VendaDocContext> {
  const res = await fetchAuthed(`/api/v1/venda-documentos/contexto?venda_id=${encodeURIComponent(vendaId)}`, auth, { cache: "no-store" });
  return parseEnvelope<VendaDocContext>(res);
}

/** Documentos de uma venda COM o conteúdo (miniaturas) — uma requisição só. */
export async function fetchDocumentosVenda(auth: RequestAuth, vendaId: string): Promise<VendaDocumentoRow[]> {
  const res = await fetchAuthed(`/api/v1/venda-documentos?venda_id=${encodeURIComponent(vendaId)}`, auth, { cache: "no-store" });
  return parseEnvelope<VendaDocumentoRow[]>(res);
}

export async function fetchDocumento(auth: RequestAuth, id: string): Promise<VendaDocumentoRow> {
  const res = await fetchAuthed(`/api/v1/venda-documentos/${encodeURIComponent(id)}`, auth, { cache: "no-store" });
  return parseEnvelope<VendaDocumentoRow>(res);
}

export async function createDocumento(
  auth: RequestAuth,
  payload: { venda_id: string; titulo: string; conteudo: JSONContent; categoria: CategoriaDocumento | null; template_id?: string | null }
): Promise<VendaDocumentoRow> {
  const res = await fetchAuthed("/api/v1/venda-documentos", auth, { method: "POST", body: JSON.stringify(payload) });
  return parseEnvelope<VendaDocumentoRow>(res);
}

export async function updateDocumento(
  auth: RequestAuth,
  id: string,
  patch: { titulo?: string; conteudo?: JSONContent; categoria?: CategoriaDocumento | null }
): Promise<VendaDocumentoRow> {
  const res = await fetchAuthed(`/api/v1/venda-documentos/${encodeURIComponent(id)}`, auth, { method: "PATCH", body: JSON.stringify(patch) });
  return parseEnvelope<VendaDocumentoRow>(res);
}

export async function deleteDocumento(auth: RequestAuth, id: string): Promise<void> {
  const res = await fetchAuthed(`/api/v1/venda-documentos/${encodeURIComponent(id)}`, auth, { method: "DELETE" });
  await parseEnvelope<{ deleted: boolean }>(res);
}

// Templates mudam raramente: a lista fica na memória da aba e é revalidada por trás.
let templatesCache: { ativos: DocumentoTemplateRow[]; em: number } | null = null;
const TEMPLATES_TTL_MS = 60_000;

export async function fetchTemplates(auth: RequestAuth, includeInactive = false): Promise<DocumentoTemplateRow[]> {
  if (!includeInactive && templatesCache && Date.now() - templatesCache.em < TEMPLATES_TTL_MS) return templatesCache.ativos;
  const qs = includeInactive ? "?include_inactive=true" : "";
  const res = await fetchAuthed(`/api/v1/documento-templates${qs}`, auth, { cache: "no-store" });
  const rows = await parseEnvelope<DocumentoTemplateRow[]>(res);
  if (!includeInactive) templatesCache = { ativos: rows, em: Date.now() };
  return rows;
}

export function invalidarTemplates() {
  templatesCache = null;
}

type TemplatePayload = {
  titulo: string;
  descricao?: string | null;
  categoria?: CategoriaDocumento | null;
  conteudo: JSONContent;
  is_active?: boolean;
};

export async function createTemplate(auth: RequestAuth, payload: TemplatePayload): Promise<DocumentoTemplateRow> {
  invalidarTemplates();
  const res = await fetchAuthed("/api/v1/documento-templates", auth, { method: "POST", body: JSON.stringify(payload) });
  return parseEnvelope<DocumentoTemplateRow>(res);
}

export async function updateTemplate(auth: RequestAuth, id: string, patch: Partial<TemplatePayload>): Promise<DocumentoTemplateRow> {
  invalidarTemplates();
  const res = await fetchAuthed(`/api/v1/documento-templates/${encodeURIComponent(id)}`, auth, { method: "PATCH", body: JSON.stringify(patch) });
  return parseEnvelope<DocumentoTemplateRow>(res);
}

export async function deleteTemplate(auth: RequestAuth, id: string): Promise<void> {
  invalidarTemplates();
  const res = await fetchAuthed(`/api/v1/documento-templates/${encodeURIComponent(id)}`, auth, { method: "DELETE" });
  await parseEnvelope<{ deleted: boolean }>(res);
}
