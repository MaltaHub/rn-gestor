import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchExplorerIndex } from "@/components/files/api";
import { buildExplorerModel } from "@/components/files/explorer/model";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { ExplorerIndex } from "@/lib/files/explorer-types";

/** Revalida em segundo plano se o índice tiver mais que isto ao voltar o foco. */
const STALE_AFTER_MS = 60_000;
/** Espera após a última mutação antes de reconciliar com o servidor. */
const REVALIDATE_DEBOUNCE_MS = 1_500;

// Sobrevive à troca de tela no app (navegação client-side): voltar para
// Arquivos mostra o índice na hora e só revalida em segundo plano.
let cachedIndex: { index: ExplorerIndex; fetchedAt: number } | null = null;

export function useExplorerIndex(auth: RequestAuth) {
  const [index, setIndex] = useState<ExplorerIndex | null>(() => cachedIndex?.index ?? null);
  const [loading, setLoading] = useState(!cachedIndex);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authRef = useRef(auth);
  authRef.current = auth;
  const fetchedAtRef = useRef(cachedIndex?.fetchedAt ?? 0);
  // Mutações em voo/recentes: uma revalidação iniciada antes delas não pode
  // sobrescrever o estado otimista.
  const mutationEpochRef = useRef(0);
  const inFlightMutationsRef = useRef(0);
  const revalidateTimerRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);

  const commit = useCallback((next: ExplorerIndex) => {
    cachedIndex = { index: next, fetchedAt: fetchedAtRef.current };
    setIndex(next);
  }, []);

  const refresh = useCallback(
    async (mode: "foreground" | "background" = "background") => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      const epochAtStart = mutationEpochRef.current;
      if (mode === "foreground") setRefreshing(true);
      try {
        const next = await fetchExplorerIndex(authRef.current);
        if (epochAtStart !== mutationEpochRef.current || inFlightMutationsRef.current > 0) return;
        fetchedAtRef.current = Date.now();
        commit(next);
        setError(null);
      } catch (nextError) {
        if (!cachedIndex) setError(nextError instanceof Error ? nextError.message : "Falha ao carregar arquivos.");
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [commit]
  );

  useEffect(() => {
    void refresh(cachedIndex ? "background" : "foreground");
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - fetchedAtRef.current > STALE_AFTER_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (revalidateTimerRef.current) window.clearTimeout(revalidateTimerRef.current);
    };
  }, [refresh]);

  const scheduleRevalidate = useCallback(() => {
    if (revalidateTimerRef.current) window.clearTimeout(revalidateTimerRef.current);
    revalidateTimerRef.current = window.setTimeout(() => {
      revalidateTimerRef.current = null;
      if (inFlightMutationsRef.current > 0) {
        scheduleRevalidate();
        return;
      }
      void refresh();
    }, REVALIDATE_DEBOUNCE_MS);
  }, [refresh]);

  /** Aplica uma mudança local (otimista ou resultado do servidor). */
  const update = useCallback(
    (mutate: (current: ExplorerIndex) => ExplorerIndex) => {
      mutationEpochRef.current += 1;
      setIndex((current) => {
        if (!current) return current;
        const next = mutate(current);
        cachedIndex = { index: next, fetchedAt: fetchedAtRef.current };
        return next;
      });
    },
    []
  );

  /**
   * Envolve uma mutação: aplica o otimista, roda a chamada e, em caso de erro,
   * reverte para o estado anterior. Depois reconcilia com o servidor
   * (automações do banco podem mudar capa, nomes etc.).
   */
  const mutate = useCallback(
    async <T,>(options: {
      optimistic?: (current: ExplorerIndex) => ExplorerIndex;
      run: () => Promise<T>;
      apply?: (current: ExplorerIndex, result: T) => ExplorerIndex;
    }): Promise<T> => {
      const snapshot = cachedIndex?.index ?? null;
      inFlightMutationsRef.current += 1;
      if (options.optimistic) update(options.optimistic);
      try {
        const result = await options.run();
        if (options.apply) {
          const apply = options.apply;
          update((current) => apply(current, result));
        }
        return result;
      } catch (nextError) {
        if (snapshot && options.optimistic) {
          mutationEpochRef.current += 1;
          commit(snapshot);
        }
        throw nextError;
      } finally {
        inFlightMutationsRef.current -= 1;
        scheduleRevalidate();
      }
    },
    [commit, scheduleRevalidate, update]
  );

  const model = useMemo(() => (index ? buildExplorerModel(index) : null), [index]);

  return { index, model, loading, refreshing, error, refresh, update, mutate, scheduleRevalidate };
}
