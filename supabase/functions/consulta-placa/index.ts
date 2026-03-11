// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

/**
 * Edge Function: consulta-placa
 * Consulta a API apiplacas.com.br e devolve um payload normalizado do veiculo.
 *
 * Configuracao:
 *   supabase secrets set API_PLACAS_TOKEN="seu_token_aqui"
 *   supabase secrets set EDGE_INTERNAL_KEY="seu_token_interno"
 *   deploy com verify_jwt = false
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rn-gestor-internal-token"
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizePlate(value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const digitsOnly = value.trim().replace(/[^\d,.-]/g, "").replace(",", ".");
  if (!digitsOnly) return null;

  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeYear(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 1900 && value < 3000) {
    return value;
  }

  if (typeof value !== "string") return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function getObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstNonNull<T>(...values: (T | null | undefined)[]) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return null;
}

function normalizeExtra(value: unknown) {
  const extra = getObject(value);
  return extra ? { ...extra } : null;
}

function collectFipeEntries(source: unknown, bucket: Record<string, unknown>[]) {
  if (!source) return;

  if (Array.isArray(source)) {
    for (const item of source) {
      collectFipeEntries(item, bucket);
    }
    return;
  }

  const object = getObject(source);
  if (!object) return;

  const directCandidate =
    "codigo_fipe" in object ||
    "texto_modelo" in object ||
    "texto_valor" in object ||
    "score" in object ||
    "codigoModelo" in object ||
    "codigoFipe" in object;

  if (directCandidate) {
    bucket.push(object);
  }

  for (const key of ["dados", "data", "lista", "result", "resultado", "fipe", "fipes"]) {
    if (key in object) {
      collectFipeEntries(object[key], bucket);
    }
  }
}

function normalizeFipeEntry(entry: Record<string, unknown>) {
  const normalized = {
    codigo_fipe: normalizeText(firstNonNull(entry.codigo_fipe, entry.codigoFipe)),
    codigo_marca: normalizeNumber(firstNonNull(entry.codigo_marca, entry.codigoMarca)),
    codigo_modelo: normalizeText(firstNonNull(entry.codigo_modelo, entry.codigoModelo)),
    ano_modelo: normalizeYear(firstNonNull(entry.ano_modelo, entry.anoModelo)),
    combustivel: normalizeText(entry.combustivel),
    id_valor: normalizeNumber(firstNonNull(entry.id_valor, entry.idValor)),
    mes_referencia: normalizeText(firstNonNull(entry.mes_referencia, entry.mesReferencia)),
    referencia_fipe: normalizeNumber(firstNonNull(entry.referencia_fipe, entry.referenciaFipe)),
    score: normalizeNumber(entry.score),
    sigla_combustivel: normalizeText(firstNonNull(entry.sigla_combustivel, entry.siglaCombustivel)),
    texto_marca: normalizeText(firstNonNull(entry.texto_marca, entry.textoMarca)),
    texto_modelo: normalizeText(firstNonNull(entry.texto_modelo, entry.textoModelo)),
    texto_valor: normalizeText(firstNonNull(entry.texto_valor, entry.textoValor)),
    tipo_modelo: normalizeNumber(firstNonNull(entry.tipo_modelo, entry.tipoModelo)),
    raw: entry
  };

  const hasMeaningfulData = Object.entries(normalized).some(([key, value]) => key !== "raw" && value !== null);
  return hasMeaningfulData ? normalized : null;
}

function normalizeFipes(data: Record<string, unknown>) {
  const entries: Record<string, unknown>[] = [];

  for (const candidate of [data.fipe, data.FIPE, data.fipes, data.fipe_dados, data.fipeDados]) {
    collectFipeEntries(candidate, entries);
  }

  const uniqueBySignature = new Map<string, ReturnType<typeof normalizeFipeEntry>>();

  for (const entry of entries) {
    const normalized = normalizeFipeEntry(entry);
    if (!normalized) continue;

    const signature = JSON.stringify([
      normalized.codigo_fipe,
      normalized.codigo_modelo,
      normalized.ano_modelo,
      normalized.combustivel,
      normalized.texto_modelo,
      normalized.texto_valor,
      normalized.score
    ]);

    if (!uniqueBySignature.has(signature)) {
      uniqueBySignature.set(signature, normalized);
    }
  }

  const fipes = Array.from(uniqueBySignature.values()).sort((left, right) => {
    const scoreDiff = (right?.score ?? -1) - (left?.score ?? -1);
    if (scoreDiff !== 0) return scoreDiff;

    const modeloDiff = Number(Boolean(right?.texto_modelo)) - Number(Boolean(left?.texto_modelo));
    if (modeloDiff !== 0) return modeloDiff;

    return Number(Boolean(right?.texto_valor)) - Number(Boolean(left?.texto_valor));
  });

  return {
    fipe: fipes[0] ?? null,
    fipes
  };
}

function buildAnoPayload(data: Record<string, unknown>, extra: Record<string, unknown> | null, fipe: ReturnType<typeof normalizeFipeEntry>) {
  const anoFabricacao = firstNonNull(
    normalizeYear(data.ano_fabricacao),
    normalizeYear(data.anoFabricacao),
    normalizeYear(extra?.ano_fabricacao),
    normalizeYear(data.ano)
  );

  const anoModelo = firstNonNull(
    normalizeYear(data.ano_modelo),
    normalizeYear(data.anoModelo),
    normalizeYear(extra?.ano_modelo),
    fipe?.ano_modelo,
    anoFabricacao
  );

  let ano = null;
  if (anoFabricacao && anoModelo) {
    ano = anoFabricacao === anoModelo ? String(anoFabricacao) : `${anoFabricacao}/${anoModelo}`;
  } else if (anoFabricacao) {
    ano = String(anoFabricacao);
  } else if (anoModelo) {
    ano = String(anoModelo);
  } else {
    ano = normalizeText(data.ano);
  }

  return {
    ano,
    ano_fabricacao: anoFabricacao,
    ano_modelo: anoModelo
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const expectedInternalToken = Deno.env.get("EDGE_INTERNAL_KEY");
    if (!expectedInternalToken) {
      return new Response(
        JSON.stringify({
          error: "Secret interna nao configurada. Use supabase secrets set EDGE_INTERNAL_KEY."
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const providedInternalToken = req.headers.get("x-rn-gestor-internal-token");
    if (providedInternalToken !== expectedInternalToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { searchParams } = new URL(req.url);
    const method = req.method.toUpperCase();

    const placa =
      method === "GET"
        ? normalizePlate(searchParams.get("placa"))
        : normalizePlate((await req.json().catch(() => ({}))).placa);

    if (!placa) {
      return new Response(JSON.stringify({ error: 'Parametro "placa" e obrigatorio.' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const placaRegex = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
    if (!placaRegex.test(placa)) {
      return new Response(JSON.stringify({ error: "Placa invalida. Use o formato AAA0X00 ou AAA9999." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const token = Deno.env.get("API_PLACAS_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({
          error: "Token da API nao configurado. Use supabase secrets set API_PLACAS_TOKEN."
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const apiUrl = `https://wdapi2.com.br/consulta/${placa}/${token}`;
    const response = await fetch(apiUrl);
    const text = await response.text();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Erro na API Placas (${response.status})`,
          detail: text
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const data = JSON.parse(text) as Record<string, unknown>;
    const extra = normalizeExtra(firstNonNull(data.extra, data.EXTRA));
    const { fipe, fipes } = normalizeFipes(data);
    const anos = buildAnoPayload(data, extra, fipe);

    const result = {
      placa: normalizePlate(firstNonNull(data.placa, extra?.placa_modelo_novo, extra?.placa, placa)) ?? placa,
      placa_alternativa: normalizePlate(firstNonNull(data.placa_alternativa, extra?.placa_modelo_antigo)),
      uf: normalizeText(firstNonNull(data.uf, extra?.uf, extra?.uf_placa)),
      municipio: normalizeText(firstNonNull(data.municipio, extra?.municipio)),
      marca: normalizeText(firstNonNull(data.marca, data.MARCA)),
      modelo: normalizeText(firstNonNull(data.modelo, data.MODELO)),
      submodelo: normalizeText(firstNonNull(data.submodelo, data.SUBMODELO)),
      versao: normalizeText(firstNonNull(data.versao, data.VERSAO)),
      ano: anos.ano,
      ano_fabricacao: anos.ano_fabricacao,
      ano_modelo: anos.ano_modelo,
      cor: normalizeText(firstNonNull(data.cor, extra?.cor)),
      combustivel: normalizeText(firstNonNull(extra?.combustivel, fipe?.combustivel)),
      situacao: normalizeText(firstNonNull(data.situacao, data.mensagemRetorno, extra?.situacao_veiculo)),
      origem: normalizeText(firstNonNull(data.origem, extra?.nacionalidade)),
      chassi: normalizeText(data.chassi),
      logo: normalizeText(data.logo),
      extra,
      fipe,
      fipe_score: fipe?.score ?? null,
      fipes,
      raw: data
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("Erro na consulta:", err);
    return new Response(
      JSON.stringify({
        error: "Erro interno ao consultar placa.",
        detail: err?.message ?? String(err)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
