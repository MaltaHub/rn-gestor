import type { SupabaseClient } from "@supabase/supabase-js";
import { describeAudit } from "@/lib/api/audit-context";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";
import type { VendaDocumentoInsert, VendaDocumentoRow, VendaRow } from "@/lib/domain/db";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import { categoriaLabel } from "@/lib/domain/venda-documentos/categorias";
import type {
  VendaDocumentoCreateInput,
  VendaDocumentoUpdateInput
} from "@/lib/domain/venda-documentos/schemas";

type DomainSupabase = SupabaseClient<Database>;

const TABLE = "venda_documentos";
/** Lista sem o `conteudo` (o JSON do documento é o peso da linha). */
const RESUMO_COLUMNS = "id, venda_id, carro_id, titulo, categoria, template_id, created_at, updated_at";

export type ListVendaDocumentosInput = {
  supabase: DomainSupabase;
  vendaId?: string | null;
  carroId?: string | null;
  /** true = sem o conteúdo (listas); false = documentos completos (miniaturas). */
  resumo?: boolean;
};

export type VendaDocumentoResumoRow = Omit<VendaDocumentoRow, "conteudo" | "created_by_user_id">;

// Shape do select aninhado (relacoes to-one viram objeto).
type CarroNested = {
  placa: string;
  cor: string | null;
  ano_fab: number | null;
  ano_mod: number | null;
  hodometro: number | null;
  ano_ipva_pago: number | null;
  chassi: string | null;
  renavam: string | null;
  tem_chave_r: boolean | null;
  tem_manual: boolean | null;
  modelos: { modelo: string | null; codigo_oficial: string | null } | null;
};
type TrocaNested = {
  placa: string | null;
  cor: string | null;
  ano_fab: number | null;
  ano_mod: number | null;
  hodometro: number | null;
  chassi: string | null;
  renavam: string | null;
  modelos: { modelo: string | null } | null;
};
type EntradaNested = {
  tipo: string;
  valor: number | null;
  descricao: string | null;
  cartao_parcelas_qtde: number | null;
  cartao_parcela_valor: number | null;
  troca: TrocaNested | null;
};
type VendaContextRow = VendaRow & { carros: CarroNested | null; venda_entradas: EntradaNested[] | null };

export async function listVendaDocumentos(input: ListVendaDocumentosInput): Promise<Array<VendaDocumentoRow | VendaDocumentoResumoRow>> {
  const { supabase, vendaId, carroId, resumo } = input;
  if (!vendaId?.trim() && !carroId?.trim()) {
    throw new ApiHttpError(400, "MISSING_FILTER", "Informe venda_id ou carro_id.");
  }
  let query = supabase
    .from(TABLE)
    .select(resumo ? RESUMO_COLUMNS : "*")
    .order("updated_at", { ascending: false });

  if (vendaId?.trim()) query = query.eq("venda_id", vendaId.trim());
  if (carroId?.trim()) query = query.eq("carro_id", carroId.trim());

  const { data, error } = await query;
  if (error) {
    console.error("[VENDA_DOCS_LIST_FAILED]", { error });
    throw new ApiHttpError(500, "VENDA_DOCS_LIST_FAILED", "Falha ao listar documentos.");
  }
  return (data ?? []) as unknown as Array<VendaDocumentoRow | VendaDocumentoResumoRow>;
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
    categoria: row.categoria ?? null,
    conteudo: row.conteudo as Json,
    template_id: row.template_id ?? null,
    created_by_user_id: actor.authUserId
  };

  describeAudit(`Documento "${row.titulo}" (${categoriaLabel(row.categoria)}) gerado.`);
  const { data, error } = await supabase.from(TABLE).insert(payload).select("*").single();
  if (error) throw new ApiHttpError(400, "VENDA_DOC_CREATE_FAILED", "Falha ao criar documento.", error);

  return data as VendaDocumentoRow;
}

export async function updateVendaDocumento(input: {
  supabase: DomainSupabase;
  id: string;
  patch: VendaDocumentoUpdateInput;
}): Promise<VendaDocumentoRow> {
  const { supabase, id, patch } = input;

  // O auto-save chama esta rota a cada pausa na digitacao: a trigger de
  // auditoria ignora `conteudo`, entao so titulo/categoria geram registro.
  const updates: Record<string, unknown> = {};
  if (patch.titulo !== undefined) updates.titulo = patch.titulo;
  if (patch.conteudo !== undefined) updates.conteudo = patch.conteudo as Json;
  if (patch.categoria !== undefined) updates.categoria = patch.categoria;

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
  const { supabase, id } = input;
  const { data: old, error: readError } = await supabase.from(TABLE).select("id, titulo").eq("id", id).maybeSingle();
  if (readError) throw new ApiHttpError(400, "VENDA_DOC_READ_FAILED", "Falha ao carregar documento.", readError);
  if (!old) throw new ApiHttpError(404, "NOT_FOUND", "Documento nao encontrado.");

  describeAudit(`Documento "${old.titulo}" excluído.`);
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "VENDA_DOC_DELETE_FAILED", "Falha ao remover documento.", error);
}

/** Monta o contexto de variaveis `${...}` de um processo (venda + carro + troca + vendedor). */
export async function buildVendaDocContext(input: {
  supabase: DomainSupabase;
  vendaId: string;
}): Promise<VendaDocContext> {
  const { supabase, vendaId } = input;
  const { data, error } = await supabase
    .from("vendas")
    .select(
      "*, carros(placa, cor, ano_fab, ano_mod, hodometro, ano_ipva_pago, chassi, renavam, tem_chave_r, tem_manual, modelos(modelo, codigo_oficial)), " +
        "venda_entradas(tipo, valor, descricao, cartao_parcelas_qtde, cartao_parcela_valor, troca:carros!venda_entradas_carro_troca_id_fkey(placa, cor, ano_fab, ano_mod, hodometro, chassi, renavam, modelos(modelo)))"
    )
    .eq("id", vendaId)
    .maybeSingle();
  if (error) {
    console.error("[VENDA_DOC_CONTEXT_FAILED]", { vendaId, error });
    throw new ApiHttpError(400, "VENDA_DOC_CONTEXT_FAILED", "Falha ao carregar os dados da venda.");
  }
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
    modelo: carro?.modelos?.modelo ?? null,
    codigoOficial: carro?.modelos?.codigo_oficial ?? null,
    cor: carro?.cor ?? null,
    anoFab: carro?.ano_fab ?? null,
    anoMod: carro?.ano_mod ?? null,
    hodometro: carro?.hodometro ?? null,
    anoIpvaPago: carro?.ano_ipva_pago ?? null,
    chassi: carro?.chassi ?? null,
    renavam: carro?.renavam ?? null,
    temChaveReserva: carro?.tem_chave_r ?? null,
    temManual: carro?.tem_manual ?? null,
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
    entradas: (v.venda_entradas ?? []).map((e) => ({
      tipo: e.tipo,
      valor: e.valor,
      descricao: e.descricao,
      cartaoParcelasQtde: e.cartao_parcelas_qtde,
      cartaoParcelaValor: e.cartao_parcela_valor,
      troca: e.troca
        ? {
            placa: e.troca.placa,
            modelo: e.troca.modelos?.modelo ?? null,
            cor: e.troca.cor,
            anoFab: e.troca.ano_fab,
            anoMod: e.troca.ano_mod,
            hodometro: e.troca.hodometro,
            chassi: e.troca.chassi,
            renavam: e.troca.renavam
          }
        : null
    })),
    vendedor
  };
}
