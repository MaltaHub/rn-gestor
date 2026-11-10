"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestAuth } from "@/components/ui-grid/types";
import { fetchVeiculosVendedor } from "@/components/vendedor/api";
import type { ContagemSituacoes, ListaVeiculosVendedor, OrdemLista, SituacaoFiltro, VeiculoVendedorItem } from "@/lib/domain/vendedor/types";

/**
 * Lista paginada de veículos do vendedor com busca (debounce), rolagem infinita
 * e contagem por situação. Requisições antigas são CANCELADAS (AbortController)
 * em vez de ignoradas. A 1ª página fica em memória por aba: voltar ao Início,
 * ao Vender ou ao Word mostra a lista na hora e atualiza por trás.
 */
const PAGE_SIZE = 30;
const cache = new Map<string, ListaVeiculosVendedor>();
let contagensCache: ContagemSituacoes | null = null;

export function useVeiculosVendedor(
  auth: RequestAuth,
  options: { situacao: SituacaoFiltro; q: string; ordem?: OrdemLista | null; enabled?: boolean }
) {
  const { situacao, enabled = true } = options;
  const ordem = options.ordem ?? null;
  const [debouncedQ, setDebouncedQ] = useState(options.q.trim());
  const key = `${situacao}|${ordem ?? ""}|${debouncedQ}`;
  const inicial = cache.get(key);

  const [itens, setItens] = useState<VeiculoVendedorItem[]>(inicial?.itens ?? []);
  const [total, setTotal] = useState(inicial?.total ?? 0);
  const [contagens, setContagens] = useState<ContagemSituacoes | null>(contagensCache);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!inicial);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQ(options.q.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [options.q]);

  const load = useCallback(
    async (nextPage: number, withCounts: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchVeiculosVendedor(auth, {
          situacao,
          q: debouncedQ,
          ordem,
          page: nextPage,
          pageSize: PAGE_SIZE,
          contagens: withCounts,
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        setItens((prev) => (nextPage === 1 ? data.itens : [...prev, ...data.itens.filter((item) => !prev.some((p) => p.carroId === item.carroId))]));
        setTotal(data.total);
        setPage(nextPage);
        if (data.contagens) {
          contagensCache = data.contagens;
          setContagens(data.contagens);
        }
        if (nextPage === 1) cache.set(`${situacao}|${ordem ?? ""}|${debouncedQ}`, data);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar os veículos.");
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [auth, situacao, ordem, debouncedQ]
  );

  // Troca de filtro/busca: mostra o cache (se houver) e revalida a 1ª página.
  useEffect(() => {
    if (!enabled) return;
    const emCache = cache.get(key);
    if (emCache) {
      setItens(emCache.itens);
      setTotal(emCache.total);
    } else {
      setItens([]);
      setTotal(0);
    }
    void load(1, contagensCache == null);
    return () => abortRef.current?.abort();
  }, [enabled, key, load]);

  const hasMore = itens.length < total;

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void load(page + 1, false);
  }, [hasMore, load, loading, page]);

  /** Recarrega a 1ª página e as contagens (depois de vender/entregar/cancelar). */
  const reload = useCallback(() => {
    cache.clear();
    void load(1, true);
  }, [load]);

  return { itens, total, contagens, loading, error, hasMore, loadMore, reload, buscando: debouncedQ.length > 0 };
}
