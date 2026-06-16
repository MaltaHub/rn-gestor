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
  /** Null quando o carro ainda não tem processo de venda (não dá p/ ter documentos). */
  vendaId: string | null;
  carroId: string;
  placa: string;
  modelo: string | null;
  /** Nome completo do veículo (carros.nome) — ajuda o usuário a se localizar. */
  nome: string | null;
  dataEntrega: string | null;
  finalizado: boolean;
  /** Estágio da venda (aberto/fechado/na_garantia/finalizado) ou null (sem processo). */
  estagio: string | null;
  /** carros.created_at — ordenação secundária (mais recentes primeiro). */
  createdAt: string | null;
  documentos: ProcessoDocumento[];
};

export type ListProcessosInput = {
  supabase: DomainSupabase;
  page?: number;
  pageSize?: number;
  q?: string | null;
};

export type ListProcessosOutput = { rows: ProcessoVeiculo[]; total: number };

// Ordem de exibição por estágio; carros sem processo de venda ficam por último.
const ESTAGIO_RANK: Record<string, number> = { aberto: 0, fechado: 1, na_garantia: 2, finalizado: 3 };
const SEM_PROCESSO_RANK = 99;

// Shape do select aninhado (relacoes to-one viram objeto).
type CarroNested = {
  placa: string;
  nome: string | null;
  cor: string | null;
  ano_fab: number | null;
  ano_mod: number | null;
  hodometro: number | null;
  ano_ipva_pago: number | null;
  chassi: string | null;
  renavam: string | null;
  modelos: { modelo: string | null; codigo_oficial: string | null } | null;
};
type EntradaNested = {
  tipo: string;
  valor: number | null;
};
type VendaContextRow = VendaRow & { carros: CarroNested | null; venda_entradas: EntradaNested[] | null };

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
 * Lista as placas para a navegacao do editor. Agora lista TODOS os carros (com
 * ou sem processo de venda), ordenados por ESTÁGIO (aberto, fechado, na
 * garantia, finalizado) e, dentro de cada estágio, por created_at desc; carros
 * sem processo ficam por último. Paginado (50/pág) e buscável por placa/modelo/
 * nome. Carros sem venda têm vendaId null (não dá pra ter documentos ainda).
 */
export async function listProcessos(input: ListProcessosInput): Promise<ListProcessosOutput> {
  const { supabase } = input;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const needle = (input.q ?? "").trim().toLowerCase();

  // Documentos por venda.
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

  // Venda concluída por carro (estágio + entrega).
  const { data: vendas, error: vErr } = await supabase
    .from("vendas")
    .select("id, carro_id, estagio, data_entrega")
    .eq("estado_venda", "concluida");
  if (vErr) throw new ApiHttpError(500, "PROCESSOS_VENDAS_FAILED", "Falha ao listar vendas.", vErr);

  type VendaMin = { id: string; carro_id: string; estagio: string | null; data_entrega: string | null };
  const vendaByCarro = new Map<string, VendaMin>();
  for (const v of (vendas ?? []) as VendaMin[]) vendaByCarro.set(v.carro_id, v);

  // Todos os carros.
  const { data: carros, error: cErr } = await supabase
    .from("carros")
    .select("id, placa, nome, created_at, modelos(modelo)");
  if (cErr) throw new ApiHttpError(500, "PROCESSOS_CARROS_FAILED", "Falha ao listar carros.", cErr);

  type CarroRow = {
    id: string;
    placa: string | null;
    nome: string | null;
    created_at: string | null;
    modelos: { modelo: string | null } | null;
  };

  let rows: ProcessoVeiculo[] = ((carros ?? []) as unknown as CarroRow[]).map((c) => {
    const venda = vendaByCarro.get(c.id) ?? null;
    return {
      vendaId: venda?.id ?? null,
      carroId: c.id,
      placa: c.placa ?? "—",
      modelo: c.modelos?.modelo ?? null,
      nome: c.nome ?? null,
      dataEntrega: venda?.data_entrega ?? null,
      finalizado: venda?.estagio === "finalizado",
      estagio: venda?.estagio ?? null,
      createdAt: c.created_at ?? null,
      documentos: venda ? docsByVenda.get(venda.id) ?? [] : []
    };
  });

  if (needle) {
    rows = rows.filter(
      (r) =>
        r.placa.toLowerCase().includes(needle) ||
        (r.modelo ?? "").toLowerCase().includes(needle) ||
        (r.nome ?? "").toLowerCase().includes(needle)
    );
  }

  rows.sort((a, b) => {
    const ra = a.estagio ? ESTAGIO_RANK[a.estagio] ?? SEM_PROCESSO_RANK : SEM_PROCESSO_RANK;
    const rb = b.estagio ? ESTAGIO_RANK[b.estagio] ?? SEM_PROCESSO_RANK : SEM_PROCESSO_RANK;
    if (ra !== rb) return ra - rb;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? ""); // created_at desc
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total };
}

/** Monta o contexto de variaveis `${...}` de um processo (venda + carro + vendedor). */
export async function buildVendaDocContext(input: {
  supabase: DomainSupabase;
  vendaId: string;
}): Promise<VendaDocContext> {
  const { supabase, vendaId } = input;
  const { data, error } = await supabase
    .from("vendas")
    .select(
      "*, carros(placa, nome, cor, ano_fab, ano_mod, hodometro, ano_ipva_pago, chassi, renavam, modelos(modelo, codigo_oficial)), venda_entradas(tipo, valor)"
    )
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
    codigoOficial: carro?.modelos?.codigo_oficial ?? null,
    cor: carro?.cor ?? null,
    anoFab: carro?.ano_fab ?? null,
    anoMod: carro?.ano_mod ?? null,
    hodometro: carro?.hodometro ?? null,
    anoIpvaPago: carro?.ano_ipva_pago ?? null,
    chassi: carro?.chassi ?? null,
    renavam: carro?.renavam ?? null,
    valorTotal: v.valor_total ?? null,
    valorEntrada: v.valor_entrada ?? null,
    desconto: v.desconto ?? null,
    formaPagamento: v.forma_pagamento ?? null,
    dataVenda: v.data_venda ?? null,
    dataEntrega: v.data_entrega ?? null,
    observacao: v.observacao ?? null,
    debitos: v.debitos ?? null,
    compradorNome: v.comprador_nome ?? null,
    compradorDocumento: v.comprador_documento ?? null,
    compradorRg: v.comprador_rg ?? null,
    compradorTelefone: v.comprador_telefone ?? null,
    compradorEmail: v.comprador_email ?? null,
    compradorEndereco: v.comprador_endereco ?? null,
    compradorCep: v.comprador_cep ?? null,
    compradorCidadeEstado: v.comprador_cidade_estado ?? null,
    financBanco: v.financ_banco ?? null,
    financValor: v.financ_valor ?? null,
    financParcelasQtde: v.financ_parcelas_qtde ?? null,
    financParcelaValor: v.financ_parcela_valor ?? null,
    cartaoParcelasQtde: v.cartao_parcelas_qtde ?? null,
    cartaoParcelaValor: v.cartao_parcela_valor ?? null,
    tipoTransferencia: v.tipo_transferencia ?? null,
    valorTransferencia: v.valor_transferencia ?? null,
    entradas: (v.venda_entradas ?? []).map((e) => ({ tipo: e.tipo, valor: e.valor })),
    vendedor
  };
}
