
import { useState, useMemo, useCallback } from 'react';
import { usePendingCache } from './usePendingCache';

export interface PaginationConfig {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface FilterConfig {
  store: string;
  type: string;
  priority: string;
  search: string;
}

export interface UsePaginatedPendingsOptions {
  initialPageSize?: number;
  enableVirtualization?: boolean;
}

export const usePaginatedPendings = (options: UsePaginatedPendingsOptions = {}) => {
  const { initialPageSize = 25 } = options;
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filters, setFilters] = useState<FilterConfig>({
    store: 'all',
    type: 'all',
    priority: 'all',
    search: ''
  });

  // Hook de cache otimizado
  const {
    data: cacheData,
    isLoading,
    isError,
    isFetching,
    invalidateCache,
    forceRefresh,
    metrics
  } = usePendingCache({
    staleTime: 2 * 60 * 1000, // 2 minutos
    refetchInterval: 5 * 60 * 1000 // 5 minutos
  });

  // Dados filtrados e transformados
  const filteredData = useMemo(() => {
    let allItems: any[] = [];

    console.log('PaginatedPendings - Aplicando filtros:', filters);
    console.log('PaginatedPendings - Dados do cache:', {
      tasks: cacheData.tasks.length,
      insights: cacheData.insights.length,
      unpublishedAds: cacheData.unpublishedAds.length
    });

    // Adicionar tarefas
    if (filters.type === 'all' || filters.type === 'tasks') {
      const filteredTasks = cacheData.tasks.filter(task => {
        const matchesStore = filters.store === 'all' || task.store === filters.store;
        const matchesPriority = filters.priority === 'all' || task.prioridade === filters.priority;
        const matchesSearch = !filters.search || 
          task.title?.toLowerCase().includes(filters.search.toLowerCase()) ||
          task.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
          task.vehicles?.plate?.toLowerCase().includes(filters.search.toLowerCase());
        
        return matchesStore && matchesPriority && matchesSearch;
      });
      
      allItems = [...allItems, ...filteredTasks.map(task => ({
        ...task,
        type: 'task',
        itemId: task.id,
        title: task.title,
        description: task.description,
        plate: task.vehicles?.plate,
        priority: task.prioridade,
        store: task.store,
        createdAt: task.created_at,
        vehicleId: task.vehicle_id
      }))];
    }

    // Adicionar insights
    if (filters.type === 'all' || filters.type === 'insights') {
      const filteredInsights = cacheData.insights.filter(insight => {
        const matchesStore = filters.store === 'all' || insight.store === filters.store;
        const matchesSearch = !filters.search || 
          insight.insight_type?.toLowerCase().includes(filters.search.toLowerCase()) ||
          insight.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
          insight.vehicles?.plate?.toLowerCase().includes(filters.search.toLowerCase());
        
        return matchesStore && matchesSearch;
      });
      
      allItems = [...allItems, ...filteredInsights.map(insight => ({
        ...insight,
        type: 'insight',
        itemId: insight.id,
        title: insight.insight_type,
        description: insight.description,
        plate: insight.vehicles?.plate,
        priority: 'normal',
        store: insight.store,
        createdAt: insight.created_at,
        vehicleId: insight.vehicle_id,
        insightId: insight.id
      }))];
    }

    // Adicionar anúncios não publicados
    if (filters.type === 'all' || filters.type === 'advertisements') {
      const filteredAds = cacheData.unpublishedAds.filter(ad => {
        const matchesStore = filters.store === 'all' || ad.store === filters.store;
        const matchesSearch = !filters.search || 
          ad.platform?.toLowerCase().includes(filters.search.toLowerCase()) ||
          ad.id_ancora?.toLowerCase().includes(filters.search.toLowerCase()) ||
          ad.vehicle_plates?.some((plate: string) => 
            plate.toLowerCase().includes(filters.search.toLowerCase())
          );
        
        return matchesStore && matchesSearch;
      });
      
      allItems = [...allItems, ...filteredAds.map(ad => ({
        ...ad,
        type: 'advertisement',
        itemId: ad.id,
        title: `Publicar anúncio na ${ad.platform}`,
        description: ad.description,
        plate: ad.vehicle_plates?.[0],
        priority: 'normal',
        store: ad.store,
        createdAt: ad.created_at,
        advertisementId: ad.id
      }))];
    }

    const sorted = allItems.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    console.log('PaginatedPendings - Itens filtrados:', sorted.length);
    return sorted;
  }, [cacheData, filters]);

  // Configuração de paginação
  const paginationConfig = useMemo<PaginationConfig>(() => {
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    
    return {
      page: currentPage,
      pageSize,
      totalItems,
      totalPages
    };
  }, [filteredData.length, pageSize, currentPage]);

  // Dados paginados
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    console.log('PaginatedPendings - Paginação:', {
      startIndex,
      endIndex,
      total: filteredData.length
    });
    
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, currentPage, pageSize]);

  // Funções de controle
  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(1, Math.min(page, paginationConfig.totalPages));
    console.log('PaginatedPendings - Indo para página:', validPage);
    setCurrentPage(validPage);
  }, [paginationConfig.totalPages]);

  const changePageSize = useCallback((newSize: number) => {
    console.log('PaginatedPendings - Mudando tamanho da página:', newSize);
    setPageSize(newSize);
    setCurrentPage(1); // Reset para primeira página
  }, []);

  const updateFilters = useCallback((newFilters: Partial<FilterConfig>) => {
    console.log('PaginatedPendings - Atualizando filtros:', newFilters);
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset para primeira página
  }, []);

  const resetFilters = useCallback(() => {
    console.log('PaginatedPendings - Resetando filtros');
    setFilters({
      store: 'all',
      type: 'all',
      priority: 'all',
      search: ''
    });
    setCurrentPage(1);
  }, []);

  // Navegação rápida
  const goToFirstPage = useCallback(() => goToPage(1), [goToPage]);
  const goToLastPage = useCallback(() => goToPage(paginationConfig.totalPages), [goToPage, paginationConfig.totalPages]);
  const goToNextPage = useCallback(() => goToPage(currentPage + 1), [goToPage, currentPage]);
  const goToPreviousPage = useCallback(() => goToPage(currentPage - 1), [goToPage, currentPage]);

  // Métricas consolidadas
  const consolidatedMetrics = useMemo(() => ({
    ...metrics,
    filteredCount: filteredData.length,
    currentPageItems: paginatedData.length,
    filterApplied: Object.values(filters).some(value => value !== 'all' && value !== ''),
    cacheHitRatio: metrics.isStale ? 0 : 1
  }), [metrics, filteredData.length, paginatedData.length, filters]);

  return {
    // Dados paginados
    data: paginatedData,
    filteredData,
    
    // Estados
    isLoading,
    isError,
    isFetching,
    
    // Configurações
    pagination: paginationConfig,
    filters,
    
    // Funções de controle
    goToPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
    changePageSize,
    updateFilters,
    resetFilters,
    
    // Cache e refresh
    invalidateCache,
    forceRefresh,
    
    // Métricas
    metrics: consolidatedMetrics
  };
};
