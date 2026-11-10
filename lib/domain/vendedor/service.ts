import type { SupabaseClient } from "@supabase/supabase-js";
import { describeAudit } from "@/lib/api/audit-context";
import { ApiHttpError } from "@/lib/api/errors";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";
import { callConsultaPlaca } from "@/lib/domain/carros-enrichment";
import { listVehicleDocuments } from "@/lib/domain/carros/media";
import { situacaoDaVenda } from "@/lib/domain/vendas/situacao";
import type { VendaEstagio } from "@/lib/domain/vendas/schemas";
import type {
  ArquivoVeiculo,
  ConsultaPlacaTroca,
  ContagemSituacoes,
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
};

/**
 * Lista do vendedor (vitrine do /vender e navegação do /word), paginada no
 * banco. Com busca, procura em TODOS os veículos por placa, chassi ou modelo
 * (a situação não filtra); sem busca, a situação decide a fonte: carros
 * disponíveis ou vendas por estado/estágio. Capas em miniatura.
 */
export async function listVeiculosVendedor(input: ListVeiculosVendedorInput): Promise<{ rows: VeiculoVendedorItem[]; total: number }> {
  const { supabase, situacao, page, pageSize } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  const termo = termoBusca(input.q ?? "");

  let carros: CarroListaRow[] = [];
  let vendas = new Map<string, VendaListaRow>();
  let total = 0;

  if (termo || situacao === "todos" || situacao === "disponivel") {
    let query = supabase.from("carros").select(CARRO_LISTA, { count: "exact" });
    if (termo) {
      const { data: modelos } = await supabase.from("modelos").select("id").ilike("modelo", `%${termo}%`).limit(100);
      const filtros = [`placa.ilike.%${termo}%`, `chassi.ilike.%${termo}%`];
      const modeloIds = (modelos ?? []).map((row) => row.id);
      if (modeloIds.length > 0) filtros.push(`modelo_id.in.(${modeloIds.join(",")})`);
      query = query.or(filtros.join(",")).order("created_at", { ascending: false });
    } else if (situacao === "disponivel") {
      query = query
        .in("estado_venda", await codigosDisponiveis(supabase))
        .eq("em_estoque", true)
        .eq("proposito", "VENDA")
        .order("preco_original", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }
    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("[VENDEDOR_LIST_FAILED]", { error });
      throw new ApiHttpError(500, "VENDEDOR_LIST_FAILED", "Falha ao listar os veículos.");
    }
    carros = (data ?? []) as unknown as CarroListaRow[];
    total = count ?? 0;
    if (situacao !== "disponivel" || termo) vendas = await vendasAtivasDosCarros(supabase, carros.map((carro) => carro.id));
  } else {
    let query = supabase.from("vendas").select(`${VENDA_LISTA}, carros(${CARRO_LISTA})`, { count: "exact" });
    query =
      situacao === "reservado"
        ? query.eq("estado_venda", "aberta")
        : query.eq("estado_venda", "concluida").in("estagio", ESTAGIOS[situacao]);
    const { data, error, count } = await query
      .order("data_venda", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      console.error("[VENDEDOR_LIST_FAILED]", { error });
      throw new ApiHttpError(500, "VENDEDOR_LIST_FAILED", "Falha ao listar as vendas.");
    }
    const rows = (data ?? []) as unknown as Array<VendaListaRow & { carros: CarroListaRow | null }>;
    for (const row of rows) {
      if (!row.carros) continue;
      carros.push(row.carros);
      vendas.set(row.carro_id, row);
    }
    total = count ?? 0;
  }

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
export async function consultarPlacaTroca(supabase: DomainSupabase, placaBruta: string): Promise<ConsultaPlacaTroca> {
  const placa = placaBruta.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (placa.length < 7) throw new ApiHttpError(400, "PLACA_INVALIDA", "Informe a placa completa.");

  const [existente, consulta] = await Promise.all([
    supabase.from("carros").select("id, estado_venda").ilike("placa", placa).maybeSingle(),
    callConsultaPlaca(placa)
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
    cor: consulta.data?.cor?.trim() || null,
    anoFab: consulta.data?.ano_fabricacao ?? (anos ? Number(anos[1]) : null),
    anoMod: consulta.data?.ano_modelo ?? (anos ? Number(anos[2]) : null),
    chassi: consulta.data?.chassi?.trim() || null,
    jaCadastrado: existente.data ? { id: existente.data.id, estadoVenda: existente.data.estado_venda } : null,
    aviso: consulta.data ? null : consulta.error ?? "Consulta de placa indisponível — preencha os dados à mão."
  };
}
