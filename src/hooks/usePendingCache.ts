
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

export interface PendingCacheData {
  tasks: any[];
  insights: any[];
  unpublishedAds: any[];
  lastUpdated: string;
}

export interface UsePendingCacheOptions {
  staleTime?: number;
  cacheTime?: number;
  refetchInterval?: number;
  enabled?: boolean;
}

export const usePendingCache = (options: UsePendingCacheOptions = {}) => {
  const { currentStore } = useStore();
  const queryClient = useQueryClient();
  
  const {
    staleTime = 2 * 60 * 1000, // 2 minutos
    cacheTime = 10 * 60 * 1000, // 10 minutos
    refetchInterval = 5 * 60 * 1000, // 5 minutos
    enabled = true
  } = options;

  // Query para tarefas
  const tasksQuery = useQuery({
    queryKey: ["pending-tasks", currentStore],
    queryFn: async () => {
      console.log('PendingCache - Buscando tarefas para loja:', currentStore);
      const { data, error } = await supabase
        .from("tasks")
        .select("*, vehicles:vehicle_id(id, plate, model, image_url)")
        .eq("completed", false)
        .eq("store", currentStore)
        .order("prioridade", { ascending: false });
      
      if (error) {
        console.error('PendingCache - Erro ao buscar tarefas:', error);
        throw error;
      }
      
      console.log('PendingCache - Tarefas encontradas:', data?.length || 0);
      return data || [];
    },
    staleTime,
    gcTime: cacheTime,
    refetchInterval,
    enabled,
    meta: {
      persist: true
    }
  });

  // Query para insights
  const insightsQuery = useQuery({
    queryKey: ["pending-insights", currentStore],
    queryFn: async () => {
      console.log('PendingCache - Buscando insights para loja:', currentStore);
      const { data, error } = await supabase
        .from("advertisement_insights")
        .select("*, vehicles:vehicle_id(id, plate, model, image_url)")
        .eq("resolved", false)
        .eq("store", currentStore)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error('PendingCache - Erro ao buscar insights:', error);
        throw error;
      }
      
      console.log('PendingCache - Insights encontrados:', data?.length || 0);
      return data || [];
    },
    staleTime,
    gcTime: cacheTime,
    refetchInterval,
    enabled,
    meta: {
      persist: true
    }
  });

  // Query para anúncios não publicados
  const unpublishedAdsQuery = useQuery({
    queryKey: ["pending-unpublished-ads", currentStore],
    queryFn: async () => {
      console.log('PendingCache - Buscando anúncios não publicados para loja:', currentStore);
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .eq("publicado", false)
        .eq("store", currentStore)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error('PendingCache - Erro ao buscar anúncios:', error);
        throw error;
      }
      
      console.log('PendingCache - Anúncios encontrados:', data?.length || 0);
      return data || [];
    },
    staleTime,
    gcTime: cacheTime,
    refetchInterval,
    enabled,
    meta: {
      persist: true
    }
  });

  // Cache aggregado
  const aggregatedData = useMemo<PendingCacheData>(() => ({
    tasks: tasksQuery.data || [],
    insights: insightsQuery.data || [],
    unpublishedAds: unpublishedAdsQuery.data || [],
    lastUpdated: new Date().toISOString()
  }), [tasksQuery.data, insightsQuery.data, unpublishedAdsQuery.data]);

  // Estados consolidados
  const isLoading = tasksQuery.isLoading || insightsQuery.isLoading || unpublishedAdsQuery.isLoading;
  const isError = tasksQuery.isError || insightsQuery.isError || unpublishedAdsQuery.isError;
  const isFetching = tasksQuery.isFetching || insightsQuery.isFetching || unpublishedAdsQuery.isFetching;

  // Função para invalidar todo o cache
  const invalidateCache = useCallback(() => {
    console.log('PendingCache - Invalidando cache para loja:', currentStore);
    queryClient.invalidateQueries({ queryKey: ["pending-tasks", currentStore] });
    queryClient.invalidateQueries({ queryKey: ["pending-insights", currentStore] });
    queryClient.invalidateQueries({ queryKey: ["pending-unpublished-ads", currentStore] });
  }, [queryClient, currentStore]);

  // Função para refresh forçado - CORRIGIDA
  const refetch = useCallback(async () => {
    console.log('PendingCache - Forçando refresh para loja:', currentStore);
    await Promise.all([
      tasksQuery.refetch(),
      insightsQuery.refetch(),
      unpublishedAdsQuery.refetch()
    ]);
  }, [tasksQuery, insightsQuery, unpublishedAdsQuery, currentStore]);

  // Função para invalidar cache específico
  const invalidateSpecificCache = useCallback((type: 'tasks' | 'insights' | 'ads') => {
    console.log('PendingCache - Invalidando cache específico:', type);
    switch (type) {
      case 'tasks':
        queryClient.invalidateQueries({ queryKey: ["pending-tasks", currentStore] });
        break;
      case 'insights':
        queryClient.invalidateQueries({ queryKey: ["pending-insights", currentStore] });
        break;
      case 'ads':
        queryClient.invalidateQueries({ queryKey: ["pending-unpublished-ads", currentStore] });
        break;
    }
  }, [queryClient, currentStore]);

  // Prefetch para próxima loja
  const prefetchForStore = useCallback((store: string) => {
    console.log('PendingCache - Prefetch para loja:', store);
    queryClient.prefetchQuery({
      queryKey: ["pending-tasks", store],
      staleTime: staleTime
    });
    queryClient.prefetchQuery({
      queryKey: ["pending-insights", store],
      staleTime: staleTime
    });
    queryClient.prefetchQuery({
      queryKey: ["pending-unpublished-ads", store],
      staleTime: staleTime
    });
  }, [queryClient, staleTime]);

  // Métricas de cache
  const cacheMetrics = useMemo(() => ({
    totalItems: aggregatedData.tasks.length + aggregatedData.insights.length + aggregatedData.unpublishedAds.length,
    tasksCount: aggregatedData.tasks.length,
    insightsCount: aggregatedData.insights.length,
    unpublishedAdsCount: aggregatedData.unpublishedAds.length,
    isStale: tasksQuery.isStale || insightsQuery.isStale || unpublishedAdsQuery.isStale,
    lastFetched: {
      tasks: tasksQuery.dataUpdatedAt,
      insights: insightsQuery.dataUpdatedAt,
      unpublishedAds: unpublishedAdsQuery.dataUpdatedAt
    }
  }), [aggregatedData, tasksQuery, insightsQuery, unpublishedAdsQuery]);

  return {
    // Dados
    data: aggregatedData,
    
    // Estados
    isLoading,
    isError,
    isFetching,
    
    // Queries individuais (para casos específicos)
    tasksQuery,
    insightsQuery,
    unpublishedAdsQuery,
    
    // Funções de controle
    invalidateCache,
    refetch, // ADICIONADA
    forceRefresh: refetch, // Alias para compatibilidade
    invalidateSpecificCache,
    prefetchForStore,
    
    // Métricas
    metrics: cacheMetrics
  };
};
