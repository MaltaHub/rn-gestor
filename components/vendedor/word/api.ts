"use client";

import type { JSONContent } from "@tiptap/core";
import { apiFetch, parseEnvelope } from "@/lib/api/http-client";
import { buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";
import type { ProcessoVeiculo } from "@/lib/domain/venda-documentos/service";
import type { VendaDocumentoRow, DocumentoTemplateRow } from "@/lib/domain/db";

function headers(auth: RequestAuth) {
  return buildRequestHeaders(auth);
}

export async function fetchProcessos(auth: RequestAuth): Promise<ProcessoVeiculo[]> {
  const res = await apiFetch("/api/v1/venda-documentos/processos", {
    cache: "no-store",
    headers: headers(auth)
  });
  return parseEnvelope<ProcessoVeiculo[]>(res);
}

export async function fetchVendaDocContext(auth: RequestAuth, vendaId: string): Promise<VendaDocContext> {
  const res = await apiFetch(`/api/v1/venda-documentos/contexto?venda_id=${encodeURIComponent(vendaId)}`, {
    cache: "no-store",
    headers: headers(auth)
  });
  return parseEnvelope<VendaDocContext>(res);
}

export async function fetchDocumento(auth: RequestAuth, id: string): Promise<VendaDocumentoRow> {
  const res = await apiFetch(`/api/v1/venda-documentos/${id}`, { cache: "no-store", headers: headers(auth) });
  return parseEnvelope<VendaDocumentoRow>(res);
}

export async function createDocumento(
  auth: RequestAuth,
  payload: { venda_id: string; titulo: string; conteudo: JSONContent; template_id?: string | null }
): Promise<VendaDocumentoRow> {
  const res = await apiFetch("/api/v1/venda-documentos", {
    method: "POST",
    headers: headers(auth),
    body: JSON.stringify(payload)
  });
  return parseEnvelope<VendaDocumentoRow>(res);
}

export async function updateDocumento(
  auth: RequestAuth,
  id: string,
  patch: { titulo?: string; conteudo?: JSONContent }
): Promise<VendaDocumentoRow> {
  const res = await apiFetch(`/api/v1/venda-documentos/${id}`, {
    method: "PATCH",
    headers: headers(auth),
    body: JSON.stringify(patch)
  });
  return parseEnvelope<VendaDocumentoRow>(res);
}

export async function deleteDocumento(auth: RequestAuth, id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/venda-documentos/${id}`, { method: "DELETE", headers: headers(auth) });
  await parseEnvelope<{ deleted: boolean }>(res);
}

/** Exclui o processo de venda (= linha em vendas). Cascade apaga os documentos. */
export async function deleteProcesso(auth: RequestAuth, vendaId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/vendas/${vendaId}`, { method: "DELETE", headers: headers(auth) });
  await parseEnvelope<{ deleted: boolean }>(res);
}

/** Marca o processo como finalizado gravando data_entrega = hoje. */
export async function finalizarProcesso(auth: RequestAuth, vendaId: string): Promise<void> {
  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(
    hoje.getDate()
  ).padStart(2, "0")}`;
  const res = await apiFetch(`/api/v1/vendas/${vendaId}`, {
    method: "PATCH",
    headers: headers(auth),
    body: JSON.stringify({ data_entrega: iso })
  });
  await parseEnvelope<unknown>(res);
}

export async function reabrirProcesso(auth: RequestAuth, vendaId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/vendas/${vendaId}`, {
    method: "PATCH",
    headers: headers(auth),
    body: JSON.stringify({ data_entrega: null })
  });
  await parseEnvelope<unknown>(res);
}

export async function fetchTemplates(
  auth: RequestAuth,
  includeInactive = false
): Promise<DocumentoTemplateRow[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  const res = await apiFetch(`/api/v1/documento-templates${qs}`, { cache: "no-store", headers: headers(auth) });
  return parseEnvelope<DocumentoTemplateRow[]>(res);
}

export async function createTemplate(
  auth: RequestAuth,
  payload: { titulo: string; descricao?: string | null; conteudo: JSONContent; is_active?: boolean }
): Promise<DocumentoTemplateRow> {
  const res = await apiFetch("/api/v1/documento-templates", {
    method: "POST",
    headers: headers(auth),
    body: JSON.stringify(payload)
  });
  return parseEnvelope<DocumentoTemplateRow>(res);
}

export async function updateTemplate(
  auth: RequestAuth,
  id: string,
  patch: { titulo?: string; descricao?: string | null; conteudo?: JSONContent; is_active?: boolean }
): Promise<DocumentoTemplateRow> {
  const res = await apiFetch(`/api/v1/documento-templates/${id}`, {
    method: "PATCH",
    headers: headers(auth),
    body: JSON.stringify(patch)
  });
  return parseEnvelope<DocumentoTemplateRow>(res);
}

export async function deleteTemplate(auth: RequestAuth, id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/documento-templates/${id}`, { method: "DELETE", headers: headers(auth) });
  await parseEnvelope<{ deleted: boolean }>(res);
}
