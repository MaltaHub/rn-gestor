import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";
import type { CarroInsert, CarroRow, CarroUpdate } from "@/lib/domain/db";
import { enrichCarroInsertPayload } from "@/lib/domain/carros-enrichment";
import {
  CODIGO_NOTA_FISCAL_EXEMPLO,
  isValidCodigoNotaFiscal,
  normalizeCodigoNotaFiscal
} from "@/lib/domain/carros/codigo-nota-fiscal";
import {
  ensureVehicleFileAutomations,
  findVehicleManagedFolderId,
  handleVehicleBeforeDeleteFileAutomations
} from "@/lib/domain/file-automations/service";
import { signPreviewUrlsByFileIds } from "@/lib/files/service";
import type { Database } from "@/lib/supabase/database.types";

type DomainSupabase = SupabaseClient<Database>;

/** Normaliza um código de status p/ comparação (sem acento, minúsculo) — espelha o `normalize_business_token` do banco. */
function normalizeBusinessToken(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .trim()
    .toLowerCase();
}

/** Mesma regra de `is_carro_disponivel_ou_novo`: token de estado_venda ∈ {disponivel, novo}. */
export function isEstadoVendaDisponivel(estadoVenda: string | null | undefined) {
  return ["disponivel", "novo"].includes(normalizeBusinessToken(estadoVenda));
}

const DEFAULT_ESTADO_VEICULO = "PREPARAÇÃO";
const DEFAULT_ESTADO_ANUNCIO = "AUSENTE";

function normalizeStatusOrDefault(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export type ListCarrosInput = {
  supabase: DomainSupabase;
  page: number;
  pageSize: number;
  q?: string | null;
  local?: string | null;
  estadoVenda?: string | null;
  /** Restringe a veículos disponíveis/novos e em estoque (vitrine do vendedor). */
  availableOnly?: boolean;
  /** Filtra por estágio da venda concluída do carro (em andamento/finalizados). */
  vendaEstagioIn?: string[] | null;
  /** Anexa `cover_url` (preview assinado da foto de capa) em cada linha. */
  withCover?: boolean;
  /** "preco_desc" ordena do mais caro ao mais barato (vitrine). Default: created_at desc. */
  sort?: "preco_desc" | null;
};

export type ListCarrosOutput = {
  rows: Array<Record<string, unknown>>;
  total: number;
};

export type ReadCarroInput = {
  supabase: DomainSupabase;
  id: string;
};

export type ReadCarroOutput = CarroRow & {
  modelos?: unknown;
  anuncios?: unknown;
};

export type CreateCarroInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  row: Partial<CarroInsert>;
};

export type CreateCarroOutput = CarroRow;

export type UpdateCarroInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  patch: CarroUpdate & {
    atpv_e?: unknown;
    laudo?: unknown;
    priceChangeContext?: unknown;
  };
  priceChangeContext?: string;
};

export type UpdateCarroOutput = CarroRow;

export type DeleteCarroInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
};

export async function listCarros(input: ListCarrosInput): Promise<ListCarrosOutput> {
  const { supabase, page, pageSize, q, local, estadoVenda, availableOnly, vendaEstagioIn, withCover, sort } = input;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  // Filtro por estágio da venda exige join com vendas (concluída).
  const filtraPorEstagio = Boolean(vendaEstagioIn && vendaEstagioIn.length > 0);
  const baseSelect =
    "id, placa, chassi, local, estado_venda, em_estoque, tem_fotos, modelo_id, data_entrada, created_at, foto_capa_id, preco_original, ano_mod, ano_fab, hodometro, cor, ano_ipva_pago, tem_manual, tem_chave_r, modelos(modelo)";
  // Tipado como `string` (não literal) p/ o parser de tipos do supabase-js não
  // tentar validar o embed dinâmico `vendas!inner(...)`.
  const selectStr: string = filtraPorEstagio
    ? `${baseSelect}, vendas!inner(estagio, estado_venda)`
    : baseSelect;

  let query = supabase.from("carros").select(selectStr, { count: "exact" });

  query =
    sort === "preco_desc"
      ? query
          .order("preco_original", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

  if (q?.trim()) {
    query = query.or(`placa.ilike.%${q.trim()}%,chassi.ilike.%${q.trim()}%`);
  }

  if (local?.trim()) {
    query = query.eq("local", local.trim());
  }

  if (estadoVenda?.trim()) {
    query = query.eq("estado_venda", estadoVenda.trim());
  }

  if (filtraPorEstagio) {
    // Em andamento (aberto/fechado) ou finalizados: carro com venda concluída
    // no estágio pedido.
    query = query.eq("vendas.estado_venda", "concluida").in("vendas.estagio", vendaEstagioIn as string[]);
  }

  if (availableOnly) {
    const { data: statusRows, error: statusError } = await supabase.from("lookup_sale_statuses").select("code");
    if (statusError) {
      throw new ApiHttpError(500, "CARROS_LIST_FAILED", "Falha ao listar status de venda.", statusError);
    }
    const availableCodes = (statusRows ?? [])
      .map((row) => row.code)
      .filter((code): code is string => typeof code === "string" && isEstadoVendaDisponivel(code));
    // Sentinela evita `.in([])` (query inválida) quando nenhum código casa.
    query = query.in("estado_venda", availableCodes.length > 0 ? availableCodes : ["__none__"]).eq("em_estoque", true);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new ApiHttpError(500, "CARROS_LIST_FAILED", "Falha ao listar carros.", error);

  // `selectStr` é `string` (não literal) → o supabase-js não infere o shape;
  // o cast via unknown é seguro porque conhecemos as colunas pedidas.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

  if (withCover) {
    const coverIds = rows
      .map((row) => row.foto_capa_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const coverUrls = await signPreviewUrlsByFileIds(supabase, coverIds);
    for (const row of rows) {
      const id = typeof row.foto_capa_id === "string" ? row.foto_capa_id : null;
      row.cover_url = id ? coverUrls[id] ?? null : null;
    }
  }

  return { rows, total: count ?? 0 };
}

export async function readCarroById(input: ReadCarroInput): Promise<ReadCarroOutput> {
  const { supabase, id } = input;

  const { data, error } = await supabase.from("carros").select("*, modelos(modelo), anuncios(*)").eq("id", id).maybeSingle();

  if (error) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", error);
  if (!data) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

  return data as ReadCarroOutput;
}

/** Código da nota fiscal no formato fixo (O21_1_2026_5890); vazio vira null. */
function codigoNotaFiscalOrNull(value: unknown) {
  const text = normalizeCodigoNotaFiscal(typeof value === "string" ? value : value == null ? "" : String(value));
  if (!text) return null;
  if (!isValidCodigoNotaFiscal(text)) {
    throw new ApiHttpError(400, "CODIGO_NOTA_FISCAL_INVALIDO", `Código da nota fora do formato (ex.: ${CODIGO_NOTA_FISCAL_EXEMPLO}).`);
  }
  return text;
}

/** Erro de escrita em carros: código de nota repetido vira mensagem clara (índice único). */
function throwCarroWriteError(error: { code?: string; message?: string; details?: string | null }, code: string, message: string): never {
  if (error.code === "23505" && /codigo_nota_fiscal/.test(`${error.message ?? ""} ${error.details ?? ""}`)) {
    throw new ApiHttpError(409, "CODIGO_NOTA_FISCAL_DUPLICADO", "Este código de nota fiscal já está em outro veículo.");
  }
  throw new ApiHttpError(400, code, message, error);
}

export async function createCarro(input: CreateCarroInput): Promise<CreateCarroOutput> {
  const { supabase, row } = input;

  const { payload: enrichedPayload } = await enrichCarroInsertPayload({
    supabase,
    row: row as Record<string, unknown>
  });

  const payload: CarroInsert = {
    ...(enrichedPayload as Partial<CarroInsert>),
    ...("codigo_nota_fiscal" in enrichedPayload ? { codigo_nota_fiscal: codigoNotaFiscalOrNull(enrichedPayload.codigo_nota_fiscal) } : {}),
    em_estoque: row.em_estoque ?? true,
    estado_veiculo: normalizeStatusOrDefault(row.estado_veiculo, DEFAULT_ESTADO_VEICULO),
    estado_anuncio: normalizeStatusOrDefault(row.estado_anuncio, DEFAULT_ESTADO_ANUNCIO)
  } as CarroInsert;

  const { data, error } = await supabase.from("carros").insert(payload).select("*").single();
  if (error) throwCarroWriteError(error, "CARRO_CREATE_FAILED", "Falha ao criar carro.");

  await ensureVehicleFileAutomations(supabase, data.id);

  return data;
}

export async function updateCarro(input: UpdateCarroInput): Promise<UpdateCarroOutput> {
  const { supabase, actor, id, priceChangeContext } = input;
  const patch = { ...input.patch };

  delete patch.atpv_e;
  delete patch.laudo;
  delete patch.priceChangeContext;

  if (patch.placa) {
    patch.placa = patch.placa.trim().toUpperCase();
  }

  if (Object.prototype.hasOwnProperty.call(patch, "codigo_nota_fiscal")) {
    patch.codigo_nota_fiscal = codigoNotaFiscalOrNull(patch.codigo_nota_fiscal);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "estado_veiculo")) {
    patch.estado_veiculo = normalizeStatusOrDefault(patch.estado_veiculo, DEFAULT_ESTADO_VEICULO);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "estado_anuncio")) {
    patch.estado_anuncio = normalizeStatusOrDefault(patch.estado_anuncio, DEFAULT_ESTADO_ANUNCIO);
  }

  const { data: oldData, error: oldError } = await supabase.from("carros").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

  if (Object.prototype.hasOwnProperty.call(patch, "preco_original")) {
    const context = String(priceChangeContext ?? "").trim();
    const oldValue = Number((oldData as Record<string, unknown>).preco_original ?? null);
    const newValue = Number((patch as Record<string, unknown>).preco_original ?? null);
    if (oldValue !== newValue) {
      if (!context) {
        throw new ApiHttpError(400, "PRICE_CHANGE_CONTEXT_REQUIRED", "Explique a alteracao de preco para salvar.");
      }
      await supabase.from("price_change_contexts").insert({
        table_name: "carros",
        row_id: id,
        column_name: "preco_original",
        old_value: Number.isFinite(oldValue) ? oldValue : null,
        new_value: Number.isFinite(newValue) ? newValue : null,
        context,
        created_by: actor.userId
      });
    }
  }

  const { data, error } = await supabase.from("carros").update(patch).eq("id", id).select("*").single();
  if (error) throwCarroWriteError(error, "CARRO_UPDATE_FAILED", "Falha ao atualizar carro.");

  const temFotos = await ensureVehicleFileAutomations(supabase, data.id);

  return {
    ...data,
    tem_fotos: temFotos
  };
}

export type SetCarroFotoCapaInput = {
  supabase: DomainSupabase;
  actor: ActorContext;
  id: string;
  /** Id do arquivo de foto (na pasta de fotos do veículo) ou null para limpar. */
  fileId: string | null;
};

/**
 * Define (ou limpa) a foto de capa do veículo. Valida que o arquivo pertence à
 * pasta de fotos (`fotos_pasta_id`) do próprio veículo, evitando apontar a capa
 * para um arquivo arbitrário.
 */
export async function setCarroFotoCapa(
  input: SetCarroFotoCapaInput
): Promise<{ id: string; foto_capa_id: string | null }> {
  const { supabase, id, fileId } = input;

  const { data: carro, error: readError } = await supabase
    .from("carros")
    .select("id, fotos_pasta_id, foto_capa_id")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", readError);
  if (!carro) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

  if (fileId) {
    // Pasta de fotos via automação (fallback ao atalho fotos_pasta_id).
    const photosFolderId =
      carro.fotos_pasta_id ?? (await findVehicleManagedFolderId(supabase, "vehicle_photos", id));
    if (!photosFolderId) {
      throw new ApiHttpError(400, "CARRO_SEM_PASTA_FOTOS", "Veiculo sem pasta de fotos.");
    }
    const { data: file, error: fileError } = await supabase
      .from("arquivos_arquivos")
      .select("id, pasta_id")
      .eq("id", fileId)
      .maybeSingle();
    if (fileError) throw new ApiHttpError(400, "FILE_READ_FAILED", "Falha ao carregar arquivo.", fileError);
    if (!file || file.pasta_id !== photosFolderId) {
      throw new ApiHttpError(400, "FOTO_CAPA_INVALIDA", "A foto de capa deve estar na pasta de fotos do veiculo.");
    }
  }

  if ((carro.foto_capa_id ?? null) === fileId) {
    return { id: carro.id, foto_capa_id: carro.foto_capa_id ?? null };
  }

  const { data, error } = await supabase
    .from("carros")
    .update({ foto_capa_id: fileId })
    .eq("id", id)
    .select("id, foto_capa_id")
    .single();
  if (error) throw new ApiHttpError(400, "FOTO_CAPA_UPDATE_FAILED", "Falha ao definir a foto de capa.", error);

  return { id: data.id, foto_capa_id: data.foto_capa_id };
}

export async function deleteCarro(input: DeleteCarroInput): Promise<void> {
  const { supabase, id } = input;

  const { data: oldData, error: oldError } = await supabase.from("carros").select("*").eq("id", id).maybeSingle();
  if (oldError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", oldError);
  if (!oldData) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

  // Venda registrada impede a exclusão (FK RESTRICT em vendas.carro_id). Checa
  // ANTES de mexer nas pastas: antes as pastas eram arquivadas/desvinculadas e
  // só depois o banco recusava — o carro ficava sem as pastas.
  const { data: vendas, error: vendasError } = await supabase.from("vendas").select("id, estado_venda").eq("carro_id", id);
  if (vendasError) throw new ApiHttpError(400, "CARRO_VENDAS_READ_FAILED", "Falha ao conferir as vendas do carro.");
  if (vendas && vendas.length > 0) {
    const concluida = vendas.some((venda) => venda.estado_venda === "concluida");
    throw new ApiHttpError(
      409,
      "CARRO_COM_VENDA",
      concluida
        ? "Este veículo tem venda concluída e não pode ser excluído à mão: ele sai do sistema sozinho 90 dias após a venda, com o snapshot dos dados (finalização)."
        : `Este veículo tem ${vendas.length} venda(s) registrada(s) (${vendas.map((venda) => venda.estado_venda).join(", ")}). Remova a venda antes de excluir o veículo.`
    );
  }

  await handleVehicleBeforeDeleteFileAutomations(supabase, id);

  const { error } = await supabase.from("carros").delete().eq("id", id);
  if (error) throw new ApiHttpError(400, "CARRO_DELETE_FAILED", "Falha ao remover carro.", error);

}
