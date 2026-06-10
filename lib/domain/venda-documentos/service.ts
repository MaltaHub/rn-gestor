import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import type { ActorContext } from "@/lib/api/auth";
import type { VendaDocumentoInsert, VendaDocumentoRow, VendaRow } from "@/lib/domain/db";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/variables";
import type {
  VendaDocumentoCreateInput,
  VendaDocumentoUpdateInput
} from "@/lib/domain/venda-documentos/schemas";

type DomainSupabase = SupabaseClient<Database>;

const TABLE = "venda_documentos";

export type ListVendaDocumentosInput = {
  supabase: DomainSupabase;
  vendaId?: string | null;
  carroId?: string | null;
};

export type ProcessoDocumento = { id: string; titulo: string; updatedAt: string };

export type ProcessoVeiculo = {
  vendaId: string;
  carroId: string;
  placa: string;
  modelo: string | null;
  dataEntrega: string | null;
  finalizado: boolean;
  documentos: ProcessoDocumento[];
};

// Shape do select aninhado (relacoes to-one viram objeto).
type CarroNested = {
  placa: string;
  nome: string | null;
  cor: string | null;
  ano_fab: number | null;
  ano_mod: number | null;
  chassi: string | null;
  renavam: string | null;
  modelos: { modelo: string | null } | null;
};
type VendaProcessoRow = {
  id: string;
  carro_id: string;
  data_entrega: string | null;
  estado_venda: string;
  carros: { placa: string; nome: string | null; modelos: { modelo: string | null } | null } | null;
};
type VendaContextRow = VendaRow & { carros: CarroNested | null };

export async function listVendaDocumentos(
  input: ListVendaDocumentosInput
): Promise<VendaDocumentoRow[]> {
  const { supabase, vendaId, carroId } = input;
  let query = supabase
    .from(TABLE)
    .select("*")
    .order("updated_at", { ascending: false });

  if (vendaId?.trim()) query = query.eq("venda_id", vendaId.trim());
  if (carroId?.trim()) query = query.eq("carro_id", carroId.trim());

  const { data, error } = await query;
  if (error) throw new ApiHttpError(500, "VENDA_DOCS_LIST_FAILED", "Falha ao listar documentos.", error);
  return (data ?? []) as VendaDocumentoRow[];
}

export async function getVendaDocumento(
  supabase: DomainSupabase,
  id: string
): Promise<VendaDocumentoRow> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiHttpError(400, "VENDA_DOC_READ_FAILED", "Falha ao carregar documento.", error);
  if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Documento nao encontrado.");
  return data as VendaDocumentoRow;
}

export async function createVendaDocumento(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: VendaDocumentoCreateInput;
}): Promise<VendaDocumentoRow> {
  const { supabase, actor, row } = input;

  // carro_id e derivado da venda (nao confiamos no cliente) — garante consistencia.
  const { data: venda, error: vendaError } = await supabase
    .from("vendas")
    .select("id, carro_id")
    .eq("id", row.venda_id)
    .maybeSingle();
  if (vendaError) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao carregar venda.", vendaError);
  if (!venda) throw new ApiHttpError(404, "NOT_FOUND", "Venda (processo) nao encontrada.");

  const payload: VendaDocumentoInsert = {
    venda_id: row.venda_id,
    carro_id: venda.carro_id,
    titulo: row.titulo,
    conteudo: row.conteudo as Json,
    template_id: row.template_id ?? null,
    created_by_user_id: actor.authUserId
  };

  const { data, error } = await supabase.from(TABLE).insert(payload).select("*").single();
  if (error) throw new ApiHttpError(400, "VENDA_DOC_CREATE_FAILED", "Falha ao criar documento.", error);

  await writeAuditLog({ action: "create", table: TABLE, pk: data.id, actor, newData: data });
  return data as VendaDocumentoRow;
}

export async function updateVendaDocumento(input: {
  supabase: DomainSupabase;
  id: string;
  patch: VendaDocumentoUpdateInput;
}): Promise<VendaDocumentoRow> {
  const { supabase, id, patch } = input;

  // Sem auditoria: o auto-save chamaria esta rota a cada digitacao (evita flood).
  const updates: Record<string, unknown> = {};
  if (patch.titulo !== undefined) updates.titulo = patch.titulo;
  if (patch.conteudo !== undefined) updates.conteudo = patch.conteudo as Json;

  const { data, error } = await supabase.from(TABLE).update(updates).eq("id", id).select("*").maybeSingle();
  if (error) throw new ApiHttpError(400, "VENDA_DOC_UPDATE_FAILED", "Falha ao salvar documento.", error);
  if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Documento nao encontrado.");
  return data as VendaDocumentoRow;
}

export async function deleteVendaDocumento(input: {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
}): Promise<void> {
  const { supabase, actor, id } = input;
  const { data: old, error: readError } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (readError) throw new ApiHttpError(400, "VENDA_DOC_READ_FAILED", "Falha ao carregar documento.", readError);
  if (!old) throw new ApiHttpError(404, "NOT_FOUND", "Documento nao encontrado.");

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "VENDA_DOC_DELETE_FAILED", "Falha ao remover documento.", error);

  await writeAuditLog({ action: "delete", table: TABLE, pk: id, actor, oldData: old });
}

/**
 * Lista os "processos" para a navegacao do editor: veiculos (por placa) que tem
 * venda concluida OU ao menos um documento construido. `finalizado` deriva de
 * `data_entrega` (entregue = finalizado).
 */
export async function listProcessos(supabase: DomainSupabase): Promise<ProcessoVeiculo[]> {
  const { data: docs, error: docsError } = await supabase
    .from(TABLE)
    .select("id, venda_id, titulo, updated_at")
    .order("updated_at", { ascending: false });
  if (docsError) throw new ApiHttpError(500, "PROCESSOS_LIST_FAILED", "Falha ao listar documentos.", docsError);

  const docsByVenda = new Map<string, ProcessoDocumento[]>();
  for (const d of docs ?? []) {
    const list = docsByVenda.get(d.venda_id) ?? [];
    list.push({ id: d.id, titulo: d.titulo, updatedAt: d.updated_at });
    docsByVenda.set(d.venda_id, list);
  }

  const selectCols = "id, carro_id, data_entrega, estado_venda, carros(placa, nome, modelos(modelo))";
  const vendasById = new Map<string, VendaProcessoRow>();

  const { data: concluidas, error: e1 } = await supabase
    .from("vendas")
    .select(selectCols)
    .eq("estado_venda", "concluida");
  if (e1) throw new ApiHttpError(500, "PROCESSOS_VENDAS_FAILED", "Falha ao listar vendas.", e1);
  for (const v of (concluidas ?? []) as unknown as VendaProcessoRow[]) vendasById.set(v.id, v);

  // Veiculos com documento mas cuja venda nao e concluida (ex.: cancelada depois).
  const faltantes = Array.from(docsByVenda.keys()).filter((id) => !vendasById.has(id));
  if (faltantes.length > 0) {
    const { data: extras, error: e2 } = await supabase.from("vendas").select(selectCols).in("id", faltantes);
    if (e2) throw new ApiHttpError(500, "PROCESSOS_VENDAS_FAILED", "Falha ao listar vendas.", e2);
    for (const v of (extras ?? []) as unknown as VendaProcessoRow[]) vendasById.set(v.id, v);
  }

  const out: ProcessoVeiculo[] = [];
  for (const v of vendasById.values()) {
    out.push({
      vendaId: v.id,
      carroId: v.carro_id,
      placa: v.carros?.placa ?? "—",
      modelo: v.carros?.modelos?.modelo ?? v.carros?.nome ?? null,
      dataEntrega: v.data_entrega,
      finalizado: Boolean(v.data_entrega),
      documentos: docsByVenda.get(v.id) ?? []
    });
  }
  out.sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR", { numeric: true }));
  return out;
}

/** Monta o contexto de variaveis `${...}` de um processo (venda + carro + vendedor). */
export async function buildVendaDocContext(input: {
  supabase: DomainSupabase;
  vendaId: string;
}): Promise<VendaDocContext> {
  const { supabase, vendaId } = input;
  const { data, error } = await supabase
    .from("vendas")
    .select("*, carros(placa, nome, cor, ano_fab, ano_mod, chassi, renavam, modelos(modelo))")
    .eq("id", vendaId)
    .maybeSingle();
  if (error) throw new ApiHttpError(400, "VENDA_DOC_CONTEXT_FAILED", "Falha ao carregar contexto.", error);
  if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Venda (processo) nao encontrada.");

  const v = data as unknown as VendaContextRow;

  let vendedor: string | null = null;
  if (v.vendedor_auth_user_id) {
    const { data: usuario } = await supabase
      .from("usuarios_acesso")
      .select("nome")
      .eq("auth_user_id", v.vendedor_auth_user_id)
      .maybeSingle();
    vendedor = usuario?.nome ?? null;
  }

  const carro = v.carros;
  return {
    placa: carro?.placa ?? null,
    modelo: carro?.modelos?.modelo ?? carro?.nome ?? null,
    cor: carro?.cor ?? null,
    anoFab: carro?.ano_fab ?? null,
    anoMod: carro?.ano_mod ?? null,
    chassi: carro?.chassi ?? null,
    renavam: carro?.renavam ?? null,
    valorTotal: v.valor_total ?? null,
    valorEntrada: v.valor_entrada ?? null,
    formaPagamento: v.forma_pagamento ?? null,
    dataVenda: v.data_venda ?? null,
    dataEntrega: v.data_entrega ?? null,
    observacao: v.observacao ?? null,
    compradorNome: v.comprador_nome ?? null,
    compradorDocumento: v.comprador_documento ?? null,
    compradorTelefone: v.comprador_telefone ?? null,
    compradorEmail: v.comprador_email ?? null,
    compradorEndereco: v.comprador_endereco ?? null,
    financBanco: v.financ_banco ?? null,
    financParcelasQtde: v.financ_parcelas_qtde ?? null,
    financParcelaValor: v.financ_parcela_valor ?? null,
    vendedor
  };
}
