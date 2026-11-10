import type { SupabaseClient } from "@supabase/supabase-js";
import { describeAudit } from "@/lib/api/audit-context";
import { ApiHttpError } from "@/lib/api/errors";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";
import { normalizeCarColorValue } from "@/lib/domain/car-colors";
import { callConsultaPlaca, type ConsultaPlacaOutcome } from "@/lib/domain/carros-enrichment";
import { listVehicleDocuments } from "@/lib/domain/carros/media";
import { situacaoDaVenda } from "@/lib/domain/vendas/situacao";
import type { VendaEstagio } from "@/lib/domain/vendas/schemas";
import type {
  ArquivoVeiculo,
  ConsultaPlacaTroca,
  ContagemSituacoes,
  OrdemLista,
  PainelVeiculo,
  SituacaoFiltro,
  VeiculoVendedorItem,
  VendaAtiva,
  VendaEntradaDetalhe,
  VendaResumoLista
} from "@/lib/domain/vendedor/types";
import { signCoverThumbs } from "@/lib/files/cover-thumbs";
import type { Database } from "@/lib/supabase/database.types";

type DomainSupabase = SupabaseClient<Database>;

const CARRO_LISTA = "id, placa, cor, ano_fab, ano_mod, hodometro, preco_original, estado_venda, proposito, foto_capa_id, modelos(modelo)";
const VENDA_LISTA = "id, carro_id, estado_venda, estagio, comprador_nome, data_venda, data_entrega, valor_total";

type CarroListaRow = {
  id: string;
  placa: string;
  cor: string | null;
  ano_fab: number | null;
  ano_mod: number | null;
  hodometro: number | null;
  preco_original: number | null;
  estado_venda: string;
  proposito: string;
  foto_capa_id: string | null;
  modelos: { modelo: string | null } | null;
};

type VendaListaRow = {
  id: string;
  carro_id: string;
  estado_venda: string;
  estagio: VendaEstagio;
  comprador_nome: string | null;
  data_venda: string | null;
  data_entrega: string | null;
  valor_total: number | null;
};

const ESTAGIOS: Record<"vendido" | "entregue" | "finalizado", VendaEstagio[]> = {
  vendido: ["aberto"],
  entregue: ["fechado", "na_garantia"],
  finalizado: ["finalizado"]
};

// Códigos "disponível" mudam raramente: 10 min em memória poupa uma ida ao banco por lista.
let disponiveisCache: { codes: string[]; expiraEm: number } | null = null;

async function codigosDisponiveis(supabase: DomainSupabase): Promise<string[]> {
  if (disponiveisCache && disponiveisCache.expiraEm > Date.now()) return disponiveisCache.codes;
  const { data, error } = await supabase.from("lookup_sale_statuses").select("code");
  if (error) {
    console.error("[VENDEDOR_STATUS_FAILED]", { error });
    throw new ApiHttpError(500, "VENDEDOR_STATUS_FAILED", "Falha ao carregar os status de venda.");
  }
  const codes = (data ?? []).map((row) => row.code).filter((code): code is string => typeof code === "string" && isEstadoVendaDisponivel(code));
  disponiveisCache = { codes: codes.length > 0 ? codes : ["__none__"], expiraEm: Date.now() + 10 * 60 * 1000 };
  return disponiveisCache.codes;
}

/** Termo seguro para o filtro `or` do PostgREST (vírgula/parênteses quebram a sintaxe). */
function termoBusca(q: string): string {
  return q.replace(/[%,()*\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

function toVendaResumo(row: VendaListaRow): VendaResumoLista {
  return {
    id: row.id,
    estadoVenda: row.estado_venda,
    estagio: row.estagio,
    compradorNome: row.comprador_nome,
    dataVenda: row.data_venda,
    dataEntrega: row.data_entrega,
    valorTotal: row.valor_total
  };
}

/** Venda ATIVA por carro: a reserva ('aberta') vence a concluída. */
function vendaAtivaPorCarro<T extends { carro_id: string; estado_venda: string }>(vendas: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const venda of vendas) {
    const atual = map.get(venda.carro_id);
    if (!atual || (atual.estado_venda !== "aberta" && venda.estado_venda === "aberta")) map.set(venda.carro_id, venda);
  }
  return map;
}

async function vendasAtivasDosCarros(supabase: DomainSupabase, carroIds: string[]): Promise<Map<string, VendaListaRow>> {
  if (carroIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("vendas")
    .select(VENDA_LISTA)
    .in("carro_id", carroIds)
    .in("estado_venda", ["aberta", "concluida"]);
  if (error) {
    console.error("[VENDEDOR_VENDAS_FAILED]", { error });
    throw new ApiHttpError(500, "VENDEDOR_VENDAS_FAILED", "Falha ao carregar as vendas.");
  }
  return vendaAtivaPorCarro((data ?? []) as VendaListaRow[]);
}

async function contarDocumentos(supabase: DomainSupabase, vendaIds: string[]): Promise<Map<string, number>> {
  const contagem = new Map<string, number>();
  if (vendaIds.length === 0) return contagem;
  const { data, error } = await supabase.from("venda_documentos").select("venda_id").in("venda_id", vendaIds);
  if (error) {
    console.error("[VENDEDOR_DOCS_FAILED]", { error });
    return contagem;
  }
  for (const row of data ?? []) contagem.set(row.venda_id, (contagem.get(row.venda_id) ?? 0) + 1);
  return contagem;
}

export async function contarSituacoes(supabase: DomainSupabase): Promise<ContagemSituacoes> {
  const codes = await codigosDisponiveis(supabase);
  const head = { count: "exact" as const, head: true };
  const [disponivel, reservado, vendido, entregue, finalizado] = await Promise.all([
    // Repasse não é vitrine (pedido do Kaic, 2026-11-10).
    supabase.from("carros").select("id", head).in("estado_venda", codes).eq("em_estoque", true).eq("proposito", "VENDA"),
    supabase.from("vendas").select("id", head).eq("estado_venda", "aberta"),
    supabase.from("vendas").select("id", head).eq("estado_venda", "concluida").in("estagio", ESTAGIOS.vendido),
    supabase.from("vendas").select("id", head).eq("estado_venda", "concluida").in("estagio", ESTAGIOS.entregue),
    supabase.from("vendas").select("id", head).eq("estado_venda", "concluida").in("estagio", ESTAGIOS.finalizado)
  ]);
  return {
    disponivel: disponivel.count ?? 0,
    reservado: reservado.count ?? 0,
    vendido: vendido.count ?? 0,
    entregue: entregue.count ?? 0,
    finalizado: finalizado.count ?? 0
  };
}

export type ListVeiculosVendedorInput = {
  supabase: DomainSupabase;
  situacao: SituacaoFiltro;
  q?: string | null;
  page: number;
  pageSize: number;
  /** Sem ordem: a ordem natural da situação (vitrine do Início). */
  ordem?: OrdemLista | null;
  /** usuarios_acesso.id de quem pede ("recentes" = o que ELE manipulou). */
  usuarioId?: string | null;
};

type CarroComVendas = CarroListaRow & { vendas?: VendaListaRow[] };

type ContextoLista = { situacao: SituacaoFiltro; termo: string; modeloIds: string[]; disponiveis: string[] };

const VENDA_EMBUTIDA = `vendas!inner(${VENDA_LISTA})`;

/** Situações que vêm de uma venda: o carro entra pela venda (join), não pelo estado do carro. */
function estagiosDaLista(ctx: ContextoLista): VendaEstagio[] | "reserva" | null {
  if (ctx.termo) return null;
  if (ctx.situacao === "reservado") return "reserva";
  if (ctx.situacao === "vendido" || ctx.situacao === "entregue" || ctx.situacao === "finalizado") return ESTAGIOS[ctx.situacao];
  return null;
}

/**
 * Uma consulta da lista, sempre a partir de `carros` (com a venda embutida nas
 * situações de venda): assim A–Z ordena pelo modelo em qualquer situação e o
 * "Recentes" separa os carros do usuário com `in`/`not in` no próprio banco.
 */
async function consultarLista(
  supabase: DomainSupabase,
  ctx: ContextoLista,
  opts: { somente?: string[]; excluir?: string[]; ordem: "az" | "padrao"; range?: [number, number]; contar: boolean }
): Promise<{ carros: CarroComVendas[]; total: number }> {
  const estagios = estagiosDaLista(ctx);
  let query = supabase.from("carros").select(estagios ? `${CARRO_LISTA}, ${VENDA_EMBUTIDA}` : CARRO_LISTA, opts.contar ? { count: "exact" } : undefined);

  if (ctx.termo) {
    const filtros = [`placa.ilike.%${ctx.termo}%`, `chassi.ilike.%${ctx.termo}%`];
    if (ctx.modeloIds.length > 0) filtros.push(`modelo_id.in.(${ctx.modeloIds.join(",")})`);
    query = query.or(filtros.join(","));
  } else if (ctx.situacao === "disponivel") {
    // Repasse não é vitrine (pedido do Kaic, 2026-11-10).
    query = query.in("estado_venda", ctx.disponiveis).eq("em_estoque", true).eq("proposito", "VENDA");
  } else if (estagios === "reserva") {
    query = query.eq("vendas.estado_venda", "aberta");
  } else if (estagios) {
    query = query.eq("vendas.estado_venda", "concluida").in("vendas.estagio", estagios);
  }

  if (opts.somente) query = query.in("id", opts.somente);
  if (opts.excluir && opts.excluir.length > 0) query = query.not("id", "in", `(${opts.excluir.join(",")})`);

  if (opts.ordem === "az") {
    query = query.order("modelos(modelo)", { ascending: true, nullsFirst: false }).order("placa", { ascending: true });
  } else if (!ctx.termo && ctx.situacao === "disponivel") {
    query = query.order("preco_original", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  } else if (estagios) {
    query = query.order("data_venda", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error, count } = await (opts.range ? query.range(opts.range[0], opts.range[1]) : query);
  if (error) {
    console.error("[VENDEDOR_LIST_FAILED]", { error });
    throw new ApiHttpError(500, "VENDEDOR_LIST_FAILED", "Falha ao listar os veículos.");
  }
  const carros = (data ?? []) as unknown as CarroComVendas[];
  return { carros, total: count ?? carros.length };
}

/** Carros que o usuário manipulou por último (auditoria do banco, 30 dias). Falha = lista sem "recentes". */
async function carrosRecentesDoUsuario(supabase: DomainSupabase, usuarioId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("fn_carros_recentes_do_usuario", { p_usuario_id: usuarioId, p_limite: 60 });
  if (error) {
    console.error("[VENDEDOR_RECENTES_FAILED]", { error });
    return [];
  }
  return (data ?? []).map((row) => row.carro_id);
}

/**
 * Página com os RECENTES na frente: [recentes que passam no filtro, na ordem
 * do uso] ++ [o resto, na ordem da situação]. As duas consultas saem juntas: o
 * resto vem com folga (até `recentes.length` linhas antes) e é cortado aqui,
 * já sabendo quantos recentes passaram no filtro.
 */
async function paginaComRecentes(
  supabase: DomainSupabase,
  ctx: ContextoLista,
  recentes: string[],
  from: number,
  pageSize: number
): Promise<{ carros: CarroComVendas[]; total: number }> {
  const inicioBusca = Math.max(0, from - recentes.length);
  const [topo, resto] = await Promise.all([
    consultarLista(supabase, ctx, { somente: recentes, ordem: "padrao", contar: false }),
    consultarLista(supabase, ctx, { excluir: recentes, ordem: "padrao", range: [inicioBusca, from + pageSize - 1], contar: true })
  ]);
  return montarPaginaComRecentes({ topo: topo.carros, resto: resto.carros, restoTotal: resto.total, recentes, from, pageSize, inicioBusca });
}

/**
 * Corte da página (puro): `topo` = recentes que passaram no filtro (qualquer
 * ordem); `resto` = os demais, buscados a partir de `inicioBusca`.
 */
export function montarPaginaComRecentes<T extends { id: string }>(input: {
  topo: T[];
  resto: T[];
  restoTotal: number;
  recentes: string[];
  from: number;
  pageSize: number;
  inicioBusca: number;
}): { carros: T[]; total: number } {
  const posicao = new Map(input.recentes.map((id, index) => [id, index]));
  const frente = [...input.topo].sort((a, b) => (posicao.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posicao.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const daFrente = frente.slice(input.from, input.from + input.pageSize);
  const faltam = input.pageSize - daFrente.length;
  const inicioResto = Math.max(0, input.from - frente.length) - input.inicioBusca;
  const doResto = faltam > 0 ? input.resto.slice(inicioResto, inicioResto + faltam) : [];
  return { carros: [...daFrente, ...doResto], total: frente.length + input.restoTotal };
}

/**
 * Lista do vendedor (vitrine do /vender e navegação do /word), paginada no
 * banco. Com busca, procura em TODOS os veículos por placa, chassi ou modelo
 * (a situação não filtra); sem busca, a situação decide: carros disponíveis
 * ou carros com venda naquele estado/estágio. Ordem: recentes do usuário, A–Z
 * ou a natural da situação. Capas em miniatura.
 */
export async function listVeiculosVendedor(input: ListVeiculosVendedorInput): Promise<{ rows: VeiculoVendedorItem[]; total: number }> {
  const { supabase, situacao, page, pageSize } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const termo = termoBusca(input.q ?? "");

  const [modeloIds, disponiveis, recentes] = await Promise.all([
    termo ? modelosDaBusca(supabase, termo) : Promise.resolve([] as string[]),
    !termo && situacao === "disponivel" ? codigosDisponiveis(supabase) : Promise.resolve([] as string[]),
    input.ordem === "recentes" && input.usuarioId ? carrosRecentesDoUsuario(supabase, input.usuarioId) : Promise.resolve([] as string[])
  ]);
  const ctx: ContextoLista = { situacao, termo, modeloIds, disponiveis };

  const { carros, total } =
    recentes.length > 0
      ? await paginaComRecentes(supabase, ctx, recentes, from, pageSize)
      : await consultarLista(supabase, ctx, { ordem: input.ordem === "az" ? "az" : "padrao", range: [from, from + pageSize - 1], contar: true });

  // Venda ativa: embutida (situações de venda) ou buscada para os carros da página.
  const vendas = estagiosDaLista(ctx)
    ? vendaAtivaPorCarro(carros.flatMap((carro) => carro.vendas ?? []))
    : situacao !== "disponivel" || termo
      ? await vendasAtivasDosCarros(supabase, carros.map((carro) => carro.id))
      : new Map<string, VendaListaRow>();

  const vendaIds = Array.from(vendas.values()).map((venda) => venda.id);
  const [documentos, capas] = await Promise.all([
    contarDocumentos(supabase, vendaIds),
    signCoverThumbs(supabase, carros.map((carro) => carro.foto_capa_id))
  ]);

  const rows = carros.map<VeiculoVendedorItem>((carro) => {
    const venda = vendas.get(carro.id) ?? null;
    return {
      carroId: carro.id,
      placa: carro.placa,
      modelo: carro.modelos?.modelo ?? null,
      anoFab: carro.ano_fab,
      anoMod: carro.ano_mod,
      cor: carro.cor,
      hodometro: carro.hodometro,
      preco: carro.preco_original,
      estadoVenda: carro.estado_venda,
      proposito: carro.proposito === "REPASSE" ? "REPASSE" : "VENDA",
      coverUrl: carro.foto_capa_id ? capas[carro.foto_capa_id] ?? null : null,
      situacao: situacaoDaVenda(venda, carro.estado_venda),
      venda: venda ? toVendaResumo(venda) : null,
      documentos: venda ? documentos.get(venda.id) ?? 0 : 0
    };
  });

  return { rows, total };
}

async function modelosDaBusca(supabase: DomainSupabase, termo: string): Promise<string[]> {
  const { data } = await supabase.from("modelos").select("id").ilike("modelo", `%${termo}%`).limit(100);
  return (data ?? []).map((row) => row.id);
}

type CarroPainelRow = CarroListaRow & {
  chassi: string | null;
  renavam: string | null;
  ano_ipva_pago: number | null;
  tem_chave_r: boolean | null;
  tem_manual: boolean | null;
  local: string | null;
};

type EntradaRow = Omit<VendaEntradaDetalhe, "troca"> & {
  troca: { placa: string | null; cor: string | null; ano_mod: number | null; modelos: { modelo: string | null } | null } | null;
};

/**
 * Tudo de UM veículo para o painel da venda numa ida só: carro, venda ativa
 * (com entradas e o carro da troca), documentos Word (sem o conteúdo) e os
 * arquivos da pasta de documentos (URLs assinadas).
 */
export async function getPainelVeiculo(supabase: DomainSupabase, carroId: string): Promise<PainelVeiculo> {
  const [carroRes, vendasRes, pasta] = await Promise.all([
    supabase
      .from("carros")
      .select(`${CARRO_LISTA}, chassi, renavam, ano_ipva_pago, tem_chave_r, tem_manual, local`)
      .eq("id", carroId)
      .maybeSingle(),
    supabase
      .from("vendas")
      .select("*, venda_entradas(*, troca:carros!venda_entradas_carro_troca_id_fkey(placa, cor, ano_mod, modelos(modelo)))")
      .eq("carro_id", carroId)
      .in("estado_venda", ["aberta", "concluida"]),
    listVehicleDocuments(supabase, carroId).catch((error: unknown) => {
      console.error("[VENDEDOR_PAINEL_ARQUIVOS_FAILED]", { carroId, error });
      return null;
    })
  ]);

  if (carroRes.error) {
    console.error("[VENDEDOR_PAINEL_FAILED]", { carroId, error: carroRes.error });
    throw new ApiHttpError(500, "VENDEDOR_PAINEL_FAILED", "Falha ao carregar o veículo.");
  }
  if (!carroRes.data) throw new ApiHttpError(404, "NOT_FOUND", "Veículo não encontrado.");
  if (vendasRes.error) {
    console.error("[VENDEDOR_PAINEL_VENDA_FAILED]", { carroId, error: vendasRes.error });
    throw new ApiHttpError(500, "VENDEDOR_PAINEL_FAILED", "Falha ao carregar a venda do veículo.");
  }

  const carro = carroRes.data as unknown as CarroPainelRow;
  const vendaRow = vendaAtivaPorCarro((vendasRes.data ?? []) as unknown as Array<Record<string, unknown> & { carro_id: string; estado_venda: string }>).get(carroId) ?? null;

  const [docsRes, capas] = await Promise.all([
    vendaRow
      ? supabase.from("venda_documentos").select("id, titulo, categoria, updated_at").eq("venda_id", String(vendaRow.id)).order("updated_at", { ascending: false })
      : Promise.resolve(null),
    signCoverThumbs(supabase, [carro.foto_capa_id])
  ]);
  if (docsRes?.error) console.error("[VENDEDOR_PAINEL_DOCS_FAILED]", { carroId, error: docsRes.error });

  let venda: VendaAtiva | null = null;
  if (vendaRow) {
    const entradas = ((vendaRow.venda_entradas ?? []) as EntradaRow[]).map<VendaEntradaDetalhe>((entrada) => ({
      ...entrada,
      troca: entrada.troca
        ? { placa: entrada.troca.placa, modelo: entrada.troca.modelos?.modelo ?? null, anoMod: entrada.troca.ano_mod, cor: entrada.troca.cor }
        : null
    }));
    venda = { ...(vendaRow as VendaAtiva), venda_entradas: entradas };
  }

  const arquivos: ArquivoVeiculo[] = (pasta?.files ?? [])
    .filter((file) => !file.isMissing)
    .map((file) => ({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      previewUrl: file.previewUrl,
      downloadUrl: file.downloadUrl,
      updatedAt: file.updatedAt
    }));

  return {
    carro: {
      id: carro.id,
      placa: carro.placa,
      modelo: carro.modelos?.modelo ?? null,
      anoFab: carro.ano_fab,
      anoMod: carro.ano_mod,
      cor: carro.cor,
      hodometro: carro.hodometro,
      preco: carro.preco_original,
      chassi: carro.chassi,
      renavam: carro.renavam,
      estadoVenda: carro.estado_venda,
      proposito: carro.proposito === "REPASSE" ? "REPASSE" : "VENDA",
      anoIpvaPago: carro.ano_ipva_pago,
      temChaveReserva: carro.tem_chave_r,
      temManual: carro.tem_manual,
      local: carro.local,
      coverUrl: carro.foto_capa_id ? capas[carro.foto_capa_id] ?? null : null
    },
    situacao: situacaoDaVenda(venda, carro.estado_venda),
    venda,
    documentos: (docsRes?.data ?? []).map((doc) => ({ id: doc.id, titulo: doc.titulo, categoria: doc.categoria, updatedAt: doc.updated_at })),
    arquivos
  };
}

/**
 * O vendedor confirma, no fluxo de venda, que o IPVA do ano está pago: o
 * cadastro do veículo passa a registrar (`carros.ano_ipva_pago`). Só sobe o
 * ano — nunca apaga nem rebaixa o que já consta.
 */
export async function confirmarIpvaPago(supabase: DomainSupabase, carroId: string, ano: number): Promise<{ anoIpvaPago: number }> {
  const atualAno = new Date().getFullYear();
  if (!Number.isInteger(ano) || ano < 2000 || ano > atualAno + 1) {
    throw new ApiHttpError(400, "IPVA_ANO_INVALIDO", "Ano do IPVA inválido.");
  }
  const { data, error } = await supabase.from("carros").select("id, placa, ano_ipva_pago").eq("id", carroId).maybeSingle();
  if (error) {
    console.error("[IPVA_CONFIRMAR_FAILED]", { carroId, error });
    throw new ApiHttpError(500, "IPVA_CONFIRMAR_FAILED", "Falha ao carregar o veículo.");
  }
  if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Veículo não encontrado.");
  if (data.ano_ipva_pago != null && data.ano_ipva_pago >= ano) return { anoIpvaPago: data.ano_ipva_pago };

  describeAudit(`IPVA ${ano} confirmado como pago no fluxo de venda (${data.placa}).`);
  const { error: updateError } = await supabase.from("carros").update({ ano_ipva_pago: ano }).eq("id", carroId);
  if (updateError) {
    console.error("[IPVA_CONFIRMAR_FAILED]", { carroId, error: updateError });
    throw new ApiHttpError(500, "IPVA_CONFIRMAR_FAILED", "Falha ao registrar o IPVA pago.");
  }
  return { anoIpvaPago: ano };
}



/** Consulta de placa do cadastro do carro da troca (preenche modelo, cor, anos, chassi). */
/**
 * A consulta externa (edge function) às vezes cai no 1º acesso (cold start,
 * timeout): repete UMA vez em falha passageira — igual ao cadastro do grid.
 */
async function consultarComNovaTentativa(placa: string): Promise<ConsultaPlacaOutcome> {
  const primeira = await callConsultaPlaca(placa);
  if (primeira.data || !primeira.transitorio) return primeira;
  await new Promise((resolve) => setTimeout(resolve, 600));
  return callConsultaPlaca(placa);
}

export async function consultarPlacaTroca(supabase: DomainSupabase, placaBruta: string): Promise<ConsultaPlacaTroca> {
  const placa = placaBruta.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (placa.length < 7) throw new ApiHttpError(400, "PLACA_INVALIDA", "Informe a placa completa.");

  const [existente, consulta] = await Promise.all([
    supabase.from("carros").select("id, estado_venda").ilike("placa", placa).maybeSingle(),
    consultarComNovaTentativa(placa)
  ]);

  const modeloSugerido = consulta.data?.modelo?.trim() || null;
  let modeloCatalogo: ConsultaPlacaTroca["modeloCatalogo"] = null;
  if (modeloSugerido) {
    const { data } = await supabase.from("modelos").select("id, modelo").ilike("modelo", modeloSugerido).limit(1).maybeSingle();
    if (data) modeloCatalogo = { id: data.id, modelo: String(data.modelo) };
  }
  const anos = /(\d{4})\D+(\d{4})/.exec(String(consulta.data?.ano ?? ""));

  return {
    placa,
    modeloSugerido,
    modeloCatalogo,
    cor: normalizeCarColorValue(consulta.data?.cor) ?? (consulta.data?.cor?.trim() || null),
    anoFab: consulta.data?.ano_fabricacao ?? (anos ? Number(anos[1]) : null),
    anoMod: consulta.data?.ano_modelo ?? (anos ? Number(anos[2]) : null),
    chassi: consulta.data?.chassi?.trim() || null,
    jaCadastrado: existente.data ? { id: existente.data.id, estadoVenda: existente.data.estado_venda } : null,
    aviso: consulta.data ? null : consulta.error ?? "Consulta de placa indisponível — preencha os dados à mão."
  };
}
