import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/audit";
import type { ActorContext } from "@/lib/api/auth";
import type { VendaRow, VendaUpdate } from "@/lib/domain/db";
import { createCarro, deleteCarro } from "@/lib/domain/carros/service";
import { ensureVehicleFileAutomations } from "@/lib/domain/file-automations/service";
import { signPreviewUrlsByFileIds } from "@/lib/files/service";
import type { Database } from "@/lib/supabase/database.types";
import type { VendaCreateInput, VendaEntradaInput, VendaUpdateInput } from "@/lib/domain/vendas/schemas";

type DomainSupabase = SupabaseClient<Database>;

export type ListVendasInput = {
  supabase: DomainSupabase;
  page: number;
  pageSize: number;
  estadoVenda?: string | null;
  vendedorAuthUserId?: string | null;
  carroId?: string | null;
  /** Filtra por estágio do processo (ex.: ["aberto","fechado","na_garantia"]). */
  estagioIn?: string[] | null;
  /** Anexa `cover_url` (preview assinado da foto de capa do carro) em cada linha. */
  withCover?: boolean;
};

export type ListVendasOutput = {
  rows: Array<Record<string, unknown>>;
  total: number;
};

export type CreateVendaInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: VendaCreateInput;
};

export type UpdateVendaInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: VendaUpdateInput;
};

export type DeleteVendaInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
};

export async function listVendas(input: ListVendasInput): Promise<ListVendasOutput> {
  const { supabase, page, pageSize, estadoVenda, vendedorAuthUserId, carroId, estagioIn, withCover } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  // Com cover, precisamos do foto_capa_id e do modelo aninhado para os cards.
  const carroSelect = withCover
    ? "carros(id, placa, nome, modelo_id, cor, ano_mod, ano_fab, preco_original, foto_capa_id, modelos(modelo))"
    : "carros(placa, nome, modelo_id, cor, ano_mod, ano_fab, preco_original)";

  let query = supabase
    .from("vendas")
    .select(`*, ${carroSelect}, venda_entradas(*)`, { count: "exact" })
    .order("data_venda", { ascending: false })
    .order("created_at", { ascending: false });

  if (estadoVenda?.trim()) {
    query = query.eq("estado_venda", estadoVenda.trim());
  }
  if (vendedorAuthUserId?.trim()) {
    query = query.eq("vendedor_auth_user_id", vendedorAuthUserId.trim());
  }
  if (carroId?.trim()) {
    query = query.eq("carro_id", carroId.trim());
  }
  if (estagioIn && estagioIn.length > 0) {
    query = query.in("estagio", estagioIn);
    // Regra dos 90 dias sem cron: esconde "fechado" entregue ha +90 dias
    // (efetivamente "finalizado") mesmo antes de fn_vendas_auto_finalizar.
    if (estagioIn.includes("fechado") && !estagioIn.includes("finalizado")) {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      query = query.or(`estagio.neq.fechado,data_entrega.is.null,data_entrega.gte.${cutoff}`);
    }
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiHttpError(500, "VENDAS_LIST_FAILED", "Falha ao listar vendas.", error);

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  if (withCover) {
    const coverIds = rows
      .map((row) => (row.carros as { foto_capa_id?: string | null } | null)?.foto_capa_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const coverUrls = await signPreviewUrlsByFileIds(supabase, coverIds);
    for (const row of rows) {
      const carro = row.carros as { foto_capa_id?: string | null } | null;
      const id = carro?.foto_capa_id ?? null;
      row.cover_url = id ? coverUrls[id] ?? null : null;
    }
  }

  return { rows, total: count ?? 0 };
}

type VendaEntradaRpcPayload = {
  tipo: string;
  valor: number;
  cartao_parcelas_qtde: number | null;
  cartao_parcela_valor: number | null;
  carro_troca_id: string | null;
  descricao: string | null;
};

/**
 * Cria o carro recebido na troca e marca a linha de `documentos` (criada por
 * trigger no INSERT do carro) com origem=TROCA e valor_compra = valor da
 * entrada. Falha ao marcar documentos nao aborta a venda — e reparavel no grid.
 */
async function createCarroTroca(
  supabase: DomainSupabase,
  actor: ActorContext,
  entrada: VendaEntradaInput
): Promise<string> {
  const troca = entrada.carro_troca;
  if (!troca) {
    throw new ApiHttpError(400, "ENTRADA_TROCA_SEM_CARRO", "Entrada de troca sem dados do veiculo.");
  }

  const carro = await createCarro({
    supabase,
    actor,
    row: {
      placa: troca.placa.trim().toUpperCase(),
      nome: troca.nome ?? null,
      cor: troca.cor ?? null,
      ano_fab: troca.ano_fab ?? null,
      ano_mod: troca.ano_mod ?? null,
      hodometro: troca.hodometro ?? null,
      chassi: troca.chassi ?? null,
      renavam: troca.renavam ?? null
    }
  });

  const { error: docError } = await supabase
    .from("documentos")
    .update({ origem: "TROCA", valor_compra: entrada.valor })
    .eq("carro_id", carro.id);
  if (docError) {
    console.error("[VENDA_TROCA_DOCUMENTOS_FAILED]", { carroId: carro.id, error: docError });
  }

  return carro.id;
}

/**
 * Converte as entradas validadas no shape persistido, cadastrando o carro de
 * troca quando vier o sub-form (criacao) e reusando `carro_troca_id` quando a
 * entrada referencia um carro ja cadastrado (edicao). Ids criados sao
 * acumulados em `carrosTrocaCriados` para compensacao em caso de falha.
 */
async function buildEntradasPayload(
  supabase: DomainSupabase,
  actor: ActorContext,
  entradas: VendaEntradaInput[],
  carrosTrocaCriados: string[]
): Promise<VendaEntradaRpcPayload[]> {
  const payload: VendaEntradaRpcPayload[] = [];
  for (const entrada of entradas) {
    let carroTrocaId: string | null = entrada.carro_troca_id ?? null;
    if (entrada.tipo === "carro_troca" && !carroTrocaId) {
      carroTrocaId = await createCarroTroca(supabase, actor, entrada);
      carrosTrocaCriados.push(carroTrocaId);
    }
    payload.push({
      tipo: entrada.tipo,
      valor: entrada.valor,
      cartao_parcelas_qtde: entrada.cartao_parcelas_qtde ?? null,
      cartao_parcela_valor: entrada.cartao_parcela_valor ?? null,
      carro_troca_id: carroTrocaId,
      descricao: entrada.descricao ?? null
    });
  }
  return payload;
}

export async function createVenda(input: CreateVendaInput): Promise<VendaRow> {
  const { supabase, actor, row } = input;
  const { entradas: entradasInput, valor_entrada: valorEntradaLegado, ...vendaFields } = row;

  // Compat: o quick-dialog do grid manda valor_entrada simples; vira uma
  // entrada sem tipo. vendas.valor_entrada e denormalizado por trigger.
  const entradas: VendaEntradaInput[] = entradasInput ? [...entradasInput] : [];
  if (entradas.length === 0 && valorEntradaLegado != null && valorEntradaLegado > 0) {
    entradas.push({
      tipo: "outro",
      valor: valorEntradaLegado,
      cartao_parcelas_qtde: null,
      cartao_parcela_valor: null,
      carro_troca: null,
      descricao: "Entrada registrada sem tipo (form rapido)."
    });
  }

  // Carros de troca sao criados ANTES da RPC (enrichment por placa e file
  // automations sao TS); se a venda falhar depois, compensamos com delete.
  const carrosTrocaCriados: string[] = [];
  let venda: VendaRow;
  try {
    const entradasPayload = await buildEntradasPayload(supabase, actor, entradas, carrosTrocaCriados);

    // created_by_user_id referencia auth.users(id), entao usamos authUserId
    // (nao userId, que e usuarios_acesso.id) para nao violar a FK.
    const { data, error } = await supabase.rpc("fn_vendas_criar_v2", {
      p_venda: { ...vendaFields, created_by_user_id: actor.authUserId },
      p_entradas: entradasPayload
    });
    if (error) {
      // 23505 = unique_violation (ux_vendas_carro_concluida)
      if (error.code === "23505") {
        throw new ApiHttpError(
          409,
          "VENDA_CARRO_JA_VENDIDO",
          "Ja existe uma venda concluida para este carro. Cancele a anterior antes de registrar outra.",
          error
        );
      }
      throw new ApiHttpError(400, "VENDA_CREATE_FAILED", "Falha ao registrar venda.", error);
    }
    venda = data as VendaRow;
  } catch (err) {
    // Compensacao best-effort: a venda nao foi criada, entao os carros de
    // troca recem-cadastrados ficariam orfaos.
    for (const carroId of carrosTrocaCriados) {
      try {
        await deleteCarro({ supabase, actor, id: carroId });
      } catch (cleanupError) {
        console.error("[VENDA_TROCA_COMPENSACAO_FAILED]", { carroId, error: cleanupError });
      }
    }
    throw err;
  }

  await writeAuditLog({
    action: "create",
    table: "vendas",
    pk: venda.id,
    actor,
    newData: { ...venda, entradas: entradas.length > 0 ? entradas : null }
  });

  // O trigger SQL seta carros.estado_venda='VENDIDO', mas a automacao de
  // arquivos (mover fotos p/ 'Vendidos', arquivar documentos) e TS — sem esta
  // chamada, vender deixava a pasta do veiculo em 'Fotos dos Veiculos'.
  // SO roda para venda concluida: uma RESERVA ('aberta') nao move fotos nem
  // arquiva documentos (o carro fica RESERVADO, nao VENDIDO).
  // Best-effort: falha aqui nao desfaz a venda (reconcile repara depois).
  if (venda.estado_venda === "concluida") {
    try {
      await ensureVehicleFileAutomations(supabase, venda.carro_id);
    } catch (automationError) {
      console.error("[VENDA_FILE_AUTOMATION_FAILED]", { carroId: venda.carro_id, error: automationError });
    }
  }

  return venda;
}

export async function updateVenda(input: UpdateVendaInput): Promise<VendaRow> {
  const { supabase, actor, id } = input;
  const { entradas: entradasInput, ...patch } = input.patch;

  const { data: oldData, error: oldError } = await supabase
    .from("vendas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (oldError) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao carregar venda.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Venda nao encontrada.");

  // Edicao via wizard: substitui TODAS as entradas atomicamente (RPC; o
  // trigger re-deriva vendas.valor_entrada). Carros de troca novos sao
  // cadastrados; entradas com carro_troca_id reusam o carro existente.
  if (entradasInput) {
    const carrosTrocaCriados: string[] = [];
    const entradasPayload = await buildEntradasPayload(supabase, actor, entradasInput, carrosTrocaCriados);

    const { error: entradasError } = await supabase.rpc("fn_venda_entradas_substituir", {
      p_venda_id: id,
      p_entradas: entradasPayload
    });
    if (entradasError) {
      throw new ApiHttpError(400, "VENDA_ENTRADAS_UPDATE_FAILED", "Falha ao substituir entradas da venda.", entradasError);
    }
  }

  const updates: VendaUpdate = { ...patch };
  let data: VendaRow;

  if (Object.keys(updates).length > 0) {
    const result = await supabase
      .from("vendas")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (result.error) {
      if (result.error.code === "23505") {
        throw new ApiHttpError(
          409,
          "VENDA_CARRO_JA_VENDIDO",
          "Ja existe outra venda concluida para este carro.",
          result.error
        );
      }
      throw new ApiHttpError(400, "VENDA_UPDATE_FAILED", "Falha ao atualizar venda.", result.error);
    }
    data = result.data;
  } else {
    // Patch so de entradas: re-le a venda (trigger ja recalculou valor_entrada).
    const result = await supabase.from("vendas").select("*").eq("id", id).single();
    if (result.error) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao recarregar venda.", result.error);
    data = result.data;
  }

  await writeAuditLog({
    action: "update",
    table: "vendas",
    pk: id,
    actor,
    oldData,
    newData: entradasInput ? { ...data, entradas: entradasInput } : data
  });

  // Mudanca de estado_venda pode encadear carros.estado_venda (trigger SQL);
  // sincroniza a automacao de arquivos do veiculo (best-effort).
  if (Object.prototype.hasOwnProperty.call(patch, "estado_venda")) {
    try {
      await ensureVehicleFileAutomations(supabase, data.carro_id);
    } catch (automationError) {
      console.error("[VENDA_FILE_AUTOMATION_FAILED]", { carroId: data.carro_id, error: automationError });
    }
  }

  return data;
}

/**
 * Cancela a venda (RPC fn_vendas_cancelar): marca 'cancelada', devolve o carro
 * ao estoque/disponivel e reverte o envelope (FECHANDO/FECHADO -> ABERTO).
 * Serve para reserva ('aberta') e venda concluida.
 */
export async function cancelVenda(input: DeleteVendaInput): Promise<VendaRow> {
  const { supabase, actor, id } = input;

  const { data: oldData, error: oldError } = await supabase.from("vendas").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao carregar venda.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Venda nao encontrada.");

  const { data, error } = await supabase.rpc("fn_vendas_cancelar", { p_venda_id: id });
  if (error) throw new ApiHttpError(400, "VENDA_CANCEL_FAILED", "Falha ao cancelar a venda.", error);
  const venda = data as unknown as VendaRow;

  await writeAuditLog({ action: "update", table: "vendas", pk: id, actor, oldData, newData: venda });

  // Carro voltou ao estoque: sincroniza as automacoes de arquivo (best-effort).
  try {
    await ensureVehicleFileAutomations(supabase, venda.carro_id);
  } catch (automationError) {
    console.error("[VENDA_FILE_AUTOMATION_FAILED]", { carroId: venda.carro_id, error: automationError });
  }

  return venda;
}

export async function deleteVenda(input: DeleteVendaInput): Promise<void> {
  const { supabase, actor, id } = input;

  const { data: oldData, error: oldError } = await supabase
    .from("vendas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (oldError) throw new ApiHttpError(400, "VENDA_READ_FAILED", "Falha ao carregar venda.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Venda nao encontrada.");

  const { error } = await supabase.from("vendas").delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "VENDA_DELETE_FAILED", "Falha ao remover venda.", error);

  await writeAuditLog({
    action: "delete",
    table: "vendas",
    pk: id,
    actor,
    oldData
  });
}
