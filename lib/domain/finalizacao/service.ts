import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiHttpError } from "@/lib/api/errors";
import { deleteStoredObjects, listFolderSubtreeFileRows } from "@/lib/files/service";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Finalizacao de vendidos (aprovada em 2026-11-06):
 *  - 90 dias depois de carros.data_venda o veiculo e apagado com todos os dados;
 *    antes, fn_finalizar_veiculo grava o snapshot em `finalizados` e repassa os
 *    ponteiros de troca para ele;
 *  - fotos saem do storage aqui (o banco sozinho nao apaga o objeto);
 *  - documentos ficam na pasta arquivada por 5 anos (documentos_expiram_em) e
 *    depois saem do storage.
 * Disparo: pg_cron -> POST /api/v1/internal/finalizacao (token interno).
 * Liga/desliga: internal.app_settings.finalizacao_ativa (desligada = so relatorio).
 */

type FinalizacaoSupabase = SupabaseClient<Database>;

export const DIAS_PARA_FINALIZAR = 90;
/** Veiculos por execucao (o cron roda de hora em hora). */
export const LOTE_FINALIZACAO = 10;

export type FinalizacaoCandidato = { carroId: string; placa: string; dataVenda: string; dias: number };

export type FinalizacaoResultado = {
  ativa: boolean;
  elegiveis: FinalizacaoCandidato[];
  semDataVenda: Array<{ carroId: string; placa: string }>;
  finalizados: string[];
  falhas: Array<{ placa: string; erro: string }>;
  documentosExpirados: number;
};

/** Hoje no fuso da loja (America/Sao_Paulo), como YYYY-MM-DD. */
export function hojeNaLoja(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function dataLimiteFinalizacao(hoje: string, dias = DIAS_PARA_FINALIZAR) {
  const [year, month, day] = hoje.split("-").map(Number);
  const limite = new Date(Date.UTC(year, month - 1, day - dias));
  return limite.toISOString().slice(0, 10);
}

export function diasDesde(data: string, hoje: string) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(hoje) - toUtc(data)) / 86_400_000);
}

async function listarVendidos(supabase: FinalizacaoSupabase) {
  const { data, error } = await supabase
    .from("carros")
    .select("id, placa, data_venda")
    .eq("estado_venda", "VENDIDO")
    .order("data_venda", { ascending: true, nullsFirst: false });
  if (error) throw new ApiHttpError(500, "FINALIZACAO_LISTAR_FALHOU", "Falha ao listar vendidos.", error);
  return data ?? [];
}

/** Apaga a pasta (e subpastas) com os arquivos do storage. Storage primeiro: se falhar, nada some do índice. */
async function apagarPastaComArquivos(supabase: FinalizacaoSupabase, folderId: string) {
  const { files } = await listFolderSubtreeFileRows(supabase, folderId);
  await deleteStoredObjects(
    supabase,
    files.map((file) => file.storage_path)
  );
  const { error } = await supabase.from("arquivos_pastas").delete().eq("id", folderId);
  if (error) throw new ApiHttpError(500, "FINALIZACAO_PASTA_FALHOU", "Falha ao apagar a pasta.", error);
  return files.length;
}

async function finalizarVeiculo(supabase: FinalizacaoSupabase, carroId: string) {
  const { data: fotos, error } = await supabase
    .from("arquivo_automacao_folders")
    .select("folder_id")
    .eq("automation_key", "vehicle_photos")
    .eq("carro_id", carroId);
  if (error) throw new ApiHttpError(500, "FINALIZACAO_FOTOS_FALHOU", "Falha ao localizar as fotos.", error);
  for (const pasta of fotos ?? []) {
    if (pasta.folder_id) await apagarPastaComArquivos(supabase, pasta.folder_id);
  }

  const { error: rpcError } = await supabase.rpc("fn_finalizar_veiculo", { p_carro_id: carroId });
  if (rpcError) throw new ApiHttpError(500, "FINALIZACAO_FALHOU", rpcError.message, rpcError);
}

/** Documentos com 5 anos: saem do storage e o snapshot perde o vínculo da pasta. */
async function expirarDocumentos(supabase: FinalizacaoSupabase, hoje: string) {
  const { data, error } = await supabase
    .from("finalizados")
    .select("id, documentos_pasta_id")
    .not("documentos_pasta_id", "is", null)
    .lt("documentos_expiram_em", hoje)
    .limit(LOTE_FINALIZACAO);
  if (error) throw new ApiHttpError(500, "FINALIZACAO_EXPIRADOS_FALHOU", "Falha ao listar documentos expirados.", error);
  let total = 0;
  for (const row of data ?? []) {
    if (!row.documentos_pasta_id) continue;
    await apagarPastaComArquivos(supabase, row.documentos_pasta_id);
    await supabase.from("finalizados").update({ documentos_pasta_id: null }).eq("id", row.id);
    total += 1;
  }
  return total;
}

/**
 * Uma execução: relatório sempre; com a rotina ATIVA, finaliza um lote e expira
 * documentos vencidos. Falha num veículo não para os demais.
 */
export async function executarFinalizacao(supabase: FinalizacaoSupabase, options: { ativa: boolean; now?: Date }): Promise<FinalizacaoResultado> {
  const hoje = hojeNaLoja(options.now);
  const limite = dataLimiteFinalizacao(hoje);
  const vendidos = await listarVendidos(supabase);

  const elegiveis = vendidos
    .filter((carro): carro is typeof carro & { data_venda: string } => Boolean(carro.data_venda) && String(carro.data_venda) <= limite)
    .map((carro) => ({ carroId: carro.id, placa: String(carro.placa), dataVenda: carro.data_venda, dias: diasDesde(carro.data_venda, hoje) }));
  const semDataVenda = vendidos.filter((carro) => !carro.data_venda).map((carro) => ({ carroId: carro.id, placa: String(carro.placa) }));

  const resultado: FinalizacaoResultado = { ativa: options.ativa, elegiveis, semDataVenda, finalizados: [], falhas: [], documentosExpirados: 0 };
  if (!options.ativa) return resultado;

  for (const candidato of elegiveis.slice(0, LOTE_FINALIZACAO)) {
    try {
      await finalizarVeiculo(supabase, candidato.carroId);
      resultado.finalizados.push(candidato.placa);
    } catch (error) {
      resultado.falhas.push({ placa: candidato.placa, erro: error instanceof Error ? error.message : "falha" });
    }
  }
  resultado.documentosExpirados = await expirarDocumentos(supabase, hoje);
  return resultado;
}
