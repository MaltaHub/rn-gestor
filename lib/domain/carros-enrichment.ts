import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { Database } from "@/lib/supabase/database.types";

type AppSupabase = SupabaseClient<Database>;
type CarRowInput = Record<string, unknown>;

type ConsultaPlacaFipe = {
  codigo_fipe: string | null;
  codigo_marca: number | null;
  codigo_modelo: string | null;
  ano_modelo: number | null;
  combustivel: string | null;
  id_valor: number | null;
  mes_referencia: string | null;
  referencia_fipe: number | null;
  score: number | null;
  sigla_combustivel: string | null;
  texto_marca: string | null;
  texto_modelo: string | null;
  texto_valor: string | null;
  tipo_modelo: number | null;
  raw: unknown;
};

export type ConsultaPlacaResponse = {
  placa: string;
  placa_alternativa?: string | null;
  uf: string | null;
  municipio?: string | null;
  marca: string | null;
  modelo: string | null;
  submodelo?: string | null;
  versao?: string | null;
  ano: string | number | null;
  ano_fabricacao?: number | null;
  ano_modelo?: number | null;
  cor: string | null;
  combustivel?: string | null;
  situacao: string | null;
  origem?: string | null;
  chassi?: string | null;
  logo?: string | null;
  extra: Record<string, unknown> | null;
  fipe: ConsultaPlacaFipe | null;
  fipe_score?: number | null;
  fipes?: ConsultaPlacaFipe[];
  raw: unknown;
};

export type ConsultaPlacaOutcome = {
  data: ConsultaPlacaResponse | null;
  error: string | null;
};

const CONSULTA_PLACA_TIMEOUT_MS = 6_000;

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function normalizePlate(value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeNullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseAnoPair(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { anoFab: value, anoMod: value };
  }

  if (typeof value !== "string") {
    return { anoFab: null, anoMod: null };
  }

  const matches = value.match(/\d{4}/g) ?? [];
  if (matches.length === 0) {
    return { anoFab: null, anoMod: null };
  }

  if (matches.length === 1) {
    const parsed = Number(matches[0]);
    return { anoFab: parsed, anoMod: parsed };
  }

  return {
    anoFab: Number(matches[0]),
    anoMod: Number(matches[1])
  };
}

function shouldTryConsultaPlaca(row: CarRowInput) {
  return Boolean(
    normalizePlate(row.placa) &&
      (!normalizeText(row.nome) ||
        !normalizeText(row.modelo_id) ||
        !normalizeText(row.cor) ||
        normalizeNullableNumber(row.ano_fab) == null ||
        normalizeNullableNumber(row.ano_mod) == null)
  );
}

function extractConsultaErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Falha ao consultar placa.";
  }

  const candidate = value as { error?: string; detail?: string; message?: string };
  return [candidate.error, candidate.message, candidate.detail].filter(Boolean).join(" | ") || "Falha ao consultar placa.";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getSupabaseFunctionApiKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
}

export async function callConsultaPlaca(
  placa: string
): Promise<ConsultaPlacaOutcome> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const functionApiKey = getSupabaseFunctionApiKey();
  const internalToken = process.env.EDGE_INTERNAL_KEY ?? null;

  if (!supabaseUrl || !functionApiKey || !internalToken) {
    return {
      data: null,
      error:
        "Variaveis de ambiente do Supabase ausentes para consultar placa. Configure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e EDGE_INTERNAL_KEY."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONSULTA_PLACA_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/consulta-placa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: functionApiKey,
        "x-rn-gestor-internal-token": internalToken
      },
      body: JSON.stringify({ placa }),
      signal: controller.signal
    });

    const json = (await response.json().catch(() => null)) as
      | ConsultaPlacaResponse
      | { error?: string; detail?: string; message?: string }
      | null;

    if (!response.ok) {
      return {
        data: null,
        error: extractConsultaErrorMessage(json)
      };
    }

    if (!json || typeof json !== "object" || !("placa" in json)) {
      return { data: null, error: "Resposta invalida da consulta de placa." };
    }

    return { data: json, error: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { data: null, error: "Tempo limite excedido na consulta de placa." };
    }

    return { data: null, error: error instanceof Error ? error.message : "Falha ao consultar placa." };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveModeloId(params: {
  supabase: AppSupabase;
  providedModeloInput: string | null;
  lookupModelo: string | null;
}) {
  const candidates = [params.providedModeloInput, params.lookupModelo].filter((value, index, list): value is string => {
    if (!value) return false;
    return list.indexOf(value) === index;
  });

  for (const candidate of candidates) {
    if (isUuidLike(candidate)) {
      const { data: existingById, error: existingByIdError } = await params.supabase
        .from("modelos")
        .select("id")
        .eq("id", candidate)
        .maybeSingle();

      if (existingByIdError) {
        throw new ApiHttpError(500, "CARRO_MODELO_LOOKUP_FAILED", "Falha ao localizar modelo informado.", existingByIdError);
      }

      if (existingById?.id) {
        return existingById.id;
      }
      continue;
    }

    const { data: existingByName, error: existingByNameError } = await params.supabase
      .from("modelos")
      .select("id, modelo")
      .ilike("modelo", candidate)
      .limit(1)
      .maybeSingle();

    if (existingByNameError) {
      throw new ApiHttpError(500, "CARRO_MODELO_LOOKUP_FAILED", "Falha ao localizar modelo informado.", existingByNameError);
    }

    if (existingByName?.id) {
      return existingByName.id;
    }
  }

  return null;
}

export async function enrichCarroInsertPayload(params: {
  supabase: AppSupabase;
  row: CarRowInput;
  requireModeloId?: boolean;
}) {
  const placa = normalizePlate(params.row.placa);
  const local = normalizeText(params.row.local);
  const estadoVenda = normalizeText(params.row.estado_venda);
  const lookup =
    shouldTryConsultaPlaca(params.row) && placa
      ? await callConsultaPlaca(placa)
      : { data: null, error: null };
  const lookupModelo = normalizeText(lookup.data?.modelo);
  const resolvedModeloId = await resolveModeloId({
    supabase: params.supabase,
    providedModeloInput: normalizeText(params.row.modelo_id),
    lookupModelo
  });

  if (!placa || !local || !estadoVenda || (params.requireModeloId !== false && !resolvedModeloId)) {
    throw new ApiHttpError(
      400,
      "INVALID_PAYLOAD",
      "Campos obrigatorios: placa, local, estado_venda e modelo_id. Se o modelo ainda nao existir, cadastre-o antes no botao +."
    );
  }

  const lookupYearsFromAno = parseAnoPair(lookup.data?.ano);
  const lookupYears = {
    anoFab: normalizeNullableNumber(lookup.data?.ano_fabricacao) ?? lookupYearsFromAno.anoFab,
    anoMod: normalizeNullableNumber(lookup.data?.ano_modelo) ?? lookupYearsFromAno.anoMod
  };
  const nome = normalizeText(params.row.nome) ?? lookupModelo;
  const cor = normalizeText(params.row.cor) ?? normalizeText(lookup.data?.cor);

  return {
    payload: {
      ...params.row,
      placa,
      local,
      estado_venda: estadoVenda,
      modelo_id: resolvedModeloId,
      nome,
      cor,
      ano_fab: normalizeNullableNumber(params.row.ano_fab) ?? lookupYears.anoFab,
      ano_mod: normalizeNullableNumber(params.row.ano_mod) ?? lookupYears.anoMod,
      hodometro: normalizeNullableNumber(params.row.hodometro),
      preco_original: normalizeNullableNumber(params.row.preco_original),
      data_entrada: normalizeText(params.row.data_entrada) ?? undefined
    },
    consultaPlaca: lookup.data,
    consultaPlacaErro: lookup.error
  };
}
