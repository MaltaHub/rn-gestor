import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPLORER_SIGNED_URL_TTL_SECONDS, signExplorerFileUrls } from "@/lib/files/explorer-service";
import { signPreviewUrlsByFileIds } from "@/lib/files/service";
import type { Database } from "@/lib/supabase/database.types";

type FilesSupabase = SupabaseClient<Database>;

/**
 * Capas dos veículos em MINIATURA (400px, ~20 KB em vez da foto original) para
 * as listas do vendedor. A URL assinada fica em memória até perto de expirar:
 * a mesma capa volta com a MESMA URL entre requisições, e o navegador reusa o
 * cache em vez de baixar de novo a cada busca/página.
 */
const MARGEM_MS = 10 * 60 * 1000;
const MAX_ENTRADAS = 3000;
const cache = new Map<string, { url: string | null; expiraEm: number }>();

function lerCache(id: string, agora: number): string | null | undefined {
  const entrada = cache.get(id);
  if (!entrada) return undefined;
  if (entrada.expiraEm <= agora) {
    cache.delete(id);
    return undefined;
  }
  return entrada.url;
}

function gravarCache(id: string, url: string | null, agora: number) {
  if (cache.size >= MAX_ENTRADAS) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga) cache.delete(maisAntiga);
  }
  cache.set(id, { url, expiraEm: agora + EXPLORER_SIGNED_URL_TTL_SECONDS * 1000 - MARGEM_MS });
}

export async function signCoverThumbs(supabase: FilesSupabase, fileIds: Array<string | null | undefined>): Promise<Record<string, string | null>> {
  const agora = Date.now();
  const ids = Array.from(new Set(fileIds.filter((id): id is string => typeof id === "string" && id.length > 0)));
  const result: Record<string, string | null> = {};
  const faltando: string[] = [];

  for (const id of ids) {
    const emCache = lerCache(id, agora);
    if (emCache === undefined) faltando.push(id);
    else result[id] = emCache;
  }
  if (faltando.length === 0) return result;

  const assinadas = await signExplorerFileUrls(supabase, faltando, "thumb");
  // Formato sem miniatura (ex.: HEIC) ou miniaturas desligadas: cai na original.
  const semThumb = faltando.filter((id) => !assinadas.urls[id]?.url && !assinadas.urls[id]?.missing);
  const originais = semThumb.length > 0 ? await signPreviewUrlsByFileIds(supabase, semThumb) : {};

  for (const id of faltando) {
    const url = assinadas.urls[id]?.url ?? originais[id] ?? null;
    result[id] = url;
    // Falha não entra no cache: a próxima lista tenta de novo.
    if (url) gravarCache(id, url, agora);
  }
  return result;
}
